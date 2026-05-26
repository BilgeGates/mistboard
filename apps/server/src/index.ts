import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  type Chess960Start,
  type Color,
  type GameEvent,
  type GameProjection,
  gameSpecForLegacyLiveRoom,
  pickDraft960Offer,
  type RoomTimeControl,
  replayGameEvents,
  type VariantId,
} from '@mistboard/game';
import pg from 'pg';
import serveHandler from 'serve-handler';
import { type WebSocket, WebSocketServer } from 'ws';
import { currentAccountUser } from './account-session.js';
import { isPlayableLiveEngineClientId, loadEngine } from './engine-registry.js';
import { gateGameSpecRequest } from './game-spec-request-gate.js';
import {
  type HttpApiContext,
  handleApiRequest,
  parseHiddenDraft960,
  parseVariantId,
} from './http-api.js';
import {
  InternalEngineClientError,
  releaseInternalEngineReservation,
  requestInternalEngineReservation,
} from './internal-engine-client.js';
import { runMigrations } from './migrate.js';
import { engineCounters, logger, wsCounters } from './obs.js';
import { serveArticleOgImage, serveGameOgImage } from './og-image.js';
import { snapshotPayload } from './payloads.js';
import * as persistence from './persistence.js';
import {
  cancelRematch,
  declineRematch,
  finalizeRematchIfReady,
  maybeReplayRematchRedirect,
  offerRematch,
  type RematchOrchestrator,
} from './rematch.js';
import {
  appendEvent,
  applyOrphanRecoveryIfNeeded,
  broadcastEventAppended,
  broadcastSnapshot,
  buildGameSummary,
  canClientAct,
  clearAbortTimer,
  clearForfeitTimer,
  offerForColor,
  PersistenceFailure,
  pauseRoomOnShutdown,
  persistSeatToken,
  playMove,
  type RoomManagerContext,
  resolveStartIfReady,
  resumeRoom,
  resumeRoomIfReady,
  roomIdToSeed,
  scheduleAbortTimeout,
  scheduleClockTimeout,
  scheduleForfeitTimeout,
  scheduleRandomEngineMove,
  seatDisplayNamesForRoom,
  seatTokenStatesFromPersistence,
  selectEngineDraftStart,
  startLiveClockIfReady,
  touchSeatToken,
} from './room-manager.js';
import { authorizeExistingSeat, seatsShareAuthority } from './seat-auth.js';
import { loadServerRuntimeConfig, normalizeRoomRegion, serverConfig } from './server-config.js';
import { createDrainController } from './server-drain.js';
import {
  adminDebugTokenFromProtocolHeader,
  canObserveLiveRoom,
  isAdminDebugToken,
  isAllowedWebSocketOrigin,
  isClientRoute,
  isProductionLikeRuntime,
  isServerEngineClient,
  modeForProjection,
  recordMessageTimestamp,
  seatTokenFromProtocolHeader,
} from './server-policy.js';
import {
  ARTICLE_META,
  serveArticlePage,
  serveArticlesIndexPage,
  serveGamePage,
  serveSitemap,
} from './server-static-pages.js';
import type { Client, LobbyTicket, Room, SeatAssignment, SeatTokenState } from './server-types.js';

// Navigation index — grep for section name to jump to the right block
// Account/auth           → ./account-session.ts  (currentAccountUser, hashSecret, session cookies)
// HTTP API handlers      → ./http-api.ts          (handleApiRequest, lobby, game data, auth endpoints)
// Room game flow         → ./room-manager.ts       (playMove, appendEvent, broadcastSnapshot, scheduleClockTimeout, etc.)
// Static page helpers    → ./server-static-pages.ts (page meta, article shells, sitemap)
// Drain/admin HTTP       → ./server-drain.ts       (drain state, deadline, broadcast)
// SECTION: Types and constants          (~line 90)    module-scope maps and config constants
// SECTION: Server init and HTTP entry   (~line 130)   initPersistence, handleHttpRequest, static file serving
// SECTION: WebSocket connection handling (~line 230)  handleConnection, handleMessage, handleClose, getOrCreateRoom, createRoom, runAbortPolicySweep
// SECTION: Seat management              (~line 560)   assignSeat, existingSeatAssignment, newSeatAssignment, verifySeatToken, displaceOlderSeatClients, canClientAct
// SECTION: Game flow                    (~line 700)   enableRandomEngine, selectStart
// SECTION: Room event infrastructure    (~line 760)   inMemoryGameSummary, recordPersistenceError, resetRoom
// SECTION: Helpers and shutdown         (~line 810)   send, parseMessage, isColor, roomCreatedDraftOfferFields, shutdown

// ── SECTION: Types and constants ───────────────────────────────────────────
// Core server types live in ./server-types.ts — Client, Room, SeatTokenState, SeatAssignment, LobbyTicket

const rooms = new Map<string, Room>();
const lobbyTickets = new Map<string, LobbyTicket>();
const lobbyQueue: LobbyTicket[] = [];
const databaseRequired = serverConfig.databaseRequired;
const wsMaxPayloadBytes = serverConfig.wsMaxPayloadBytes;
const wsMessageLimit = serverConfig.wsMessageLimit;
const wsMessageWindowMs = serverConfig.wsMessageWindowMs;
const shutdownGraceMs = serverConfig.shutdownGraceMs;
const pauseGraceMs = serverConfig.pauseGraceMs;
const orphanThresholdMs = serverConfig.orphanThresholdMs;
const liveClockInitialMs = 180_000;
const liveClockIncrementMs = 2_000;
const pveEngineMoveDelayMs = serverConfig.pveEngineMoveDelayMs;
const liveEngineTimeoutMs = serverConfig.liveEngineTimeoutMs;
const defaultRoomRegion = serverConfig.defaultRoomRegion;
const guestPrestartAbortMs = serverConfig.guestPrestartAbortMs;
const abortPolicySweepMs = serverConfig.abortPolicySweepMs;
const stalePauseMs = serverConfig.stalePauseMs;
const stalePausedSweepMs = serverConfig.stalePausedSweepMs;
const pveBuiltinEngineClientId = 'builtin-random-legal';
const persistenceErrors: Array<{ at: number; roomId: string; eventType: string }> = [];
const PERSISTENCE_ERROR_RETENTION_MS = 3_600_000;

const staticDir = serverConfig.staticDir;
// Local-only research/debug annotations. Keep this independent from the private
// engine repo so web boots cleanly without an engine checkout.
const annotationsFile = serverConfig.annotationsFile;
const drainController = createDrainController({
  drainWindowDefaultMs: serverConfig.drainWindowDefaultMs,
  drainWindowMaxMs: serverConfig.drainWindowMaxMs,
  rooms,
});

const roomMgrCtx: RoomManagerContext = {
  send,
  recordPersistenceError,
  pveBuiltinEngineClientId,
  pveEngineMoveDelayMs,
  liveEngineTimeoutMs,
  liveClockInitialMs,
  liveClockIncrementMs,
  releaseLiveEngineReservation,
};

const rematchOrch: RematchOrchestrator = {
  ctx: roomMgrCtx,
  send,
  buildRoomUrl: (roomId) => `/?room=${encodeURIComponent(roomId)}`,
  createRoom: (spec) =>
    createRoom(
      spec.mode,
      spec.variant,
      spec.pveEngineId ?? pveBuiltinEngineClientId,
      spec.hiddenDraft960,
      spec.timeControl,
      spec.rated,
      { region: spec.region },
    ),
  issueSeatToken: async (room, seat, identity) => {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashSeatToken(rawToken);
    const now = new Date();
    const state: SeatTokenState = {
      clientId: randomUUID(),
      seat,
      tokenHash,
      userId: identity.userId,
      userHandle: identity.userHandle,
      userDisplayName: identity.userDisplayName,
      issuedAt: now,
      lastSeenAt: now,
      revokedAt: null,
    };
    await persistSeatToken(roomMgrCtx, room, state);
    room.seatTokens[seat] = state;
    return { rawToken, state };
  },
};

// ── SECTION: startServer (module side-effect-free until called) ────────────
//
// All side effects (DB init, listener, intervals, signal handlers) live inside
// startServer() so that `apps/server/integration/harness.ts` can import this
// module without booting a real server, then call startServer({port:0}) to spin
// up a controlled instance per test process.
let server: ReturnType<typeof createServer> | null = null;
let wss: WebSocketServer | null = null;
let abortPolicyTimer: ReturnType<typeof setInterval> | null = null;
let stalePausedSweepTimer: ReturnType<typeof setInterval> | null = null;
let shuttingDown = false;
let seatVacateGraceMsOverride: number | null = null;

export type StartServerOptions = {
  port?: number;
  seatVacateGraceMs?: number;
};

export type StartedServer = {
  port: number;
  rooms: Map<string, Room>;
  wsClientCount: () => number;
  close: () => Promise<void>;
};

export async function startServer(options: StartServerOptions = {}): Promise<StartedServer> {
  if (server) throw new Error('startServer: already running');
  shuttingDown = false;
  if (typeof options.seatVacateGraceMs === 'number') {
    seatVacateGraceMsOverride = options.seatVacateGraceMs;
  } else {
    seatVacateGraceMsOverride = null;
  }
  await initPersistence();
  startAbortPolicySweep();
  startStalePausedSweep();

  const httpServer = createServer(handleHttpRequest);
  const wsServer = new WebSocketServer({ server: httpServer, maxPayload: wsMaxPayloadBytes });
  server = httpServer;
  wss = wsServer;

  wsServer.on('connection', (socket, request) => {
    if (!isAllowedWebSocketRequest(request)) {
      socket.close(1008, 'origin not allowed');
      return;
    }
    void handleConnection(socket, request).catch((err) => {
      console.error(
        JSON.stringify({
          level: 'error',
          kind: 'connection_handler_failure',
          error: (err as Error).message,
          at: Date.now(),
        }),
      );
      try {
        socket.close(1011, 'internal error');
      } catch {
        /* socket already closed */
      }
    });
  });

  const port = options.port ?? serverConfig.port;
  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => resolve());
  });
  const address = httpServer.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;
  if (!options.port && port !== 0) {
    console.log(`mistboard server listening on http://localhost:${boundPort}`);
  }

  return {
    port: boundPort,
    rooms,
    wsClientCount: () => wsServer.clients.size,
    close: async () => {
      await stopServer();
    },
  };
}

export function installShutdownHandlers(): void {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }
}

// Tear down for tests / hot restart. Mirrors shutdown() but does NOT call
// process.exit, so the runner stays alive across tests.
export async function stopServer(): Promise<void> {
  if (!server || !wss) return;
  await pauseActiveRoomsOnShutdown();
  for (const room of rooms.values()) {
    if (room.clockTimer) clearTimeout(room.clockTimer);
    if (room.engineTimer) clearTimeout(room.engineTimer);
    clearAbortTimer(room);
    clearForfeitTimer(room);
    if (room.pauseGraceTimer) clearTimeout(room.pauseGraceTimer);
    for (const timer of Object.values(room.pendingVacates)) {
      if (timer) clearTimeout(timer);
    }
  }
  if (abortPolicyTimer) {
    clearInterval(abortPolicyTimer);
    abortPolicyTimer = null;
  }
  if (stalePausedSweepTimer) {
    clearInterval(stalePausedSweepTimer);
    stalePausedSweepTimer = null;
  }
  for (const client of [...rooms.values()].flatMap((room) => [...room.clients])) {
    try {
      client.socket.close(1001, 'server shutting down');
    } catch {
      /* socket already closed */
    }
  }
  await Promise.allSettled([...rooms.values()].map((room) => room.pendingWrites));
  await new Promise<void>((resolve) => {
    wss!.close(() => resolve());
  });
  await new Promise<void>((resolve, reject) => {
    server!.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  await persistence.close();
  rooms.clear();
  lobbyTickets.clear();
  lobbyQueue.length = 0;
  persistenceErrors.length = 0;
  server = null;
  wss = null;
  seatVacateGraceMsOverride = null;
}

// ── SECTION: Server init and HTTP entry ────────────────────────────────────
async function initPersistence(): Promise<void> {
  const persistenceConfig = loadServerRuntimeConfig();
  const databaseUrl = persistenceConfig.databaseUrl;
  if (!databaseUrl) {
    if (persistenceConfig.databaseRequired) {
      throw new Error(
        'DATABASE_URL is required in this runtime; set MISTBOARD_ALLOW_IN_MEMORY_PERSISTENCE=true only for intentional ephemeral environments',
      );
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
    void (async () => {
      const cutoff1m = Date.now() - 60_000;
      const recent = persistenceErrors.filter((entry) => entry.at > cutoff1m);
      const lastAt =
        persistenceErrors.length > 0 ? persistenceErrors[persistenceErrors.length - 1]!.at : null;
      const dbReachable = databaseRequired ? await persistence.probeDb() : true;
      const ok = recent.length === 0 && dbReachable;
      response.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          ok,
          databaseRequired,
          persistence: persistence.isInitialized() ? 'enabled' : 'disabled',
          persistenceErrors: { count1m: recent.length, lastAt },
        }),
      );
    })();
    return;
  }

  if (pathname === '/admin/drain' || pathname === '/admin/drain/cancel') {
    void drainController.handleRequest(request, response, pathname).catch((err) => {
      console.error(
        JSON.stringify({
          level: 'error',
          kind: 'drain_handler_failure',
          error: (err as Error).message,
          at: Date.now(),
        }),
      );
      if (!response.headersSent) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'internal_error' }));
      }
    });
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
      reserveLiveEngineSeat,
      releaseLiveEngineReservation,
      abandonRoom,
      inMemoryGameSummary,
      isDraining: drainController.isDraining,
      drainDeadlineMs: drainController.drainDeadlineMs,
      activeGameCount: drainController.activeGameCount,
    };
    void handleApiRequest(apiCtx, request, response).catch((err) => {
      console.error(
        JSON.stringify({
          level: 'error',
          kind: 'api_handler_failure',
          url,
          error: (err as Error).message,
          at: Date.now(),
        }),
      );
      if (!response.headersSent) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'internal_error' }));
      }
    });
    return;
  }

  const ogImageMatch = pathname.match(/^\/og\/game\/([^/]+)\.png$/);
  if (ogImageMatch && persistence.isInitialized()) {
    const roomId = decodeURIComponent(ogImageMatch[1]!);
    void serveGameOgImage(roomId, response).catch((err) => {
      console.warn('og image render failed', (err as Error).message);
      if (!response.headersSent) {
        response.writeHead(302, { location: '/og-image.png' });
        response.end();
      }
    });
    return;
  }

  const articleOgMatch = pathname.match(/^\/og\/article\/([^/]+)\.png$/);
  if (articleOgMatch) {
    const slug = decodeURIComponent(articleOgMatch[1]!);
    const meta = ARTICLE_META[slug];
    try {
      if (meta) {
        serveArticleOgImage(slug, meta.title, response);
      } else {
        response.writeHead(302, { location: '/og-image.png' });
        response.end();
      }
    } catch (err) {
      console.warn('article og render failed', (err as Error).message);
      if (!response.headersSent) {
        response.writeHead(302, { location: '/og-image.png' });
        response.end();
      }
    }
    return;
  }

  if (pathname === '/robots.txt') {
    const host = serverConfig.publicHost;
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(`User-agent: *\nAllow: /\nSitemap: ${host}/sitemap.xml\n`);
    return;
  }

  if (pathname === '/sitemap.xml') {
    void serveSitemap({
      response,
      publicHost: serverConfig.publicHost,
      staticDir,
    }).catch(() => {
      response.writeHead(500);
      response.end();
    });
    return;
  }

  const gameRouteMatch = pathname.match(/^\/game\/([^/]+)$/);
  if (gameRouteMatch && persistence.isInitialized()) {
    const roomId = decodeURIComponent(gameRouteMatch[1]!);
    void serveGamePage({
      roomId,
      response,
      publicHost: serverConfig.publicHost,
      staticDir,
    }).catch(() => {
      request.url = '/';
      void serveHandler(request, response, { public: staticDir });
    });
    return;
  }

  // Optional language prefix: /zh-hans/articles/<slug>, /zh-hant/articles/<slug>.
  const articleRouteMatch = pathname.match(/^(?:\/(zh-hans|zh-hant))?\/articles\/([^/]+)$/);
  if (articleRouteMatch) {
    const langPrefix = articleRouteMatch[1]; // 'zh-hans' | 'zh-hant' | undefined
    const slug = decodeURIComponent(articleRouteMatch[2]!);
    void serveArticlePage({
      slug,
      response,
      publicHost: serverConfig.publicHost,
      staticDir,
      langPrefix,
    }).catch(() => {
      request.url = '/';
      void serveHandler(request, response, { public: staticDir });
    });
    return;
  }

  if (pathname === '/articles') {
    void serveArticlesIndexPage({
      response,
      publicHost: serverConfig.publicHost,
      staticDir,
    }).catch(() => {
      request.url = '/';
      void serveHandler(request, response, { public: staticDir });
    });
    return;
  }

  if (isClientRoute(pathname)) {
    request.url = '/';
  }

  void serveHandler(request, response, { public: staticDir });
}

// ── SECTION: WebSocket connection handling ─────────────────────────────────
async function handleConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const roomId = url.searchParams.get('room') ?? 'dev-room';
  const gameSpecGate = gateGameSpecRequest({
    gameSpecId: url.searchParams.get('gameSpecId'),
    variant: url.searchParams.get('variant'),
  });
  if (gameSpecGate.type === 'reject') {
    socket.close(1008, gameSpecGate.wsCloseReason);
    return;
  }
  if (url.searchParams.get('reset') === '1') resetRoom(roomId, 'manual-reset');
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
  const assignment = solo
    ? ({ seat: 'spectator' } satisfies SeatAssignment)
    : await assignSeat(room, clientId, seatToken, accountUser);
  const seat = assignment.seat;
  if (seat === 'spectator' && !solo && !canObserveLiveRoom(room.projection)) {
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
    userId: accountUser?.id ?? null,
    displaced: false,
    solo,
  };
  room.clients.add(client);
  if (!solo && seat !== 'spectator') {
    displaceOlderSeatClients(room, client);
    clearPendingVacate(room, seat);
    // A returning seat-holder re-derives the forfeit countdown: if this brings
    // both sides present, the leaver's forfeit is cancelled. Runs after the
    // auth gate (assignSeat) has already granted a color seat, so an
    // unauthenticated client never reaches here as a seat-holder.
    scheduleForfeitTimeout(roomMgrCtx, room);
  }

  // If the room is paused (post-restart hydration), let resumeRoomIfReady
  // decide whether resume is appropriate — it knows the mode-specific rules
  // (PvP needs both humans, PvE needs the human, EvE auto-resumes on any
  // connection). Safe to call for spectators too; it short-circuits when seats
  // aren't satisfied.
  if (room.projection.paused && !solo) {
    try {
      const resumed = await resumeRoomIfReady(roomMgrCtx, room, Date.now());
      if (resumed) {
        scheduleClockTimeout(roomMgrCtx, room);
        scheduleAbortTimeout(roomMgrCtx, room);
        scheduleRandomEngineMove(roomMgrCtx, room);
      }
    } catch (err) {
      if (!(err instanceof PersistenceFailure)) {
        console.error(
          JSON.stringify({
            level: 'error',
            kind: 'resume_on_connect_failure',
            roomId: room.id,
            error: (err as Error).message,
            at: Date.now(),
          }),
        );
      }
    }
  }

  const snapshot = snapshotPayload(
    { ...room, seatDisplayNames: seatDisplayNamesForRoom(room, roomMgrCtx) },
    client,
  );
  send(client, {
    ...snapshot,
    type: 'hello',
    clientId: client.id,
    offer: snapshot.offer,
    ...(assignment.seatToken ? { seatToken: assignment.seatToken } : {}),
  });
  broadcastSnapshot(roomMgrCtx, room);
  maybeReplayRematchRedirect(rematchOrch, room, client);

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

// Known client→server message types. Anything outside this set increments
// ws_unknown_messages in the metrics tick and emits a `kind:
// 'ws_unknown_message'` log. The snapshot→delta migration introduced
// `snapshot:request`; future wire-format additions should land here too.
const KNOWN_CLIENT_MESSAGE_TYPES = new Set([
  'ping',
  'latency-sample',
  'admin-debug-auth',
  'snapshot:request',
  'select-start',
  'move',
  'resign',
  'abort',
  'rematch:offer',
  'rematch:cancel',
  'rematch:decline',
]);

async function handleMessage(room: Room, client: Client, raw: string): Promise<void> {
  const message = parseMessage(raw);
  if (!message) return;
  if (!KNOWN_CLIENT_MESSAGE_TYPES.has(message.type)) {
    wsCounters.recordUnknownMessage();
    logger.warn(
      {
        kind: 'ws_unknown_message',
        room_id: room.id,
        client_id: client.id,
        message_type: message.type,
      },
      'ws unknown message',
    );
    return;
  }
  try {
    if (message.type === 'ping') {
      send(client, {
        type: 'pong',
        at: typeof message.at === 'number' ? message.at : Date.now(),
        serverAt: Date.now(),
      });
      return;
    }
    if (message.type === 'latency-sample') {
      if (typeof message.rttMs === 'number' && Number.isFinite(message.rttMs)) {
        const rttMs = Math.max(0, Math.min(60_000, Math.round(message.rttMs)));
        wsCounters.recordLatencySample(room.region ?? defaultRoomRegion, rttMs);
      }
      return;
    }
    if (message.type === 'admin-debug-auth') {
      handleAdminDebugAuth(
        room,
        client,
        typeof message.token === 'string' ? message.token : undefined,
      );
      return;
    }
    if (message.type === 'snapshot:request') {
      // Delta-mode recovery channel. The client is already authenticated to
      // this room via the WS connect handshake (canObserveLiveRoom + seat
      // token); we inherit that auth here rather than re-deriving it.
      wsCounters.recordSnapshotRequest();
      send(
        client,
        snapshotPayload(
          { ...room, seatDisplayNames: seatDisplayNamesForRoom(room, roomMgrCtx) },
          client,
        ),
      );
      return;
    }
    if (message.type === 'select-start') {
      await selectStart(room, client, message.startId, message.color);
    }
    if (
      message.type === 'move' &&
      typeof message.from === 'string' &&
      typeof message.to === 'string'
    ) {
      await playMove(roomMgrCtx, room, client, {
        type: 'move',
        from: message.from,
        to: message.to,
        promotion: message.promotion,
      });
    }
    if (message.type === 'resign') {
      await handleResign(room, client);
    }
    if (message.type === 'abort') {
      await handleAbort(room, client);
    }
    if (message.type === 'rematch:offer') {
      offerRematch(rematchOrch, room, client);
      await finalizeRematchIfReady(rematchOrch, room);
    }
    if (message.type === 'rematch:cancel') {
      cancelRematch(rematchOrch, room, client);
    }
    if (message.type === 'rematch:decline') {
      declineRematch(rematchOrch, room, client);
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
  const beforeFirstMove =
    room.projection.state.moveNumber === 1 && room.projection.state.lastMove === undefined;
  const clockStarted = room.projection.state.clock !== undefined;
  if (
    (room.projection.state.status.type === 'pregame' || beforeFirstMove) &&
    !clockStarted &&
    client.seat !== 'spectator' &&
    room.projection.seats[client.seat] === client.id
  ) {
    scheduleSeatVacate(room, client);
  }
  // Post-move-1, a seated player leaving starts (or, if the opponent also just
  // left, clears) the forfeit countdown. Re-derived from current presence —
  // the disconnecting client was already removed from room.clients above. The
  // displaced early-out higher up means a same-account device switch never
  // reaches here, so it can't trigger a phantom forfeit.
  scheduleForfeitTimeout(roomMgrCtx, room);
  broadcastSnapshot(roomMgrCtx, room);
}

const SEAT_VACATE_GRACE_MS_DEFAULT = serverConfig.seatVacateGraceMs;

function seatVacateGraceMs(): number {
  return seatVacateGraceMsOverride ?? SEAT_VACATE_GRACE_MS_DEFAULT;
}

function scheduleSeatVacate(room: Room, client: Client): void {
  if (client.seat === 'spectator') return;
  const seat = client.seat;
  const existing = room.pendingVacates[seat];
  if (existing) clearTimeout(existing);
  const clientId = client.id;
  room.pendingVacates[seat] = setTimeout(() => {
    delete room.pendingVacates[seat];
    // Only vacate if (a) game hasn't started in the meantime and
    // (b) no other client has taken this seat. If a different client has
    // displaced this seat, projection.seats[seat] no longer equals clientId.
    if (
      room.projection.state.status.type !== 'pregame' &&
      !(room.projection.state.moveNumber === 1 && room.projection.state.lastMove === undefined)
    ) {
      return;
    }
    if (room.projection.state.clock !== undefined) return;
    if (room.projection.seats[seat] !== clientId) return;
    // If a connected client already holds this seat, skip — they reconnected.
    for (const c of room.clients) {
      if (c.seat === seat && !c.displaced) return;
    }
    void appendEvent(roomMgrCtx, room, {
      type: 'seat-vacated',
      at: Date.now(),
      roomId: room.id,
      clientId,
      seat,
    }).catch((err) => {
      if (err instanceof PersistenceFailure) return;
      console.error(
        JSON.stringify({
          level: 'error',
          kind: 'seat_vacate_append_failure',
          roomId: room.id,
          seat,
          error: (err as Error).message,
          at: Date.now(),
        }),
      );
    });
  }, seatVacateGraceMs());
}

function clearPendingVacate(room: Room, seat: Client['seat']): void {
  if (seat === 'spectator') return;
  const timer = room.pendingVacates[seat];
  if (!timer) return;
  clearTimeout(timer);
  delete room.pendingVacates[seat];
}

async function getOrCreateRoom(
  roomId: string,
  variant: VariantId,
  hiddenDraft960 = false,
): Promise<Room> {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  let events: GameEvent[] | null = null;
  let createdNewPersistentRoom = false;
  if (persistence.isInitialized()) {
    try {
      events = await persistence.loadRoom(roomId);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          kind: 'persistence_load_failure',
          roomId,
          error: (err as Error).message,
          at: Date.now(),
        }),
      );
      events = null;
    }
  }

  if (!events) {
    const gameSpecId = gameSpecForLegacyLiveRoom({ variant, hiddenDraft960 }).id;
    const created: GameEvent = {
      type: 'room-created',
      at: Date.now(),
      roomId,
      variant,
      gameSpecId,
      region: defaultRoomRegion,
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

  // SIGKILL recovery: if hydrating a stale "playing" room with no pause event,
  // synthesize one so the rest of the pipeline treats it as a clean restart.
  // See docs/server-restart-pause-resume.md (Phase 5).
  const recoveredEvents = applyOrphanRecoveryIfNeeded(events, Date.now(), orphanThresholdMs);
  if (recoveredEvents.length > events.length) {
    const synthPause = recoveredEvents[recoveredEvents.length - 1]!;
    if (persistence.isInitialized()) {
      try {
        await persistence.appendEvent(roomId, recoveredEvents.length - 1, synthPause);
      } catch (err) {
        recordPersistenceError(roomId, recoveredEvents.length - 1, synthPause, err as Error);
        throw new PersistenceFailure();
      }
    }
    console.log(
      JSON.stringify({
        level: 'info',
        kind: 'orphan_recovery_synth_pause',
        roomId,
        lastEventAt: events[events.length - 1]!.at,
        synthPauseAt: synthPause.at,
        at: Date.now(),
      }),
    );
    events = recoveredEvents;
  }

  const projection = replayGameEvents(events);
  const mode = modeForProjection(projection);
  const seatTokens = persistence.isInitialized()
    ? seatTokenStatesFromPersistence(await persistence.loadRoomSeatTokens(roomId))
    : {};
  const roomCreatedEvent = events.find((e) => e.type === 'room-created') as
    | Extract<GameEvent, { type: 'room-created' }>
    | undefined;
  const region = normalizeRoomRegion(roomCreatedEvent?.region ?? defaultRoomRegion);
  if (createdNewPersistentRoom) {
    await persistGameStart(roomId, projection, mode, new Date(events[0]?.at ?? Date.now()), region);
  }
  const detectedHiddenDraft960 =
    projection.variant === 'dark-chess' && roomCreatedEvent?.offers !== undefined;
  const hydratedPveEngine = pveEngineSeatForProjection(projection);
  const room: Room = {
    id: roomId,
    clients: new Set(),
    events,
    projection,
    seatTokens,
    clockTimer: null,
    engineTimer: null,
    abortTimer: null,
    abortDeadline: null,
    abortPhase: null,
    forfeitTimer: null,
    forfeitDeadline: null,
    forfeitSeat: null,
    mode,
    gameSpecId: projection.gameSpecId,
    region,
    // Rated request is persisted on the room-created event, so hydration after a
    // restart preserves it. Defaults casual if absent. The room-manager
    // account-gate is still the authoritative rated decision at game end.
    rated: roomCreatedEvent?.rated ?? false,
    randomEngine: hydratedPveEngine !== null,
    engineReservationId: null,
    randomSeating: false,
    creatorPreference: null,
    pveEngineId: hydratedPveEngine ? canonicalEngineVersionId(hydratedPveEngine.clientId) : null,
    pendingWrites: Promise.resolve(),
    gameEndRecorded: projection.state.status.type === 'finished',
    variant: projection.variant,
    hiddenDraft960: detectedHiddenDraft960,
    timeControl: projection.timeControl,
    rematch: { offers: {} },
    pendingVacates: {},
    pauseGraceTimer: null,
  };
  if (hydratedPveEngine && room.projection.state.status.type === 'playing') {
    try {
      room.engineReservationId = await reserveLiveEngineSeat(
        canonicalEngineVersionId(hydratedPveEngine.clientId),
        hydratedPveEngine.color,
      );
    } catch (err) {
      logger.warn(
        {
          kind: 'live_engine_reservation_hydrate_failed',
          room_id: room.id,
          engine_id: canonicalEngineVersionId(hydratedPveEngine.clientId),
          color: hydratedPveEngine.color,
          error: err instanceof Error ? err.message : String(err),
          ...(err instanceof InternalEngineClientError ? { engine_error_reason: err.reason } : {}),
        },
        'live engine reservation hydrate failed',
      );
    }
  }
  rooms.set(roomId, room);
  scheduleClockTimeout(roomMgrCtx, room);
  scheduleAbortTimeout(roomMgrCtx, room);
  scheduleRandomEngineMove(roomMgrCtx, room);
  // Hydrated room came back paused (last event was 'pause'). Arm the grace
  // timer so the game resumes even if both players don't reconnect in time.
  if (room.projection.paused) armPauseGraceTimer(room);
  return room;
}

async function reserveLiveEngineSeat(
  engineId: string,
  color: 'white' | 'black',
): Promise<string | null> {
  if (loadEngine(engineId).config.kind !== 'python-subprocess') return null;
  const reservation = await requestInternalEngineReservation({ engineId, color });
  logger.info(
    {
      kind: 'live_engine_reservation_created',
      engine_id: engineId,
      color,
      reservation_id: reservation.reservationId,
      active_seats: reservation.capacity.activeSeats,
      max_seats: reservation.capacity.maxSeats,
      expires_at: reservation.expiresAt,
    },
    'live engine reservation created',
  );
  return reservation.reservationId;
}

function releaseLiveEngineReservation(reservationId: string, reason: string): void {
  void releaseInternalEngineReservation(reservationId, reason).catch((err) => {
    engineCounters.recordReservationReleaseFailure();
    logger.warn(
      {
        kind: 'live_engine_reservation_release_failed',
        reservation_id: reservationId,
        reason,
        error: err instanceof Error ? err.message : String(err),
        ...(err instanceof InternalEngineClientError ? { engine_error_reason: err.reason } : {}),
      },
      'live engine reservation release failed',
    );
  });
}

function pveEngineSeatForProjection(
  projection: GameProjection,
): { clientId: string; color: 'white' | 'black' } | null {
  const whiteClient = projection.seats.white;
  const blackClient = projection.seats.black;
  const whiteIsEngine = isPlayableLiveEngineClientId(whiteClient);
  const blackIsEngine = isPlayableLiveEngineClientId(blackClient);
  if (whiteIsEngine && !blackIsEngine && whiteClient) {
    return { clientId: whiteClient, color: 'white' };
  }
  if (blackIsEngine && !whiteIsEngine && blackClient) {
    return { clientId: blackClient, color: 'black' };
  }
  return null;
}

async function createRoom(
  mode: 'pvp' | 'pve',
  variant: VariantId,
  engineId: string,
  hiddenDraft960 = false,
  timeControl?: RoomTimeControl,
  rated = false,
  options: {
    randomSeating?: boolean;
    engineColor?: 'white' | 'black';
    engineReservationId?: string;
    // PvP only. When set, the first arrival in this room is assigned this seat;
    // the second arrival gets the other side. Mutually exclusive with randomSeating
    // (random preference uses randomSeating). Ignored for PvE — engine pre-seat
    // is set via engineColor at room creation.
    creatorPreference?: 'white' | 'black';
    region?: string;
  } = {},
): Promise<Room> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomId = randomUUID();
    const existing =
      rooms.get(roomId) ??
      (persistence.isInitialized() ? await persistence.loadRoom(roomId) : null);
    if (existing) continue;

    const at = Date.now();
    const gameSpecId = gameSpecForLegacyLiveRoom({ variant, hiddenDraft960 }).id;
    const region = normalizeRoomRegion(options.region ?? defaultRoomRegion);
    const roomCreated: Extract<GameEvent, { type: 'room-created' }> = {
      type: 'room-created',
      at,
      roomId,
      variant,
      gameSpecId,
      region,
      ...roomCreatedDraftOfferFields(roomId, variant, hiddenDraft960),
      ...(timeControl ? { timeControl } : {}),
      ...(rated ? { rated: true } : {}),
    };
    const events: GameEvent[] = [roomCreated];
    if (mode === 'pve') {
      const engineSeat: 'white' | 'black' = options.engineColor ?? 'black';
      events.push({
        type: 'seat-assigned',
        at,
        roomId,
        clientId: engineId,
        seat: engineSeat,
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
      await persistGameStart(roomId, projection, mode, new Date(at), region);
    }
    const room: Room = {
      id: roomId,
      clients: new Set(),
      events,
      projection,
      seatTokens: {},
      clockTimer: null,
      engineTimer: null,
      abortTimer: null,
      abortDeadline: null,
      abortPhase: null,
      forfeitTimer: null,
      forfeitDeadline: null,
      forfeitSeat: null,
      mode,
      gameSpecId: projection.gameSpecId,
      region,
      rated,
      randomEngine: mode === 'pve',
      engineReservationId: mode === 'pve' ? (options.engineReservationId ?? null) : null,
      randomSeating: options.randomSeating === true && mode === 'pvp',
      creatorPreference:
        mode === 'pvp' && options.creatorPreference ? options.creatorPreference : null,
      pveEngineId: mode === 'pve' ? engineId : null,
      pendingWrites: Promise.resolve(),
      gameEndRecorded: false,
      variant,
      hiddenDraft960,
      timeControl,
      rematch: { offers: {} },
      pendingVacates: {},
      pauseGraceTimer: null,
    };
    rooms.set(roomId, room);
    scheduleClockTimeout(roomMgrCtx, room);
    scheduleAbortTimeout(roomMgrCtx, room);
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
  region = defaultRoomRegion,
): Promise<void> {
  if (!persistence.isInitialized()) return;
  try {
    await persistence.recordGameStart(roomId, {
      variant: projection.variant,
      mode,
      region,
      startedAt,
      whiteClient: projection.seats.white ?? null,
      blackClient: projection.seats.black ?? null,
      whiteName: null,
      blackName: null,
      corpusId: null,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        kind: 'game_start_record_failure',
        roomId,
        error: (err as Error).message,
        at: Date.now(),
      }),
    );
    throw new PersistenceFailure();
  }
}

async function isAbortedRoom(roomId: string): Promise<boolean> {
  if (!persistence.isInitialized()) return false;
  const lifecycle = await persistence.getGameLifecycleStatus(roomId).catch((err) => {
    console.error(
      JSON.stringify({
        level: 'error',
        kind: 'game_lifecycle_status_failure',
        roomId,
        error: (err as Error).message,
        at: Date.now(),
      }),
    );
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
        resetRoom(roomId, 'guest-prestart-timeout');
      }
      console.log(
        JSON.stringify({
          level: 'info',
          kind: 'abort_policy_sweep',
          policy: 'guest-prestart-timeout',
          aborted: result.aborted,
          at: Date.now(),
        }),
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        kind: 'abort_policy_sweep_failure',
        error: (err as Error).message,
        at: Date.now(),
      }),
    );
  }
}

function startStalePausedSweep(): void {
  if (!persistence.isInitialized()) return;
  if (stalePauseMs <= 0) return;
  void runStalePausedSweep();
  stalePausedSweepTimer = setInterval(() => {
    void runStalePausedSweep();
  }, stalePausedSweepMs);
}

async function runStalePausedSweep(): Promise<void> {
  const now = new Date();
  try {
    const result = await persistence.finalizeStalePausedRooms(now, stalePauseMs);
    if (result.finalized === 0) return;
    for (const room of result.rooms) {
      resetRoom(room.roomId, 'stale-paused-finalized');
      // Per-room line: every stale-paused finalize is a yellow flag worth
      // investigating, since post-restart the resume path is expected to
      // either bring the game back or forfeit the absent player.
      console.log(
        JSON.stringify({
          level: 'warn',
          kind: 'stale_paused_finalized',
          roomId: room.roomId,
          mode: room.mode,
          pause_reason: room.pauseReason,
          paused_at: room.pausedAtMs,
          paused_duration_ms: now.getTime() - room.pausedAtMs,
          started_at: room.startedAt.getTime(),
          ply_count: room.plyCount,
          at: now.getTime(),
        }),
      );
    }
    console.log(
      JSON.stringify({
        level: 'info',
        kind: 'stale_paused_sweep',
        stale_paused_finalized_total: result.finalized,
        at: now.getTime(),
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        kind: 'stale_paused_sweep_failure',
        error: (err as Error).message,
        at: now.getTime(),
      }),
    );
  }
}

async function abandonRoom(
  roomId: string,
  seatToken: string,
): Promise<{ ok: true } | { ok: false; error: 'not_found' | 'unauthorized' | 'already_terminal' }> {
  // Verify against persistence (source of truth across instances) rather than
  // in-memory room state — the abandon HTTP request can land on a different
  // instance from the one that handled room creation (notably during a
  // Railway deploy cutover when both old and new containers serve traffic).
  if (persistence.isInitialized()) {
    const lifecycle = await persistence.getGameLifecycleStatus(roomId);
    if (!lifecycle) return { ok: false, error: 'not_found' };
    if (lifecycle.status !== 'running') return { ok: false, error: 'already_terminal' };
    const verified = await persistence.verifyRoomSeatToken(roomId, seatToken);
    if (!verified) return { ok: false, error: 'unauthorized' };
    await persistence.abortRunningGame(roomId, {
      abortedReason: 'abandoned by creator',
      termination: 'abandoned',
    });
    resetRoom(roomId, 'abandoned');
    return { ok: true };
  }
  // In-memory fallback for tests / dev servers running without persistence.
  const room = rooms.get(roomId);
  if (!room) return { ok: false, error: 'not_found' };
  if (!verifySeatToken(room, seatToken)) return { ok: false, error: 'unauthorized' };
  if (room.projection.state.status.type === 'finished')
    return { ok: false, error: 'already_terminal' };
  resetRoom(roomId, 'abandoned');
  return { ok: true };
}

// ── SECTION: Seat management ───────────────────────────────────────────────
async function assignSeat(
  room: Room,
  clientId: string,
  suppliedSeatToken: string | undefined,
  accountUser: persistence.UserAccount | null,
): Promise<SeatAssignment> {
  // Credential gate for claiming an EXISTING seat. authorizeExistingSeat owns
  // the policy (token vs account identity); see seat-auth.ts. A denial means a
  // valid token was presented for an account-bound seat by the wrong (or no)
  // identity — that connection becomes a spectator, never the seat-holder, so
  // it can neither move nor cancel a forfeit countdown.
  const tokenSeat = verifySeatToken(room, suppliedSeatToken);
  const decision = authorizeExistingSeat(room.seatTokens, tokenSeat, accountUser?.id ?? null);
  if (decision.kind === 'deny') return { seat: 'spectator' };
  if (decision.kind === 'grant') {
    const state = room.seatTokens[decision.seat];
    if (state) {
      state.lastSeenAt = new Date();
      await touchSeatToken(roomMgrCtx, room, state);
    }
    await startLiveClockIfReady(roomMgrCtx, room);
    // Identity reclaim issues no new raw token (the holder re-authenticates by
    // session each connect); the hash still flows so displacement can match.
    return { seat: decision.seat, seatTokenHash: decision.tokenHash };
  }
  if (room.projection.seats.white === clientId) {
    await startLiveClockIfReady(roomMgrCtx, room);
    return await existingSeatAssignment(room, 'white', clientId, accountUser);
  }
  if (room.projection.seats.black === clientId) {
    await startLiveClockIfReady(roomMgrCtx, room);
    return await existingSeatAssignment(room, 'black', clientId, accountUser);
  }
  if (room.randomSeating && !room.projection.seats.white && !room.projection.seats.black) {
    const seat: Color = randomBytes(1)[0]! < 128 ? 'white' : 'black';
    await appendEvent(roomMgrCtx, room, {
      type: 'seat-assigned',
      at: Date.now(),
      roomId: room.id,
      clientId,
      seat,
    });
    await startLiveClockIfReady(roomMgrCtx, room);
    return await newSeatAssignment(room, seat, clientId, accountUser);
  }
  if (room.creatorPreference && !room.projection.seats.white && !room.projection.seats.black) {
    const seat = room.creatorPreference;
    await appendEvent(roomMgrCtx, room, {
      type: 'seat-assigned',
      at: Date.now(),
      roomId: room.id,
      clientId,
      seat,
    });
    await startLiveClockIfReady(roomMgrCtx, room);
    return await newSeatAssignment(room, seat, clientId, accountUser);
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
  return seatsShareAuthority(left, right, isServerEngineClient);
}

// ── SECTION: Game flow ─────────────────────────────────────────────────────
async function enableRandomEngine(room: Room): Promise<void> {
  room.randomEngine = true;
  room.pveEngineId = pveBuiltinEngineClientId;
  if (room.projection.variant !== 'dark-chess') return;
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

async function selectStart(
  room: Room,
  client: Client,
  startId: number | undefined,
  color: string | undefined,
): Promise<void> {
  if (!canClientAct(room, client)) return;
  const selectionColor = client.solo && isColor(color) ? color : client.seat;
  if (selectionColor === 'spectator') return;
  if (room.projection.state.status.type !== 'pregame') return;
  if (!offerForColor(room.projection, selectionColor).some((start) => start.id === startId)) return;
  if (startId === undefined) return;

  const fromSeq = room.events.length;
  await appendEvent(roomMgrCtx, room, {
    type: 'draft-start-selected',
    at: Date.now(),
    roomId: room.id,
    color: selectionColor,
    startId,
  });
  await resolveStartIfReady(roomMgrCtx, room);
  broadcastEventAppended(roomMgrCtx, room, fromSeq);
}

async function handleResign(room: Room, client: Client): Promise<void> {
  if (!canClientAct(room, client)) return;
  if (client.seat !== 'white' && client.seat !== 'black') return;
  if (room.projection.state.status.type !== 'playing') return;
  // Before both players have completed their first move the game isn't a real
  // contest yet — bailing is an abort (no result), not a resignation (which
  // would wrongly award the opponent a win). Resign is only valid from move 2.
  if (room.projection.state.moveNumber < 2) return;
  const fromSeq = room.events.length;
  await appendEvent(roomMgrCtx, room, {
    type: 'seat-resigned',
    at: Date.now(),
    roomId: room.id,
    color: client.seat,
  });
  broadcastEventAppended(roomMgrCtx, room, fromSeq);
}

async function handleAbort(room: Room, client: Client): Promise<void> {
  if (!canClientAct(room, client)) return;
  if (client.seat !== 'white' && client.seat !== 'black') return;
  if (room.projection.state.status.type !== 'playing') return;
  // Abort is available only before both players have completed their first move,
  // and only to the side whose move is pending (the same side that sees the
  // Abort button in place of Resign). The reducer enforces the moveNumber guard
  // too; this is the server-authority check on the inbound message.
  if (room.projection.state.moveNumber >= 2) return;
  if (room.projection.state.status.turn !== client.seat) return;
  const fromSeq = room.events.length;
  await appendEvent(roomMgrCtx, room, {
    type: 'game-aborted',
    at: Date.now(),
    roomId: room.id,
    reason: 'user-abort',
  });
  broadcastEventAppended(roomMgrCtx, room, fromSeq);
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
    rated: summary.rated ?? false,
    jobId: null,
    gameIndex: null,
    whiteEngineId: null,
    blackEngineId: null,
    timeControl: null,
    initialMs: summary.initialMs ?? null,
    incrementMs: summary.incrementMs ?? null,
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
  console.error(
    JSON.stringify({
      level: 'error',
      kind: 'persistence_failure',
      roomId,
      seq,
      eventType: event.type,
      error: err.message,
      at: entry.at,
    }),
  );
}

function resetRoom(roomId: string, reason = 'room-reset'): void {
  const room = rooms.get(roomId);
  if (room?.clockTimer) clearTimeout(room.clockTimer);
  if (room?.engineTimer) clearTimeout(room.engineTimer);
  if (room) clearAbortTimer(room);
  if (room) clearForfeitTimer(room);
  if (room?.pauseGraceTimer) clearTimeout(room.pauseGraceTimer);
  if (room?.engineReservationId) {
    releaseLiveEngineReservation(room.engineReservationId, reason);
    room.engineReservationId = null;
  }
  rooms.delete(roomId);
}

// ── SECTION: Helpers and shutdown ──────────────────────────────────────────
function send(client: Client, payload: unknown): void {
  client.socket.send(JSON.stringify(payload));
}

function parseMessage(raw: string): {
  type: string;
  startId?: number;
  color?: string;
  from?: string;
  to?: string;
  promotion?: string;
  token?: string;
  at?: number;
  rttMs?: number;
} | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value === 'object' && value !== null && 'type' in value) {
      return value as { type: string; startId?: number };
    }
    // Parse succeeded but the shape is wrong (e.g. JSON array, scalar, or
    // object missing `type`). Still a failure from the dispatcher's view.
    wsCounters.recordParseFailure();
    return null;
  } catch {
    wsCounters.recordParseFailure();
    return null;
  }
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
  if (variant !== 'draft960' && !(variant === 'dark-chess' && hiddenDraft960)) return { offer: [] };

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
  return isAdminDebugToken(
    adminDebugTokenFromProtocolHeader(request.headers['sec-websocket-protocol']),
  );
}

function isAllowedWebSocketRequest(request: IncomingMessage): boolean {
  return isAllowedWebSocketOrigin(request.headers.origin, request.headers.host);
}

function recordClientMessage(client: Client): boolean {
  return recordMessageTimestamp(
    client.messageTimestamps,
    Date.now(),
    wsMessageLimit,
    wsMessageWindowMs,
  );
}

// Arm a one-shot timer that force-resumes a paused room after the grace
// window, regardless of whether both players reconnected. Safe to call
// repeatedly (subsequent calls are no-ops while a timer is already armed).
function armPauseGraceTimer(room: Room): void {
  if (!room.projection.paused) return;
  if (room.pauseGraceTimer) return;
  room.pauseGraceTimer = setTimeout(() => {
    room.pauseGraceTimer = null;
    const fromSeq = room.events.length;
    void resumeRoom(roomMgrCtx, room, Date.now(), 'grace-elapsed')
      .then(() => {
        if (room.projection.state.status.type === 'playing' && !room.projection.paused) {
          scheduleClockTimeout(roomMgrCtx, room);
          scheduleAbortTimeout(roomMgrCtx, room);
          scheduleRandomEngineMove(roomMgrCtx, room);
        }
        broadcastEventAppended(roomMgrCtx, room, fromSeq);
      })
      .catch((err) => {
        if (!(err instanceof PersistenceFailure)) {
          console.error(
            JSON.stringify({
              level: 'error',
              kind: 'pause_grace_resume_failure',
              roomId: room.id,
              error: (err as Error).message,
              at: Date.now(),
            }),
          );
        }
      });
  }, pauseGraceMs);
}

// Iterate active rooms and append a 'pause' event for each one that's still
// playing. Awaits in parallel — each room serializes writes through its own
// pendingWrites chain, so concurrent calls are safe.
async function pauseActiveRoomsOnShutdown(): Promise<void> {
  if (rooms.size === 0) return;
  const at = Date.now();
  const results = await Promise.allSettled(
    [...rooms.values()].map((room) => pauseRoomOnShutdown(roomMgrCtx, room, at)),
  );
  for (const [idx, result] of results.entries()) {
    if (result.status === 'rejected') {
      const room = [...rooms.values()][idx];
      console.error(
        JSON.stringify({
          level: 'error',
          kind: 'pause_on_shutdown_failure',
          roomId: room?.id,
          error: (result.reason as Error)?.message,
          at: Date.now(),
        }),
      );
    }
  }
}

async function shutdown(signal: 'SIGINT' | 'SIGTERM'): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(
    JSON.stringify({ level: 'info', kind: 'server_shutdown_requested', signal, at: Date.now() }),
  );

  const forceExit = setTimeout(() => {
    console.error(
      JSON.stringify({ level: 'error', kind: 'server_shutdown_timeout', signal, at: Date.now() }),
    );
    process.exit(1);
  }, shutdownGraceMs);
  forceExit.unref();

  await pauseActiveRoomsOnShutdown();

  for (const room of rooms.values()) {
    if (room.clockTimer) clearTimeout(room.clockTimer);
    if (room.engineTimer) clearTimeout(room.engineTimer);
    clearAbortTimer(room);
    clearForfeitTimer(room);
    if (room.pauseGraceTimer) clearTimeout(room.pauseGraceTimer);
  }
  if (abortPolicyTimer) clearInterval(abortPolicyTimer);
  for (const client of [...rooms.values()].flatMap((room) => [...room.clients])) {
    try {
      client.socket.close(1001, 'server shutting down');
    } catch {
      /* socket already closed */
    }
  }

  let exitCode = 0;
  try {
    await Promise.allSettled([...rooms.values()].map((room) => room.pendingWrites));
    await closeWebSocketServer();
    await closeHttpServer();
    await persistence.close();
  } catch (err) {
    exitCode = 1;
    console.error(
      JSON.stringify({
        level: 'error',
        kind: 'server_shutdown_failure',
        error: (err as Error).message,
        at: Date.now(),
      }),
    );
  } finally {
    clearTimeout(forceExit);
  }
  process.exit(exitCode);
}

function closeWebSocketServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!wss) {
      resolve();
      return;
    }
    wss.close(() => resolve());
  });
}

function closeHttpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
