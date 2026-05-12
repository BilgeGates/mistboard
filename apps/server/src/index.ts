import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import serveHandler from 'serve-handler';
import { WebSocketServer, WebSocket } from 'ws';
import {
  type Chess960Start,
  defaultClockInitialMs,
  pickDraft960Offer,
  replayGameEvents,
  type Color,
  type GameEvent,
  type GameProjection,
  type RoomTimeControl,
  type VariantId,
} from '@mistboard/game';
import { runMigrations } from './migrate.js';
import * as persistence from './persistence.js';
import {
  isPlayableLiveEngineClientId,
} from './engine-registry.js';
import { snapshotPayload } from './payloads.js';
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
import { currentAccountUser } from './account-session.js';
import {
  handleApiRequest,
  parseHiddenDraft960,
  parseRoomTimeControl,
  parseVariantId,
  type HttpApiContext,
} from './http-api.js';
import {
  appendEvent,
  broadcastSnapshot,
  buildGameSummary,
  canClientAct,
  offerForColor,
  PersistenceFailure,
  persistSeatToken,
  playMove,
  resolveBidIfReady,
  resolveStartIfReady,
  roomIdToSeed,
  seatTokenStatesFromPersistence,
  scheduleClockTimeout,
  scheduleRandomEngineMove,
  selectEngineDraftStart,
  startLiveClockIfReady,
  touchSeatToken,
  type RoomManagerContext,
} from './room-manager.js';

// Navigation index — grep for section name to jump to the right block
// Account/auth           → ./account-session.ts  (currentAccountUser, hashSecret, session cookies)
// HTTP API handlers      → ./http-api.ts          (handleApiRequest, lobby, game data, auth endpoints)
// Room game flow         → ./room-manager.ts       (playMove, appendEvent, broadcastSnapshot, scheduleClockTimeout, etc.)
// SECTION: Types and constants          (~line 90)    module-scope maps and config constants
// SECTION: Server init and HTTP entry   (~line 130)   initPersistence, handleHttpRequest, static file serving
// SECTION: WebSocket connection handling (~line 230)  handleConnection, handleMessage, handleClose, getOrCreateRoom, createRoom, runAbortPolicySweep
// SECTION: Seat management              (~line 560)   assignSeat, existingSeatAssignment, newSeatAssignment, verifySeatToken, displaceOlderSeatClients, canClientAct
// SECTION: Game flow                    (~line 700)   enableRandomEngine, selectStart, submitBid
// SECTION: Room event infrastructure    (~line 760)   inMemoryGameSummary, recordPersistenceError, resetRoom
// SECTION: Helpers and shutdown         (~line 810)   send, parseMessage, isColor, roomCreatedDraftOfferFields, shutdown

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

const roomMgrCtx: RoomManagerContext = {
  send,
  recordPersistenceError,
  pveBuiltinEngineClientId,
  pveEngineMoveDelayMs,
  liveEngineTimeoutMs,
  liveClockInitialMs,
  liveClockIncrementMs,
};

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
  broadcastSnapshot(roomMgrCtx, room);

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
      await playMove(roomMgrCtx, room, client, {
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
    broadcastSnapshot(roomMgrCtx, room);
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
      await appendEvent(roomMgrCtx, room, {
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
  broadcastSnapshot(roomMgrCtx, room);
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
  scheduleClockTimeout(roomMgrCtx, room);
  scheduleRandomEngineMove(roomMgrCtx, room);
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
    scheduleClockTimeout(roomMgrCtx, room);
    scheduleRandomEngineMove(roomMgrCtx, room);
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
    await touchSeatToken(roomMgrCtx, room, tokenSeat);
    await startLiveClockIfReady(roomMgrCtx, room);
    return {
      seat: tokenSeat.seat,
      seatTokenHash: tokenSeat.tokenHash,
    };
  }
  if (room.projection.seats.white === clientId) {
    await startLiveClockIfReady(roomMgrCtx, room);
    return await existingSeatAssignment(room, 'white', clientId, accountUser);
  }
  if (room.projection.seats.black === clientId) {
    await startLiveClockIfReady(roomMgrCtx, room);
    return await existingSeatAssignment(room, 'black', clientId, accountUser);
  }
  if (!room.projection.seats.white) {
    await appendEvent(roomMgrCtx, room, {
      type: 'seat-assigned',
      at: Date.now(),
      roomId: room.id,
      clientId,
      seat: 'white',
    });
    await startLiveClockIfReady(roomMgrCtx, room);
    return await newSeatAssignment(room, 'white', clientId, accountUser);
  }
  if (!room.projection.seats.black) {
    await appendEvent(roomMgrCtx, room, {
      type: 'seat-assigned',
      at: Date.now(),
      roomId: room.id,
      clientId,
      seat: 'black',
    });
    await startLiveClockIfReady(roomMgrCtx, room);
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
  await persistSeatToken(roomMgrCtx, room, tokenState);
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

// ── SECTION: Game flow ─────────────────────────────────────────────────────
async function enableRandomEngine(room: Room): Promise<void> {
  room.randomEngine = true;
  room.pveEngineId = pveBuiltinEngineClientId;
  if (room.projection.variant !== 'fog-of-war') return;
  if (!room.projection.seats.black) {
    await appendEvent(roomMgrCtx, room, {
      type: 'seat-assigned',
      at: Date.now(),
      roomId: room.id,
      clientId: pveBuiltinEngineClientId,
      seat: 'black',
    });
  }
  await selectEngineDraftStart(roomMgrCtx, room);
}

async function selectStart(room: Room, client: Client, startId: number | undefined, color: string | undefined): Promise<void> {
  if (!canClientAct(room, client)) return;
  const selectionColor = client.solo && isColor(color) ? color : client.seat;
  if (selectionColor === 'spectator') return;
  if (room.projection.state.status.type !== 'pregame') return;
  if (!offerForColor(room.projection, selectionColor).some((start) => start.id === startId)) return;
  if (startId === undefined) return;

  await appendEvent(roomMgrCtx, room, {
    type: 'draft-start-selected',
    at: Date.now(),
    roomId: room.id,
    color: selectionColor,
    startId,
  });
  await resolveStartIfReady(roomMgrCtx, room);
  broadcastSnapshot(roomMgrCtx, room);
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
  await appendEvent(roomMgrCtx, room, {
    type: 'bid-submitted',
    at: Date.now(),
    roomId: room.id,
    color: biddingSeat,
    bidMs: boundedBidMs,
  });
  await resolveBidIfReady(roomMgrCtx, room);
  broadcastSnapshot(roomMgrCtx, room);
}

// ── SECTION: Room event infrastructure ─────────────────────────────────────
function inMemoryGameSummary(roomId: string): persistence.RecentEveGameRecord | null {
  const room = rooms.get(roomId);
  if (!room || room.projection.state.status.type !== 'finished') return null;

  const summary = buildGameSummary(roomMgrCtx, room);
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
    participants: summary.participants ?? [],
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

function resetRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (room?.clockTimer) clearTimeout(room.clockTimer);
  if (room?.engineTimer) clearTimeout(room.engineTimer);
  rooms.delete(roomId);
}

// ── SECTION: Helpers and shutdown ──────────────────────────────────────────
function send(client: Client, payload: unknown): void {
  client.socket.send(JSON.stringify(payload));
}

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

function canonicalEngineVersionId(clientId: string): string {
  if (clientId === 'random-engine') return pveBuiltinEngineClientId;
  return clientId;
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
