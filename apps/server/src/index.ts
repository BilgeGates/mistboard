import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomInt, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import serveHandler from 'serve-handler';
import { WebSocketServer, WebSocket } from 'ws';
import {
  advanceClock,
  clockRemainingMs,
  createClock,
  defaultClockInitialMs,
  expireClock,
  replayGameEvents,
  pickDraft960Offer,
  variantForId,
  type Color,
  type GameEvent,
  type GameProjection,
  type Move,
  type PieceRole,
  type Square,
  type VariantId,
} from '@bichess/game';
import { runMigrations } from './migrate.js';
import * as persistence from './persistence.js';
import type { GameSummary } from './persistence.js';
import { snapshotPayload, type Seat } from './payloads.js';
import {
  adminDebugTokenFromProtocolHeader,
  canObserveLiveRoom,
  eventReplayResponse,
  isAdminDebugToken,
  isAllowedWebSocketOrigin,
  isDatabaseRequired,
  isProductionLikeRuntime,
  modeForProjection,
  parsePositiveInteger,
  recordMessageTimestamp,
} from './server-policy.js';

type Client = {
  debugRequested: boolean;
  devViews: boolean;
  id: string;
  messageTimestamps: number[];
  socket: WebSocket;
  roomId: string;
  seat: Seat;
  solo: boolean;
};

type Room = {
  id: string;
  clients: Set<Client>;
  events: GameEvent[];
  projection: GameProjection;
  clockTimer: ReturnType<typeof setTimeout> | null;
  mode: persistence.GameMode;
  randomEngine: boolean;
  pendingWrites: Promise<void>;
  gameEndRecorded: boolean;
};

const rooms = new Map<string, Room>();
const port = Number(process.env.PORT ?? 3001);
const databaseRequired = isDatabaseRequired();
const wsMaxPayloadBytes = parsePositiveInteger(process.env.BICHESS_WS_MAX_PAYLOAD_BYTES) ?? 8_192;
const wsMessageLimit = parsePositiveInteger(process.env.BICHESS_WS_MESSAGE_LIMIT) ?? 40;
const wsMessageWindowMs = parsePositiveInteger(process.env.BICHESS_WS_MESSAGE_WINDOW_MS) ?? 10_000;
const shutdownGraceMs = parsePositiveInteger(process.env.BICHESS_SHUTDOWN_GRACE_MS) ?? 10_000;
const liveClockInitialMs = 30_000;
const liveClockIncrementMs = 2_000;

const persistenceErrors: Array<{ at: number; roomId: string; eventType: string }> = [];
const PERSISTENCE_ERROR_RETENTION_MS = 3_600_000;

const staticDir = resolveStaticDir();

await initPersistence();

const server = createServer(handleHttpRequest);
const wss = new WebSocketServer({ server, maxPayload: wsMaxPayloadBytes });
let shuttingDown = false;

wss.on('connection', (socket, request) => {
  if (!isAllowedWebSocketRequest(request)) {
    socket.close(1008, 'origin not allowed');
    return;
  }
  void handleConnection(socket, request).catch((err) => {
    console.error(JSON.stringify({
      level: 'error',
      kind: 'connection_handler_failure',
      error: (err as Error).message,
      at: Date.now(),
    }));
    try { socket.close(1011, 'internal error'); } catch { /* socket already closed */ }
  });
});

server.listen(port, () => {
  console.log(`bichess server listening on http://localhost:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

async function initPersistence(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    if (databaseRequired) {
      throw new Error('DATABASE_URL is required in this runtime; set BICHESS_ALLOW_IN_MEMORY_PERSISTENCE=true only for intentional ephemeral environments');
    }
    console.log('persistence: disabled (set DATABASE_URL to enable)');
    return;
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const applied = await runMigrations(client);
    if (applied.length > 0) console.log(`migrations applied: ${applied.join(', ')}`);
  } finally {
    await client.end();
  }
  persistence.init(databaseUrl);
  console.log('persistence: enabled');
}

function handleHttpRequest(request: IncomingMessage, response: ServerResponse): void {
  const url = request.url ?? '/';
  const pathname = url.split('?', 1)[0] ?? '/';

  if (url === '/health') {
    const cutoff1m = Date.now() - 60_000;
    const recent = persistenceErrors.filter((entry) => entry.at > cutoff1m);
    const lastAt = persistenceErrors.length > 0
      ? persistenceErrors[persistenceErrors.length - 1]!.at
      : null;
    const ok = recent.length === 0 && (!databaseRequired || persistence.isInitialized());
    response.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      ok,
      databaseRequired,
      persistence: persistence.isInitialized() ? 'enabled' : 'disabled',
      persistenceErrors: { count1m: recent.length, lastAt },
    }));
    return;
  }

  if (url.startsWith('/api/')) {
    void handleApiRequest(request, response).catch((err) => {
      console.error(JSON.stringify({
        level: 'error',
        kind: 'api_handler_failure',
        url,
        error: (err as Error).message,
        at: Date.now(),
      }));
      if (!response.headersSent) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'internal_error' }));
      }
    });
    return;
  }

  if (isClientRoute(pathname)) {
    request.url = '/';
  }

  void serveHandler(request, response, { public: staticDir });
}

function isClientRoute(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/about'
    || normalized === '/learn'
    || normalized === '/play'
    || normalized === '/watch'
    || normalized === '/engine-lab'
    || normalized === '/arena'
    || normalized.startsWith('/game/')
    || normalized.startsWith('/room/');
}

async function handleApiRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = request.url ?? '/';
  const method = request.method ?? 'GET';

  if (url === '/api/rooms') {
    if (method !== 'POST') {
      response.writeHead(405, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }
    const body = await readJsonBody(request);
    const mode = parseRoomMode(body);
    const variant = parseVariantId(typeof body.variant === 'string' ? body.variant : null);
    if (!mode) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid_mode' }));
      return;
    }
    if (databaseRequired && !persistence.isInitialized()) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'persistence_disabled' }));
      return;
    }
    const room = await createRoom(mode, variant);
    response.writeHead(201, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ roomId: room.id, url: `/room/${encodeURIComponent(room.id)}`, mode: room.mode }));
    return;
  }

  if (!persistence.isInitialized()) {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'persistence_disabled' }));
    return;
  }

  if (url === '/api/featured-games') {
    const corpusId = process.env.FEATURED_CORPUS_ID ?? 'tier1-self-v1';
    const games = await persistence.listCorpusGames(corpusId);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ games }));
    return;
  }

  if (url === '/api/eve-games/recent') {
    const games = await persistence.listRecentEveGames();
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ games }));
    return;
  }

  const summaryMatch = url.match(/^\/api\/games\/([^/]+)$/);
  if (summaryMatch) {
    const roomId = decodeURIComponent(summaryMatch[1]!);
    const game = await persistence.getGameSummary(roomId);
    if (!game) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ game }));
    return;
  }

  const eventsMatch = url.match(/^\/api\/games\/([^/]+)\/events$/);
  if (eventsMatch) {
    const roomId = decodeURIComponent(eventsMatch[1]!);
    const events = await persistence.loadRoom(roomId);
    const replayResponse = eventReplayResponse(events);
    response.writeHead(replayResponse.status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(replayResponse.body));
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not_found' }));
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > 16_384) throw new Error('request_body_too_large');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf-8');
  const parsed = JSON.parse(raw) as unknown;
  return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
}

function parseRoomMode(body: Record<string, unknown>): 'pvp' | 'pve' | null {
  if (body.mode === 'pvp' || body.mode === 'pve') return body.mode;
  return null;
}

function resolveStaticDir(): string {
  if (process.env.STATIC_DIR) return resolve(process.env.STATIC_DIR);
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/index.js → ../../web/dist; src/index.ts (tsx dev) → same path
  return resolve(here, '..', '..', 'web', 'dist');
}

async function handleConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const roomId = url.searchParams.get('room') ?? 'dev-room';
  if (url.searchParams.get('reset') === '1') resetRoom(roomId);
  const devMode = url.searchParams.get('dev');
  const solo = devMode === 'solo';
  const randomEngine = devMode === 'engine' || url.searchParams.get('engine') === 'random';
  const debugRequested = randomEngine || url.searchParams.get('views') === 'all';
  const devViews = debugRequested && isDebugViewAuthorized(request);
  const room = await getOrCreateRoom(roomId, parseVariantId(url.searchParams.get('variant')));
  if (randomEngine) await enableRandomEngine(room);
  const clientId = parseClientId(url.searchParams.get('client')) ?? randomUUID();
  const seat = solo ? 'spectator' : await assignSeat(room, clientId);
  if (seat === 'spectator' && !solo && !canObserveLiveRoom(room.projection, room.mode)) {
    socket.close(1008, 'private room');
    return;
  }
  const client: Client = {
    debugRequested,
    devViews,
    id: clientId,
    messageTimestamps: [],
    socket,
    roomId,
    seat,
    solo,
  };
  room.clients.add(client);

  const snapshot = snapshotPayload(room, client);
  send(client, {
    ...snapshot,
    type: 'hello',
    clientId: client.id,
    offer: room.projection.offer,
  });
  broadcastSnapshot(room);

  socket.on('message', (raw) => {
    if (!recordClientMessage(client)) {
      socket.close(1008, 'rate limit');
      return;
    }
    void handleMessage(room, client, raw.toString());
  });

  socket.on('close', () => {
    void handleClose(room, client);
  });
}

async function handleMessage(room: Room, client: Client, raw: string): Promise<void> {
  const message = parseMessage(raw);
  if (!message) return;
  try {
    if (message.type === 'ping') send(client, { type: 'pong', at: Date.now() });
    if (message.type === 'admin-debug-auth') {
      handleAdminDebugAuth(room, client, typeof message.token === 'string' ? message.token : undefined);
      return;
    }
    if (message.type === 'select-start') {
      await selectStart(room, client, message.startId, message.color);
    }
    if (message.type === 'submit-bid') {
      await submitBid(room, client, message.bidMs, message.color);
    }
    if (message.type === 'move' && typeof message.from === 'string' && typeof message.to === 'string') {
      await playMove(room, client, {
        type: 'move',
        from: message.from,
        to: message.to,
        promotion: message.promotion,
      });
    }
  } catch (err) {
    if (err instanceof PersistenceFailure) {
      send(client, { type: 'error', reason: 'persistence_failure' });
      return;
    }
    throw err;
  }
}

async function handleClose(room: Room, client: Client): Promise<void> {
  room.clients.delete(client);
  const beforeFirstMove = room.projection.state.moveNumber === 1 && room.projection.state.lastMove === undefined;
  const clockStarted = room.projection.state.clock !== undefined;
  if (
    (room.projection.state.status.type === 'pregame' || beforeFirstMove)
    && !clockStarted
    && client.seat !== 'spectator'
    && room.projection.seats[client.seat] === client.id
  ) {
    try {
      await appendEvent(room, {
        type: 'seat-vacated',
        at: Date.now(),
        roomId: room.id,
        clientId: client.id,
        seat: client.seat,
      });
    } catch (err) {
      // Already logged inside appendEvent. Don't crash the close handler.
      if (!(err instanceof PersistenceFailure)) throw err;
    }
  }
  broadcastSnapshot(room);
}

async function getOrCreateRoom(roomId: string, variant: VariantId): Promise<Room> {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  let events: GameEvent[] | null = null;
  if (persistence.isInitialized()) {
    try {
      events = await persistence.loadRoom(roomId);
    } catch (err) {
      console.error(JSON.stringify({
        level: 'error',
        kind: 'persistence_load_failure',
        roomId,
        error: (err as Error).message,
        at: Date.now(),
      }));
      events = null;
    }
  }

  if (!events) {
    const created: GameEvent = {
      type: 'room-created',
      at: Date.now(),
      roomId,
      variant,
      offer: variant === 'draft960' ? pickDraft960Offer(roomIdToSeed(roomId)) : [],
    };
    if (persistence.isInitialized()) {
      try {
        await persistence.appendEvent(roomId, 0, created);
      } catch (err) {
        recordPersistenceError(roomId, 0, created, err as Error);
        throw new PersistenceFailure();
      }
    }
    events = [created];
  }

  const projection = replayGameEvents(events);
  const room: Room = {
    id: roomId,
    clients: new Set(),
    events,
    projection,
    clockTimer: null,
    mode: modeForProjection(projection),
    randomEngine: projection.seats.black === 'random-engine',
    pendingWrites: Promise.resolve(),
    gameEndRecorded: projection.state.status.type === 'finished',
  };
  rooms.set(roomId, room);
  scheduleClockTimeout(room);
  return room;
}

async function createRoom(mode: 'pvp' | 'pve', variant: VariantId): Promise<Room> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomId = randomUUID();
    const existing = rooms.get(roomId) ?? (persistence.isInitialized() ? await persistence.loadRoom(roomId) : null);
    if (existing) continue;

    const at = Date.now();
    const events: GameEvent[] = [{
      type: 'room-created',
      at,
      roomId,
      variant,
      offer: variant === 'draft960' ? pickDraft960Offer(roomIdToSeed(roomId)) : [],
    }];
    if (mode === 'pve') {
      events.push({
        type: 'seat-assigned',
        at,
        roomId,
        clientId: 'random-engine',
        seat: 'black',
      });
    }

    if (persistence.isInitialized()) {
      for (const [seq, event] of events.entries()) {
        try {
          await persistence.appendEvent(roomId, seq, event);
        } catch (err) {
          recordPersistenceError(roomId, seq, event, err as Error);
          throw new PersistenceFailure();
        }
      }
    }

    const projection = replayGameEvents(events);
    const room: Room = {
      id: roomId,
      clients: new Set(),
      events,
      projection,
      clockTimer: null,
      mode,
      randomEngine: mode === 'pve',
      pendingWrites: Promise.resolve(),
      gameEndRecorded: false,
    };
    rooms.set(roomId, room);
    scheduleClockTimeout(room);
    return room;
  }
  throw new Error('room_id_collision');
}

async function assignSeat(room: Room, clientId: string): Promise<Seat> {
  if (room.projection.seats.white === clientId) {
    await startLiveClockIfReady(room);
    return 'white';
  }
  if (room.projection.seats.black === clientId) {
    await startLiveClockIfReady(room);
    return 'black';
  }
  if (!room.projection.seats.white) {
    await appendEvent(room, {
      type: 'seat-assigned',
      at: Date.now(),
      roomId: room.id,
      clientId,
      seat: 'white',
    });
    await startLiveClockIfReady(room);
    return 'white';
  }
  if (!room.projection.seats.black) {
    await appendEvent(room, {
      type: 'seat-assigned',
      at: Date.now(),
      roomId: room.id,
      clientId,
      seat: 'black',
    });
    await startLiveClockIfReady(room);
    return 'black';
  }
  return 'spectator';
}

async function enableRandomEngine(room: Room): Promise<void> {
  room.randomEngine = true;
  if (room.projection.variant !== 'fog-of-war') return;
  if (room.projection.seats.black) return;
  await appendEvent(room, {
    type: 'seat-assigned',
    at: Date.now(),
    roomId: room.id,
    clientId: 'random-engine',
    seat: 'black',
  });
}

async function selectStart(room: Room, client: Client, startId: number | undefined, color: string | undefined): Promise<void> {
  const selectionColor = client.solo && isColor(color) ? color : client.seat;
  if (selectionColor === 'spectator') return;
  if (room.projection.state.status.type !== 'pregame') return;
  if (!room.projection.offer.some((start) => start.id === startId)) return;
  if (startId === undefined) return;

  await appendEvent(room, {
    type: 'draft-start-selected',
    at: Date.now(),
    roomId: room.id,
    color: selectionColor,
    startId,
  });
  await resolveStartIfReady(room);
  broadcastSnapshot(room);
}

async function submitBid(room: Room, client: Client, bidMs: number | undefined, color: string | undefined): Promise<void> {
  if (room.projection.variant !== 'bid-for-white') return;
  if (room.projection.state.status.type !== 'pregame') return;

  const biddingSeat = client.solo && isColor(color) ? color : client.seat;
  if (biddingSeat === 'spectator') return;
  if (typeof bidMs !== 'number' || !Number.isInteger(bidMs)) return;

  const requestedBidMs = bidMs;
  const boundedBidMs = Math.max(0, Math.min(requestedBidMs, defaultClockInitialMs - 1000));
  await appendEvent(room, {
    type: 'bid-submitted',
    at: Date.now(),
    roomId: room.id,
    color: biddingSeat,
    bidMs: boundedBidMs,
  });
  await resolveBidIfReady(room);
  broadcastSnapshot(room);
}

async function playMove(room: Room, client: Client, move: ClientMoveMessage): Promise<void> {
  if (room.projection.state.status.type !== 'playing') return;
  const now = Date.now();
  const moveColor = room.projection.state.status.turn;
  if (!client.solo && (client.seat === 'spectator' || moveColor !== client.seat)) return;
  if (room.projection.state.clock && clockRemainingMs(room.projection.state.clock, moveColor, now) <= 0) {
    await expireActiveClock(room, moveColor, now);
    broadcastSnapshot(room);
    return;
  }

  const requestedMove: Move = {
    from: move.from as Square,
    to: move.to as Square,
    promotion: isPromotionRole(move.promotion) ? move.promotion : undefined,
  };
  const nextState = variantForId(room.projection.variant).applyMove(room.projection.state, requestedMove);
  if (nextState === room.projection.state) return;
  const nextClock = advanceClock(room.projection.state.clock, now, moveColor, nextState.status);

  await appendEvent(room, {
    type: 'move-played',
    at: now,
    roomId: room.id,
    clock: nextClock,
    color: moveColor,
    move: requestedMove,
  });
  await playRandomEngineMoveIfReady(room);
  broadcastSnapshot(room);
}

async function playRandomEngineMoveIfReady(room: Room): Promise<void> {
  if (!room.randomEngine) return;
  if (room.projection.variant !== 'fog-of-war') return;
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.state.status.turn !== 'black') return;

  const now = Date.now();
  if (room.projection.state.clock && clockRemainingMs(room.projection.state.clock, 'black', now) <= 0) {
    await expireActiveClock(room, 'black', now);
    return;
  }

  const moves = variantForId(room.projection.variant).getLegalMoves(room.projection.state, 'black');
  if (moves.length === 0) return;
  const move = moves[randomInt(moves.length)];
  if (!move) return;
  const nextState = variantForId(room.projection.variant).applyMove(room.projection.state, move);
  if (nextState === room.projection.state) return;
  const nextClock = advanceClock(room.projection.state.clock, now, 'black', nextState.status);
  await appendEvent(room, {
    type: 'move-played',
    at: now,
    roomId: room.id,
    clock: nextClock,
    color: 'black',
    move,
  });
}

async function startLiveClockIfReady(room: Room): Promise<void> {
  if (room.projection.variant !== 'fog-of-war') return;
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.state.clock) return;
  if (!room.projection.seats.white || !room.projection.seats.black) return;

  const now = Date.now();
  await appendEvent(room, {
    type: 'clock-started',
    at: now,
    roomId: room.id,
    clock: createClock(now, liveClockInitialMs, liveClockIncrementMs),
  });
}

async function resolveStartIfReady(room: Room): Promise<void> {
  if (room.projection.resolvedStartId !== null) return;

  const whiteSelection = room.projection.selections.white;
  const blackSelection = room.projection.selections.black;
  if (whiteSelection === undefined || blackSelection === undefined) return;

  const resolvedStartId = whiteSelection === blackSelection
    ? whiteSelection
    : [whiteSelection, blackSelection][randomInt(2)];
  const resolvedStart = room.projection.offer.find((start) => start.id === resolvedStartId);
  if (!resolvedStart) return;
  const now = Date.now();

  await appendEvent(room, {
    type: 'draft-start-resolved',
    at: now,
    roomId: room.id,
    clock: createClock(now),
    startId: resolvedStart.id,
  });
}

async function resolveBidIfReady(room: Room): Promise<void> {
  if (room.projection.variant !== 'bid-for-white') return;
  if (room.projection.state.status.type !== 'pregame') return;

  const whiteBid = room.projection.bids.white;
  const blackBid = room.projection.bids.black;
  if (whiteBid === undefined || blackBid === undefined) return;

  const whiteSeat: Color = whiteBid === blackBid
    ? (randomInt(2) === 0 ? 'white' : 'black')
    : (whiteBid > blackBid ? 'white' : 'black');
  const blackSeat: Color = whiteSeat === 'white' ? 'black' : 'white';
  const winningBidMs = whiteSeat === 'white' ? whiteBid : blackBid;
  const now = Date.now();
  const clock = createClock(now);
  const adjustedClock = {
    ...clock,
    remainingMs: {
      ...clock.remainingMs,
      white: Math.max(0, clock.remainingMs.white - winningBidMs),
    },
  };

  await appendEvent(room, {
    type: 'bid-resolved',
    at: now,
    roomId: room.id,
    bids: { white: whiteBid, black: blackBid },
    blackSeat,
    clock: adjustedClock,
    winner: whiteBid === blackBid ? null : whiteSeat,
    whiteSeat,
    winningBidMs,
  });
  reconcileClientSeats(room);
}

function reconcileClientSeats(room: Room): void {
  for (const client of room.clients) {
    if (room.projection.seats.white === client.id) client.seat = 'white';
    if (room.projection.seats.black === client.id) client.seat = 'black';
  }
}

function broadcastSnapshot(room: Room): void {
  for (const client of room.clients) {
    send(client, snapshotPayload(room, client));
  }
}

async function appendEvent(room: Room, event: GameEvent): Promise<void> {
  // Serialize per-room writes. Chaining onto pendingWrites guarantees
  // sequence assignment is atomic with the persistence write.
  const myWrite = room.pendingWrites.then(async () => {
    const seq = room.events.length;
    if (persistence.isInitialized()) {
      try {
        await persistence.appendEvent(room.id, seq, event);
      } catch (err) {
        recordPersistenceError(room.id, seq, event, err as Error);
        throw new PersistenceFailure();
      }
    }
    room.events.push(event);
    room.projection = replayGameEvents(room.events);
    room.mode = modeForProjection(room.projection);
    scheduleClockTimeout(room);

    if (
      persistence.isInitialized()
      && room.projection.state.status.type === 'finished'
      && !room.gameEndRecorded
    ) {
      room.gameEndRecorded = true;
      try {
        await persistence.recordGameEnd(room.id, buildGameSummary(room));
      } catch (err) {
        // Events are durable; the games-row aggregate can be backfilled.
        // Log loudly so it's visible.
        console.error(JSON.stringify({
          level: 'error',
          kind: 'game_end_record_failure',
          roomId: room.id,
          error: (err as Error).message,
          at: Date.now(),
        }));
      }
    }
  });
  // Don't break the chain if this write rejects — caller surfaces the error.
  room.pendingWrites = myWrite.catch(() => {});
  await myWrite;
}

function buildGameSummary(room: Room): GameSummary {
  const status = room.projection.state.status;
  if (status.type !== 'finished') {
    throw new Error('buildGameSummary called on non-terminal state');
  }
  const result: GameSummary['result'] = status.winner === 'white' ? 'white-wins'
    : status.winner === 'black' ? 'black-wins'
    : 'draw';

  // status.reason is loosely typed as string in @bichess/game; narrow here.
  const termination = status.reason as GameSummary['termination'];

  const moveEvents = room.events.filter((e) => e.type === 'move-played');
  const firstAt = room.events[0]?.at ?? Date.now();
  const lastAt = room.events[room.events.length - 1]?.at ?? Date.now();

  return {
    variant: room.projection.variant,
    mode: room.mode,
    result,
    termination,
    plyCount: moveEvents.length,
    startedAt: new Date(firstAt),
    endedAt: new Date(lastAt),
    whiteClient: room.projection.seats.white ?? null,
    blackClient: room.projection.seats.black ?? null,
    whiteName: null,
    blackName: null,
    corpusId: null,
  };
}

function recordPersistenceError(roomId: string, seq: number, event: GameEvent, err: Error): void {
  const entry = { at: Date.now(), roomId, eventType: event.type };
  persistenceErrors.push(entry);
  const cutoff = Date.now() - PERSISTENCE_ERROR_RETENTION_MS;
  while (persistenceErrors.length > 0 && persistenceErrors[0]!.at < cutoff) {
    persistenceErrors.shift();
  }
  console.error(JSON.stringify({
    level: 'error',
    kind: 'persistence_failure',
    roomId,
    seq,
    eventType: event.type,
    error: err.message,
    at: entry.at,
  }));
}

class PersistenceFailure extends Error {
  constructor() {
    super('persistence_failure');
    this.name = 'PersistenceFailure';
  }
}

function resetRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (room?.clockTimer) clearTimeout(room.clockTimer);
  rooms.delete(roomId);
}

function scheduleClockTimeout(room: Room): void {
  if (room.clockTimer) clearTimeout(room.clockTimer);
  room.clockTimer = null;

  const { clock, status } = room.projection.state;
  if (!clock || status.type !== 'playing' || !clock.activeColor) return;

  const activeColor = clock.activeColor;
  const delay = clockRemainingMs(clock, activeColor, Date.now());
  room.clockTimer = setTimeout(() => {
    if (room.projection.state.status.type !== 'playing') return;
    if (room.projection.state.status.turn !== activeColor) return;
    void expireActiveClock(room, activeColor, Date.now())
      .then(() => broadcastSnapshot(room))
      .catch((err) => {
        if (!(err instanceof PersistenceFailure)) {
          console.error(JSON.stringify({
            level: 'error',
            kind: 'clock_expire_failure',
            roomId: room.id,
            error: (err as Error).message,
            at: Date.now(),
          }));
        }
      });
  }, delay + 25);
}

async function expireActiveClock(room: Room, color: Color, at: number): Promise<void> {
  const clock = expireClock(room.projection.state.clock, at, color);
  if (!clock) return;
  await appendEvent(room, {
    type: 'clock-expired',
    at,
    roomId: room.id,
    color,
    clock,
  });
}

function send(client: Client, payload: unknown): void {
  client.socket.send(JSON.stringify(payload));
}

type ClientMoveMessage = {
  type: 'move';
  from: string;
  to: string;
  promotion?: string;
};

function parseMessage(raw: string): { type: string; bidMs?: number; startId?: number; color?: string; from?: string; to?: string; promotion?: string; token?: string } | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value === 'object' && value !== null && 'type' in value) {
      return value as { type: string; startId?: number };
    }
  } catch {
    return null;
  }
  return null;
}

function isPromotionRole(value: string | undefined): value is Exclude<PieceRole, 'king' | 'pawn'> {
  return value === 'queen' || value === 'rook' || value === 'bishop' || value === 'knight';
}

function isColor(value: string | undefined): value is Color {
  return value === 'white' || value === 'black';
}

function parseVariantId(value: string | null): VariantId {
  if (value === 'draft960') return 'draft960';
  if (value === 'bid-for-white') return 'bid-for-white';
  return 'fog-of-war';
}

function parseClientId(value: string | null): string | null {
  if (!value) return null;
  return /^[a-zA-Z0-9:_-]{8,80}$/.test(value) ? value : null;
}

function roomIdToSeed(roomId: string): number {
  let hash = 0;
  for (const char of roomId) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return hash;
}

function handleAdminDebugAuth(room: Room, client: Client, token: string | undefined): void {
  if (!client.debugRequested) {
    send(client, { type: 'error', reason: 'debug_not_requested' });
    return;
  }
  if (!isAdminDebugToken(token)) {
    send(client, { type: 'error', reason: 'debug_unauthorized' });
    return;
  }
  client.devViews = true;
  send(client, snapshotPayload(room, client));
}

function isDebugViewAuthorized(request: IncomingMessage): boolean {
  if (!isProductionLikeRuntime()) return true;
  return isAdminDebugToken(adminDebugTokenFromProtocolHeader(request.headers['sec-websocket-protocol']));
}

function isAllowedWebSocketRequest(request: IncomingMessage): boolean {
  return isAllowedWebSocketOrigin(request.headers.origin, request.headers.host);
}

function recordClientMessage(client: Client): boolean {
  return recordMessageTimestamp(client.messageTimestamps, Date.now(), wsMessageLimit, wsMessageWindowMs);
}

async function shutdown(signal: 'SIGINT' | 'SIGTERM'): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: 'info', kind: 'server_shutdown_requested', signal, at: Date.now() }));

  const forceExit = setTimeout(() => {
    console.error(JSON.stringify({ level: 'error', kind: 'server_shutdown_timeout', signal, at: Date.now() }));
    process.exit(1);
  }, shutdownGraceMs);
  forceExit.unref();

  for (const room of rooms.values()) {
    if (room.clockTimer) clearTimeout(room.clockTimer);
  }
  for (const client of [...rooms.values()].flatMap((room) => [...room.clients])) {
    try { client.socket.close(1001, 'server shutting down'); } catch { /* socket already closed */ }
  }

  let exitCode = 0;
  try {
    await Promise.allSettled([...rooms.values()].map((room) => room.pendingWrites));
    await closeWebSocketServer();
    await closeHttpServer();
    await persistence.close();
  } catch (err) {
    exitCode = 1;
    console.error(JSON.stringify({
      level: 'error',
      kind: 'server_shutdown_failure',
      error: (err as Error).message,
      at: Date.now(),
    }));
  } finally {
    clearTimeout(forceExit);
  }
  process.exit(exitCode);
}

function closeWebSocketServer(): Promise<void> {
  return new Promise((resolve) => {
    wss.close(() => resolve());
  });
}

function closeHttpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
