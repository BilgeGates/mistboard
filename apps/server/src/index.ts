import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import serveHandler from 'serve-handler';
import { WebSocketServer, WebSocket } from 'ws';
import {
  advanceClock,
  type Chess960Start,
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
  type RoomTimeControl,
  type Square,
  type VariantId,
} from '@mistboard/game';
import { runMigrations } from './migrate.js';
import * as persistence from './persistence.js';
import type { GameSummary } from './persistence.js';
import {
  engineVersionDisplayName,
  isPlayableLiveEngineClientId,
  loadEngine,
  playableLiveEngines,
} from './engine-registry.js';
import { chooseLiveEngineMove, type LiveEngineFallbackEvent } from './live-engine.js';
import { snapshotPayload, type Seat } from './payloads.js';
import {
  adminDebugTokenFromProtocolHeader,
  canObserveLiveRoom,
  isAdminDebugToken,
  isServerEngineClient,
  isAllowedWebSocketOrigin,
  isDatabaseRequired,
  isProductionLikeRuntime,
  modeForProjection,
  parseNonNegativeInteger,
  parsePositiveInteger,
  recordMessageTimestamp,
  seatTokenFromProtocolHeader,
} from './server-policy.js';
import type { Client, LobbyTicket, Room, SeatAssignment, SeatTokenState } from './server-types.js';
import { currentAccountUser, hashSecret } from './account-session.js';
import {
  handleApiRequest,
  parseHiddenDraft960,
  parseRoomTimeControl,
  parseVariantId,
  type HttpApiContext,
} from './http-api.js';

// Navigation index — grep for section name to jump to the right block
// Account/auth           → ./account-session.ts  (currentAccountUser, hashSecret, session cookies)
// HTTP API handlers      → ./http-api.ts          (handleApiRequest, lobby, game data, auth endpoints)
// SECTION: Types and constants          (~line 93)    module-scope maps and config constants
// SECTION: Server init and HTTP entry   (~line 150)   initPersistence, handleHttpRequest, static file serving
// SECTION: WebSocket connection handling (~line 250)  handleConnection, handleMessage, handleClose, getOrCreateRoom, createRoom, runAbortPolicySweep
// SECTION: Seat management              (~line 600)   assignSeat, existingSeatAssignment, newSeatAssignment, verifySeatToken, displaceOlderSeatClients, canClientAct
// SECTION: Game flow                    (~line 740)   enableRandomEngine, selectStart, submitBid, playMove, playRandomEngineMoveIfReady, resolveStartIfReady, resolveBidIfReady
// SECTION: Seat token persistence       (~line 1020)  reconcileClientSeats, reconciledSeatTokens, seatTokenStatesFromPersistence, persistSeatToken, replaceSeatTokens
// SECTION: Room event infrastructure    (~line 1115)  broadcastSnapshot, appendEvent, buildGameSummary, scheduleClockTimeout, expireActiveClock, resetRoom
// SECTION: Helpers and shutdown         (~line 1390)  send, parseMessage, isPromotionRole, isColor, roomCreatedDraftOfferFields, shutdown

// ── SECTION: Types and constants ───────────────────────────────────────────
// Core server types live in ./server-types.ts — Client, Room, SeatTokenState, SeatAssignment, LobbyTicket

const rooms = new Map<string, Room>();
const lobbyTickets = new Map<string, LobbyTicket>();
const lobbyQueue: LobbyTicket[] = [];
const port = Number(process.env.PORT ?? 3001);
const databaseRequired = isDatabaseRequired();
const wsMaxPayloadBytes = parsePositiveInteger(process.env.MISTBOARD_WS_MAX_PAYLOAD_BYTES) ?? 8_192;
const wsMessageLimit = parsePositiveInteger(process.env.MISTBOARD_WS_MESSAGE_LIMIT) ?? 40;
const wsMessageWindowMs = parsePositiveInteger(process.env.MISTBOARD_WS_MESSAGE_WINDOW_MS) ?? 10_000;
const shutdownGraceMs = parsePositiveInteger(process.env.MISTBOARD_SHUTDOWN_GRACE_MS) ?? 10_000;
const liveClockInitialMs = 180_000;
const liveClockIncrementMs = 2_000;
const pveEngineMoveDelayMs = parsePositiveInteger(process.env.MISTBOARD_PVE_ENGINE_DELAY_MS) ?? 650;
const liveEngineTimeoutMs = parsePositiveInteger(process.env.MISTBOARD_LIVE_ENGINE_TIMEOUT_MS) ?? 3_000;
const guestPrestartAbortMs = parseNonNegativeInteger(process.env.MISTBOARD_GUEST_PRESTART_ABORT_MS) ?? 15 * 60 * 1000;
const abortPolicySweepMs = parsePositiveInteger(process.env.MISTBOARD_ABORT_POLICY_SWEEP_MS) ?? 60_000;
const pveBuiltinEngineClientId = 'builtin-random-legal';
const persistenceErrors: Array<{ at: number; roomId: string; eventType: string }> = [];
const PERSISTENCE_ERROR_RETENTION_MS = 3_600_000;

const staticDir = resolveStaticDir();
const annotationsFile = resolveRepoPath('research', 'python-fow-lab', 'feedback', 'annotations.jsonl');

await initPersistence();
let abortPolicyTimer: ReturnType<typeof setInterval> | null = null;
startAbortPolicySweep();

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
  console.log(`mistboard server listening on http://localhost:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

// ── SECTION: Server init and HTTP entry ────────────────────────────────────
async function initPersistence(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    if (databaseRequired) {
      throw new Error('DATABASE_URL is required in this runtime; set MISTBOARD_ALLOW_IN_MEMORY_PERSISTENCE=true only for intentional ephemeral environments');
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
    const apiCtx: HttpApiContext = {
      rooms,
      lobbyTickets,
      lobbyQueue,
      databaseRequired,
      pveBuiltinEngineClientId,
      annotationsFile,
      liveClockInitialMs,
      liveClockIncrementMs,
      createRoom,
      inMemoryGameSummary,
    };
    void handleApiRequest(apiCtx, request, response).catch((err) => {
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
    || normalized === '/source'
    || normalized === '/account'
    || normalized === '/account/settings'
    || normalized === '/lab'
    || normalized === '/engine-lab'
    || normalized === '/arena'
    || normalized.startsWith('/game/')
    || normalized.startsWith('/@/')
    || normalized.startsWith('/room/');
}

function resolveRepoPath(...parts: string[]): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', ...parts);
}
function resolveStaticDir(): string {
  if (process.env.STATIC_DIR) return resolve(process.env.STATIC_DIR);
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/index.js → ../../web/dist; src/index.ts (tsx dev) → same path
  return resolve(here, '..', '..', 'web', 'dist');
}

// ── SECTION: WebSocket connection handling ─────────────────────────────────
async function handleConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const roomId = url.searchParams.get('room') ?? 'dev-room';
  if (url.searchParams.get('reset') === '1') resetRoom(roomId);
  if (await isAbortedRoom(roomId)) {
    socket.close(1008, 'room aborted');
    return;
  }
  const devMode = url.searchParams.get('dev');
  const solo = devMode === 'solo';
  const randomEngine = devMode === 'engine' || url.searchParams.get('engine') === 'random';
  const debugRequested = randomEngine || url.searchParams.get('views') === 'all';
  const devViews = debugRequested && isDebugViewAuthorized(request);
  const accountUser = await currentAccountUser(request);
  const room = await getOrCreateRoom(
    roomId,
    parseVariantId(url.searchParams.get('variant')),
    parseHiddenDraft960(url.searchParams.get('hiddenDraft960') ?? url.searchParams.get('draft960')),
  );
  if (randomEngine) await enableRandomEngine(room);
  const clientId = parseClientId(url.searchParams.get('client')) ?? randomUUID();
  const seatToken = seatTokenFromProtocolHeader(request.headers['sec-websocket-protocol']);
  const assignment = solo ? { seat: 'spectator' } satisfies SeatAssignment : await assignSeat(room, clientId, seatToken, accountUser);
  const seat = assignment.seat;
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
    seatTokenHash: assignment.seatTokenHash,
    displaced: false,
    solo,
  };
  room.clients.add(client);
  if (!solo && seat !== 'spectator') displaceOlderSeatClients(room, client);

  const snapshot = snapshotPayload(room, client);
  send(client, {
    ...snapshot,
    type: 'hello',
    clientId: client.id,
    offer: snapshot.offer,
    ...(assignment.seatToken ? { seatToken: assignment.seatToken } : {}),
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
  if (client.displaced) {
    broadcastSnapshot(room);
    return;
  }
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

async function getOrCreateRoom(roomId: string, variant: VariantId, hiddenDraft960 = false): Promise<Room> {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  let events: GameEvent[] | null = null;
  let createdNewPersistentRoom = false;
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
      ...roomCreatedDraftOfferFields(roomId, variant, hiddenDraft960),
    };
    if (persistence.isInitialized()) {
      try {
        await persistence.appendEvent(roomId, 0, created);
        createdNewPersistentRoom = true;
      } catch (err) {
        recordPersistenceError(roomId, 0, created, err as Error);
        throw new PersistenceFailure();
      }
    }
    events = [created];
  }

  const projection = replayGameEvents(events);
  const mode = modeForProjection(projection);
  if (createdNewPersistentRoom) {
    await persistGameStart(roomId, projection, mode, new Date(events[0]?.at ?? Date.now()));
  }
  const seatTokens = persistence.isInitialized()
    ? seatTokenStatesFromPersistence(await persistence.loadRoomSeatTokens(roomId))
    : {};
  const room: Room = {
    id: roomId,
    clients: new Set(),
    events,
    projection,
    seatTokens,
    clockTimer: null,
    engineTimer: null,
    mode,
    randomEngine: isPlayableLiveEngineClientId(projection.seats.black),
    pveEngineId: isPlayableLiveEngineClientId(projection.seats.black)
      ? canonicalEngineVersionId(projection.seats.black!)
      : null,
    pendingWrites: Promise.resolve(),
    gameEndRecorded: projection.state.status.type === 'finished',
  };
  rooms.set(roomId, room);
  scheduleClockTimeout(room);
  scheduleRandomEngineMove(room);
  return room;
}

async function createRoom(
  mode: 'pvp' | 'pve',
  variant: VariantId,
  engineId: string,
  hiddenDraft960 = false,
  timeControl?: RoomTimeControl,
): Promise<Room> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomId = randomUUID();
    const existing = rooms.get(roomId) ?? (persistence.isInitialized() ? await persistence.loadRoom(roomId) : null);
    if (existing) continue;

    const at = Date.now();
    const roomCreated: Extract<GameEvent, { type: 'room-created' }> = {
      type: 'room-created',
      at,
      roomId,
      variant,
      ...roomCreatedDraftOfferFields(roomId, variant, hiddenDraft960),
      ...(timeControl ? { timeControl } : {}),
    };
    const events: GameEvent[] = [roomCreated];
    if (mode === 'pve') {
      events.push({
        type: 'seat-assigned',
        at,
        roomId,
        clientId: engineId,
        seat: 'black',
      });
      const engineSelection = engineDraftSelectionEvent(roomCreated, roomId, at);
      if (engineSelection) events.push(engineSelection);
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
    if (persistence.isInitialized()) {
      await persistGameStart(roomId, projection, mode, new Date(at));
    }
    const room: Room = {
      id: roomId,
      clients: new Set(),
      events,
      projection,
      seatTokens: {},
      clockTimer: null,
      engineTimer: null,
      mode,
      randomEngine: mode === 'pve',
      pveEngineId: mode === 'pve' ? engineId : null,
      pendingWrites: Promise.resolve(),
      gameEndRecorded: false,
    };
    rooms.set(roomId, room);
    scheduleClockTimeout(room);
    scheduleRandomEngineMove(room);
    return room;
  }
  throw new Error('room_id_collision');
}

async function persistGameStart(
  roomId: string,
  projection: GameProjection,
  mode: persistence.GameMode,
  startedAt: Date,
): Promise<void> {
  if (!persistence.isInitialized()) return;
  try {
    await persistence.recordGameStart(roomId, {
      variant: projection.variant,
      mode,
      startedAt,
      whiteClient: projection.seats.white ?? null,
      blackClient: projection.seats.black ?? null,
      whiteName: null,
      blackName: null,
      corpusId: null,
    });
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      kind: 'game_start_record_failure',
      roomId,
      error: (err as Error).message,
      at: Date.now(),
    }));
    throw new PersistenceFailure();
  }
}

async function isAbortedRoom(roomId: string): Promise<boolean> {
  if (!persistence.isInitialized()) return false;
  const lifecycle = await persistence.getGameLifecycleStatus(roomId).catch((err) => {
    console.error(JSON.stringify({
      level: 'error',
      kind: 'game_lifecycle_status_failure',
      roomId,
      error: (err as Error).message,
      at: Date.now(),
    }));
    return null;
  });
  return lifecycle?.status === 'aborted';
}

function startAbortPolicySweep(): void {
  if (!persistence.isInitialized()) return;
  if (guestPrestartAbortMs <= 0) return;
  void runAbortPolicySweep();
  abortPolicyTimer = setInterval(() => {
    void runAbortPolicySweep();
  }, abortPolicySweepMs);
}

async function runAbortPolicySweep(): Promise<void> {
  try {
    const result = await persistence.abortStaleGuestPrestartGames(new Date(), guestPrestartAbortMs);
    if (result.aborted > 0) {
      for (const roomId of result.roomIds) {
        resetRoom(roomId);
      }
      console.log(JSON.stringify({
        level: 'info',
        kind: 'abort_policy_sweep',
        policy: 'guest-prestart-timeout',
        aborted: result.aborted,
        at: Date.now(),
      }));
    }
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      kind: 'abort_policy_sweep_failure',
      error: (err as Error).message,
      at: Date.now(),
    }));
  }
}

// ── SECTION: Seat management ───────────────────────────────────────────────
async function assignSeat(
  room: Room,
  clientId: string,
  suppliedSeatToken: string | undefined,
  accountUser: persistence.UserAccount | null,
): Promise<SeatAssignment> {
  const tokenSeat = verifySeatToken(room, suppliedSeatToken);
  if (tokenSeat) {
    tokenSeat.lastSeenAt = new Date();
    await touchSeatToken(room, tokenSeat);
    await startLiveClockIfReady(room);
    return {
      seat: tokenSeat.seat,
      seatTokenHash: tokenSeat.tokenHash,
    };
  }
  if (room.projection.seats.white === clientId) {
    await startLiveClockIfReady(room);
    return await existingSeatAssignment(room, 'white', clientId, accountUser);
  }
  if (room.projection.seats.black === clientId) {
    await startLiveClockIfReady(room);
    return await existingSeatAssignment(room, 'black', clientId, accountUser);
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
    return await newSeatAssignment(room, 'white', clientId, accountUser);
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
    return await newSeatAssignment(room, 'black', clientId, accountUser);
  }
  return { seat: 'spectator' };
}

async function existingSeatAssignment(
  room: Room,
  seat: Color,
  clientId: string,
  accountUser: persistence.UserAccount | null,
): Promise<SeatAssignment> {
  const existing = room.seatTokens[seat];
  if (existing) {
    return { seat: 'spectator' };
  }
  return newSeatAssignment(room, seat, clientId, accountUser);
}

async function newSeatAssignment(
  room: Room,
  seat: Color,
  clientId: string,
  accountUser: persistence.UserAccount | null,
): Promise<SeatAssignment> {
  if (isServerEngineClient(clientId)) return { seat };
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashSeatToken(rawToken);
  const now = new Date();
  const tokenState: SeatTokenState = {
    clientId,
    seat,
    tokenHash,
    userId: accountUser?.id ?? null,
    userHandle: accountUser?.handle ?? null,
    userDisplayName: accountUser?.displayName ?? null,
    issuedAt: now,
    lastSeenAt: now,
    revokedAt: null,
  };
  await persistSeatToken(room, tokenState);
  room.seatTokens[seat] = tokenState;
  return {
    seat,
    seatToken: rawToken,
    seatTokenHash: tokenHash,
  };
}

function verifySeatToken(room: Room, suppliedSeatToken: string | undefined): SeatTokenState | null {
  if (!suppliedSeatToken) return null;
  const tokenHash = hashSeatToken(suppliedSeatToken);
  const supplied = Buffer.from(tokenHash, 'hex');
  for (const state of Object.values(room.seatTokens)) {
    if (!state) continue;
    const expected = Buffer.from(state.tokenHash, 'hex');
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) {
      return state;
    }
  }
  return null;
}

function hashSeatToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function displaceOlderSeatClients(room: Room, replacement: Client): void {
  for (const client of room.clients) {
    if (client === replacement) continue;
    if (client.seat !== replacement.seat) continue;
    if (client.seat === 'spectator') continue;
    if (!sameSeatAuthority(client, replacement)) continue;
    client.displaced = true;
    try {
      client.socket.close(4000, 'duplicate session');
    } catch {
      // The close handler will clear already-closed sockets.
    }
  }
}

function sameSeatAuthority(left: Client, right: Client): boolean {
  if (left.seat !== right.seat) return false;
  if (left.seat === 'spectator') return false;
  if (left.seatTokenHash && right.seatTokenHash) return left.seatTokenHash === right.seatTokenHash;
  return isServerEngineClient(left.id) && left.id === right.id;
}

function canClientAct(room: Room, client: Client): boolean {
  if (client.solo) return true;
  if (client.displaced) return false;
  if (client.seat === 'spectator') return false;
  if (isServerEngineClient(client.id)) return room.projection.seats[client.seat] === client.id;
  const token = room.seatTokens[client.seat];
  return token !== undefined && token.tokenHash === client.seatTokenHash;
}

// ── SECTION: Game flow ─────────────────────────────────────────────────────
async function enableRandomEngine(room: Room): Promise<void> {
  room.randomEngine = true;
  room.pveEngineId = pveBuiltinEngineClientId;
  if (room.projection.variant !== 'fog-of-war') return;
  if (!room.projection.seats.black) {
    await appendEvent(room, {
      type: 'seat-assigned',
      at: Date.now(),
      roomId: room.id,
      clientId: pveBuiltinEngineClientId,
      seat: 'black',
    });
  }
  await selectEngineDraftStart(room);
}

async function selectStart(room: Room, client: Client, startId: number | undefined, color: string | undefined): Promise<void> {
  if (!canClientAct(room, client)) return;
  const selectionColor = client.solo && isColor(color) ? color : client.seat;
  if (selectionColor === 'spectator') return;
  if (room.projection.state.status.type !== 'pregame') return;
  if (!offerForColor(room.projection, selectionColor).some((start) => start.id === startId)) return;
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
  if (!canClientAct(room, client)) return;
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
  if (!canClientAct(room, client)) return;
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
    move: nextState.lastMove ?? requestedMove,
  });
  broadcastSnapshot(room);
  scheduleRandomEngineMove(room);
}

async function playRandomEngineMoveIfReady(room: Room): Promise<void> {
  if (!room.randomEngine) return;
  const engine = loadEngine(room.pveEngineId ?? pveBuiltinEngineClientId);
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
  const clock = room.projection.state.clock;
  const context = {
    baseThinkTimeMs: pveEngineMoveDelayMs,
    clockRemainingMs: clock ? clockRemainingMs(clock, 'black', now) : undefined,
    events: room.events,
    incrementMs: clock?.incrementMs,
    state: room.projection.state,
    color: 'black',
    legalMoves: moves,
    roomId: room.id,
    seed: liveEngineMoveSeed(room),
    ply: room.events.filter((event) => event.type === 'move-played').length,
  } as const;
  const startedAt = Date.now();
  let fallbackEvent: LiveEngineFallbackEvent | null = null;
  const result = await chooseLiveEngineMove({
    context,
    engine,
    timeoutMs: liveEngineTimeoutMs,
    onFallback(event) {
      fallbackEvent = event;
      console.error(JSON.stringify({
        level: 'error',
        kind: 'live_engine_fallback',
        roomId: room.id,
        engineId: event.engineId,
        fallbackEngineId: event.fallbackEngineId,
        ply: event.ply,
        reason: event.reason,
        timeoutMs: event.timeoutMs,
        durationMs: event.durationMs,
        diagnostics: event.diagnostics,
        at: Date.now(),
      }));
    },
  });
  const engineThinkTimeMs = result.decision.thinkTimeMs ?? Date.now() - startedAt;
  await sleepEngineThinkTime(startedAt, engineThinkTimeMs);
  const decisionAt = Date.now();
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.state.status.turn !== 'black') return;
  if (room.projection.state.clock && clockRemainingMs(room.projection.state.clock, 'black', decisionAt) <= 0) {
    await expireActiveClock(room, 'black', decisionAt);
    return;
  }
  console.log(JSON.stringify({
    level: 'info',
    kind: 'live_engine_move',
    roomId: room.id,
    requestedEngineId: engine.id,
    engineId: result.engineId,
    fallback: result.fallback,
    ply: context.ply,
    durationMs: Date.now() - startedAt,
    move: result.decision.move,
    at: Date.now(),
  }));
  const move = result.decision.move;
  if (!move) return;
  const nextState = variantForId(room.projection.variant).applyMove(room.projection.state, move);
  if (nextState === room.projection.state) return;
  const nextClock = advanceClock(room.projection.state.clock, decisionAt, 'black', nextState.status);
  await appendEvent(room, {
    type: 'move-played',
    at: decisionAt,
    roomId: room.id,
    clock: nextClock,
    color: 'black',
    move,
    thinkTimeMs: engineThinkTimeMs,
  });
  await recordLiveEngineDecisionArtifact(room, {
    contextPly: context.ply,
    durationMs: Date.now() - startedAt,
    engineId: result.engineId,
    fallback: result.fallback,
    fallbackEvent,
    move,
    requestedEngineId: engine.id,
    scores: result.decision.scores,
    thinkTimeMs: engineThinkTimeMs,
  });
}

type LiveEngineDecisionArtifactInput = {
  contextPly: number;
  durationMs: number;
  engineId: string;
  fallback: boolean;
  fallbackEvent: LiveEngineFallbackEvent | null;
  move: Move;
  requestedEngineId: string;
  scores: Array<{ move: Move; score: number; reason: string }>;
  thinkTimeMs: number;
};

async function recordLiveEngineDecisionArtifact(
  room: Room,
  input: LiveEngineDecisionArtifactInput,
): Promise<void> {
  if (!persistence.isInitialized()) return;
  try {
    await persistence.recordGameDebugArtifact({
      gameId: room.id,
      ply: input.contextPly,
      engineColor: 'black',
      artifactType: 'live-engine-decision',
      payload: {
        requested_engine_id: input.requestedEngineId,
        engine_id: input.engineId,
        fallback: input.fallback,
        move: input.move,
        think_time_ms: input.thinkTimeMs,
        duration_ms: input.durationMs,
        scores: input.scores,
      },
    });
    if (input.fallbackEvent) {
      await persistence.recordGameDebugArtifact({
        gameId: room.id,
        ply: input.contextPly,
        engineColor: 'black',
        artifactType: 'live-engine-fallback',
        payload: {
          engine_id: input.fallbackEvent.engineId,
          fallback_engine_id: input.fallbackEvent.fallbackEngineId,
          reason: input.fallbackEvent.reason,
          timeout_ms: input.fallbackEvent.timeoutMs ?? null,
          duration_ms: input.fallbackEvent.durationMs,
          diagnostics: input.fallbackEvent.diagnostics ?? null,
        },
      });
    }
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      kind: 'live_engine_artifact_persistence_failed',
      roomId: room.id,
      ply: input.contextPly,
      error: (err as Error).message,
      at: Date.now(),
    }));
  }
}

function scheduleRandomEngineMove(room: Room): void {
  if (room.engineTimer) return;
  if (!room.randomEngine) return;
  if (room.projection.variant !== 'fog-of-war') return;
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.state.status.turn !== 'black') return;

  room.engineTimer = setTimeout(() => {
    room.engineTimer = null;
    void playRandomEngineMoveIfReady(room)
      .then(() => broadcastSnapshot(room))
      .catch((err) => {
        if (!(err instanceof PersistenceFailure)) {
          console.error(JSON.stringify({
            level: 'error',
            kind: 'engine_move_failure',
            roomId: room.id,
            error: (err as Error).message,
            at: Date.now(),
          }));
        }
      });
  }, 0);
}

async function sleepEngineThinkTime(startedAt: number, thinkTimeMs: number | undefined): Promise<void> {
  if (thinkTimeMs === undefined) return;
  const remainingMs = Math.max(0, Math.round(thinkTimeMs) - (Date.now() - startedAt));
  if (remainingMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, remainingMs));
}

async function startLiveClockIfReady(room: Room): Promise<void> {
  if (room.projection.variant !== 'fog-of-war') return;
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.state.clock) return;
  if (!room.projection.seats.white || !room.projection.seats.black) return;

  const now = Date.now();
  const timeControl = room.projection.timeControl;
  await appendEvent(room, {
    type: 'clock-started',
    at: now,
    roomId: room.id,
    clock: timeControl
      ? createClock(now, timeControl.initialMs, timeControl.incrementMs)
      : createClock(now, liveClockInitialMs, liveClockIncrementMs),
  });
}

async function resolveStartIfReady(room: Room): Promise<void> {
  if (room.projection.resolvedStartId !== null || (room.projection.resolvedStartIds.white !== undefined && room.projection.resolvedStartIds.black !== undefined)) return;

  const whiteSelection = room.projection.selections.white;
  const blackSelection = room.projection.selections.black;
  if (whiteSelection === undefined || blackSelection === undefined) return;

  const whiteStart = offerForColor(room.projection, 'white').find((start) => start.id === whiteSelection);
  const blackStart = offerForColor(room.projection, 'black').find((start) => start.id === blackSelection);
  if (!whiteStart || !blackStart) return;
  const now = Date.now();

  await appendEvent(room, {
    type: 'draft-start-resolved',
    at: now,
    roomId: room.id,
    clock: createClock(
      now,
      room.projection.timeControl?.initialMs,
      room.projection.timeControl?.incrementMs,
    ),
    startIds: {
      white: whiteStart.id,
      black: blackStart.id,
    },
  });
}

async function selectEngineDraftStart(room: Room): Promise<void> {
  if (room.projection.state.status.type !== 'pregame') return;
  if (!isServerEngineClient(room.projection.seats.black)) return;
  if (room.projection.selections.black !== undefined) return;
  const offer = offerForColor(room.projection, 'black');
  if (offer.length === 0) return;
  const start = offer[Math.abs(roomIdToSeed(`${room.id}:black-draft`)) % offer.length];
  if (!start) return;
  await appendEvent(room, {
    type: 'draft-start-selected',
    at: Date.now(),
    roomId: room.id,
    color: 'black',
    startId: start.id,
  });
  await resolveStartIfReady(room);
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
  await reconcileClientSeats(room);
}

// ── SECTION: Seat token persistence ────────────────────────────────────────
async function reconcileClientSeats(room: Room): Promise<void> {
  const nextTokens = reconciledSeatTokens(room);
  await replaceSeatTokens(room, nextTokens);
  room.seatTokens = nextTokens;
  for (const client of room.clients) {
    if (room.projection.seats.white === client.id) client.seat = 'white';
    if (room.projection.seats.black === client.id) client.seat = 'black';
  }
}

function reconciledSeatTokens(room: Room): Partial<Record<Color, SeatTokenState>> {
  const tokenByClientId = new Map<string, SeatTokenState>();
  for (const token of Object.values(room.seatTokens)) {
    if (token) tokenByClientId.set(token.clientId, token);
  }

  const nextTokens: Partial<Record<Color, SeatTokenState>> = {};
  for (const seat of ['white', 'black'] as const) {
    const clientId = room.projection.seats[seat];
    if (!clientId) continue;
    const token = tokenByClientId.get(clientId);
    if (!token) continue;
    nextTokens[seat] = { ...token, seat };
  }
  return nextTokens;
}

function seatTokenStatesFromPersistence(
  tokens: Partial<Record<Color, persistence.RoomSeatTokenRecord>>,
): Partial<Record<Color, SeatTokenState>> {
  const states: Partial<Record<Color, SeatTokenState>> = {};
  for (const token of Object.values(tokens)) {
    if (!token || token.revokedAt) continue;
    states[token.seat] = {
      clientId: token.clientId,
      seat: token.seat,
      tokenHash: token.tokenHash,
      userId: token.userId,
      userHandle: token.userHandle,
      userDisplayName: token.userDisplayName,
      issuedAt: token.issuedAt,
      lastSeenAt: token.lastSeenAt,
      revokedAt: token.revokedAt,
    };
  }
  return states;
}

function persistenceRecordForSeatToken(token: SeatTokenState): persistence.RoomSeatTokenRecord {
  return {
    seat: token.seat,
    clientId: token.clientId,
    tokenHash: token.tokenHash,
    userId: token.userId,
    userHandle: token.userHandle,
    userDisplayName: token.userDisplayName,
    issuedAt: token.issuedAt,
    lastSeenAt: token.lastSeenAt,
    revokedAt: token.revokedAt,
  };
}

async function persistSeatToken(room: Room, token: SeatTokenState): Promise<void> {
  if (!persistence.isInitialized()) return;
  try {
    await persistence.upsertRoomSeatToken(room.id, persistenceRecordForSeatToken(token));
  } catch (err) {
    recordSeatTokenPersistenceError(room.id, token.seat, err as Error);
    throw new PersistenceFailure();
  }
}

async function touchSeatToken(room: Room, token: SeatTokenState): Promise<void> {
  if (!persistence.isInitialized()) return;
  try {
    await persistence.touchRoomSeatToken(room.id, token.seat, token.tokenHash, token.lastSeenAt);
  } catch (err) {
    recordSeatTokenPersistenceError(room.id, token.seat, err as Error);
    throw new PersistenceFailure();
  }
}

async function replaceSeatTokens(room: Room, seatTokens: Partial<Record<Color, SeatTokenState>>): Promise<void> {
  if (!persistence.isInitialized()) return;
  try {
    const tokens: Partial<Record<Color, persistence.RoomSeatTokenRecord>> = {};
    for (const token of Object.values(seatTokens)) {
      if (token) tokens[token.seat] = persistenceRecordForSeatToken(token);
    }
    await persistence.replaceRoomSeatTokens(room.id, tokens);
  } catch (err) {
    recordSeatTokenPersistenceError(room.id, null, err as Error);
    throw new PersistenceFailure();
  }
}

// ── SECTION: Room event infrastructure ─────────────────────────────────────
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
    if (room.projection.state.status.type !== 'playing' || room.projection.state.status.turn !== 'black') {
      clearRandomEngineTimer(room);
    }

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

  // status.reason is loosely typed as string in @mistboard/game; narrow here.
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
    participants: [
      participantForSeatToken('white', room.projection.seats.white ?? null, room.seatTokens.white, room.mode),
      participantForSeatToken('black', room.projection.seats.black ?? null, room.seatTokens.black, room.mode),
    ],
  };
}

function participantForSeatToken(
  color: Color,
  clientId: string | null,
  token: SeatTokenState | undefined,
  mode: persistence.GameMode,
): persistence.GameParticipant {
  if (token?.userId) {
    return {
      color,
      displayName: token.userDisplayName ?? token.userHandle ?? 'Player',
      subjectType: 'user',
      subjectId: token.userId,
      visibility: 'public',
    };
  }
  return inMemoryParticipant(color, clientId, null, mode, 'public');
}

function inMemoryGameSummary(roomId: string): persistence.RecentEveGameRecord | null {
  const room = rooms.get(roomId);
  if (!room || room.projection.state.status.type !== 'finished') return null;

  const summary = buildGameSummary(room);
  return {
    roomId: room.id,
    variant: summary.variant,
    mode: summary.mode ?? (summary.corpusId ? 'imported' : 'pvp'),
    result: summary.result,
    termination: summary.termination,
    plyCount: summary.plyCount,
    startedAt: summary.startedAt,
    endedAt: summary.endedAt,
    whiteName: summary.whiteName,
    blackName: summary.blackName,
    corpusId: summary.corpusId,
    jobId: null,
    gameIndex: null,
    whiteEngineId: null,
    blackEngineId: null,
    timeControl: null,
    visibility: summary.visibility ?? 'public',
    participants: summary.participants ?? [
      inMemoryParticipant('white', summary.whiteClient, summary.whiteName, summary.mode ?? 'pvp', summary.visibility ?? 'public'),
      inMemoryParticipant('black', summary.blackClient, summary.blackName, summary.mode ?? 'pvp', summary.visibility ?? 'public'),
    ],
  };
}

function inMemoryParticipant(
  color: Color,
  clientId: string | null,
  displayName: string | null,
  mode: persistence.GameMode,
  visibility: persistence.GameVisibility,
): persistence.GameParticipant {
  if (clientId && isServerEngineClient(clientId)) {
    const engineVersionId = canonicalEngineVersionId(clientId);
    return {
      color,
      displayName: displayName ?? engineVersionDisplayName(engineVersionId),
      subjectType: 'engine-version',
      subjectId: engineVersionId,
      visibility,
    };
  }
  if (mode === 'imported' || mode === 'manual') {
    return {
      color,
      displayName: displayName ?? (color === 'white' ? 'White' : 'Black'),
      subjectType: mode,
      subjectId: null,
      visibility,
    };
  }
  return {
    color,
    displayName: displayName ?? 'Guest',
    subjectType: 'guest',
    subjectId: null,
    visibility,
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

function recordSeatTokenPersistenceError(roomId: string, seat: Color | null, err: Error): void {
  console.error(JSON.stringify({
    level: 'error',
    kind: 'seat_token_persistence_failure',
    roomId,
    seat,
    error: err.message,
    at: Date.now(),
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
  if (room?.engineTimer) clearTimeout(room.engineTimer);
  rooms.delete(roomId);
}

function clearRandomEngineTimer(room: Room): void {
  if (!room.engineTimer) return;
  clearTimeout(room.engineTimer);
  room.engineTimer = null;
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

// ── SECTION: Helpers and shutdown ──────────────────────────────────────────
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

function parseClientId(value: string | null): string | null {
  if (!value) return null;
  return /^[a-zA-Z0-9:_-]{8,80}$/.test(value) ? value : null;
}

function roomCreatedDraftOfferFields(
  roomId: string,
  variant: VariantId,
  hiddenDraft960 = false,
): Pick<Extract<GameEvent, { type: 'room-created' }>, 'offer' | 'offers'> {
  if (variant !== 'draft960' && !(variant === 'fog-of-war' && hiddenDraft960)) return { offer: [] };

  const seed = roomIdToSeed(roomId);
  const offers: Record<Color, Chess960Start[]> = {
    white: pickDraft960Offer(seed),
    black: pickDraft960Offer(seed ^ 0x5f3759df),
  };
  return {
    offer: offers.white,
    offers,
  };
}

function engineDraftSelectionEvent(
  roomCreated: Extract<GameEvent, { type: 'room-created' }>,
  roomId: string,
  at: number,
): Extract<GameEvent, { type: 'draft-start-selected' }> | null {
  const offer = roomCreated.offers?.black ?? roomCreated.offer;
  if (offer.length === 0) return null;
  const start = offer[Math.abs(roomIdToSeed(`${roomId}:black-draft`)) % offer.length];
  if (!start) return null;
  return {
    type: 'draft-start-selected',
    at,
    roomId,
    color: 'black',
    startId: start.id,
  };
}

function offerForColor(projection: GameProjection, color: Color): Chess960Start[] {
  return projection.offers[color] ?? projection.offer;
}

function roomIdToSeed(roomId: string): number {
  let hash = 0;
  for (const char of roomId) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return hash;
}

function liveEngineMoveSeed(room: Room): bigint {
  const ply = room.events.filter((event) => event.type === 'move-played').length;
  return (BigInt(roomIdToSeed(room.id) >>> 0) << 16n) + BigInt(ply);
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

function isHttpAdminAuthorized(request: IncomingMessage): boolean {
  if (!isProductionLikeRuntime()) return true;
  const authorization = Array.isArray(request.headers.authorization)
    ? request.headers.authorization[0]
    : request.headers.authorization;
  const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined;
  return isAdminDebugToken(token);
}

function canonicalEngineVersionId(clientId: string): string {
  if (clientId === 'random-engine') return pveBuiltinEngineClientId;
  return clientId;
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
    if (room.engineTimer) clearTimeout(room.engineTimer);
  }
  if (abortPolicyTimer) clearInterval(abortPolicyTimer);
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
