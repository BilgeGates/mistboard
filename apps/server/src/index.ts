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

type Client = {
  devViews: boolean;
  id: string;
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
  randomEngine: boolean;
  pendingWrites: Promise<void>;
  gameEndRecorded: boolean;
};

const rooms = new Map<string, Room>();
const port = Number(process.env.PORT ?? 3001);

const persistenceErrors: Array<{ at: number; roomId: string; eventType: string }> = [];
const PERSISTENCE_ERROR_RETENTION_MS = 3_600_000;

const staticDir = resolveStaticDir();

await initPersistence();

const server = createServer(handleHttpRequest);
const wss = new WebSocketServer({ server });

wss.on('connection', (socket, request) => {
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

async function initPersistence(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
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

  if (url === '/health') {
    const cutoff1m = Date.now() - 60_000;
    const recent = persistenceErrors.filter((entry) => entry.at > cutoff1m);
    const lastAt = persistenceErrors.length > 0
      ? persistenceErrors[persistenceErrors.length - 1]!.at
      : null;
    const ok = recent.length === 0;
    response.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      ok,
      persistence: persistence.isInitialized() ? 'enabled' : 'disabled',
      persistenceErrors: { count1m: recent.length, lastAt },
    }));
    return;
  }

  if (url.startsWith('/api/')) {
    void handleApiRequest(url, response).catch((err) => {
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

  void serveHandler(request, response, { public: staticDir });
}

async function handleApiRequest(url: string, response: ServerResponse): Promise<void> {
  if (!persistence.isInitialized()) {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'persistence_disabled' }));
    return;
  }

  if (url === '/api/featured-games') {
    const games = await persistence.listCorpusGames();
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ games }));
    return;
  }

  const eventsMatch = url.match(/^\/api\/games\/([^/]+)\/events$/);
  if (eventsMatch) {
    const roomId = decodeURIComponent(eventsMatch[1]!);
    const events = await persistence.loadRoom(roomId);
    if (!events) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ events }));
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not_found' }));
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
  const devViews = randomEngine || url.searchParams.get('views') === 'all';
  const room = await getOrCreateRoom(roomId, parseVariantId(url.searchParams.get('variant')));
  if (randomEngine) await enableRandomEngine(room);
  const clientId = randomUUID();
  const client: Client = {
    devViews,
    id: clientId,
    socket,
    roomId,
    seat: solo ? 'spectator' : await assignSeat(room, clientId),
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
  if (
    room.projection.state.status.type === 'pregame'
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
    randomEngine: false,
    pendingWrites: Promise.resolve(),
    gameEndRecorded: projection.state.status.type === 'finished',
  };
  rooms.set(roomId, room);
  scheduleClockTimeout(room);
  return room;
}

async function assignSeat(room: Room, clientId: string): Promise<Seat> {
  if (!room.projection.seats.white) {
    await appendEvent(room, {
      type: 'seat-assigned',
      at: Date.now(),
      roomId: room.id,
      clientId,
      seat: 'white',
    });
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

  const moves = variantForId(room.projection.variant).getLegalMoves(room.projection.state, 'black');
  if (moves.length === 0) return;
  const move = moves[randomInt(moves.length)];
  if (!move) return;
  await appendEvent(room, {
    type: 'move-played',
    at: Date.now(),
    roomId: room.id,
    color: 'black',
    move,
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

function parseMessage(raw: string): { type: string; bidMs?: number; startId?: number; color?: string; from?: string; to?: string; promotion?: string } | null {
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

function roomIdToSeed(roomId: string): number {
  let hash = 0;
  for (const char of roomId) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return hash;
}
