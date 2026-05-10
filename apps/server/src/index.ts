import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
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
import { chooseLiveEngineMove } from './live-engine.js';
import { snapshotPayload, type Seat } from './payloads.js';
import {
  displayNameForEmail,
  handleBaseForEmail,
  normalizeDisplayName,
  normalizeEmail,
  normalizeProfileHandle,
} from './account-identity.js';
import {
  adminDebugTokenFromProtocolHeader,
  canObserveLiveRoom,
  eventReplayResponse,
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

type Client = {
  debugRequested: boolean;
  devViews: boolean;
  id: string;
  messageTimestamps: number[];
  socket: WebSocket;
  roomId: string;
  seat: Seat;
  seatTokenHash?: string;
  displaced: boolean;
  solo: boolean;
};

type SeatTokenState = {
  clientId: string;
  seat: Color;
  tokenHash: string;
  userId: string | null;
  userHandle: string | null;
  userDisplayName: string | null;
  issuedAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
};

type SeatAssignment = {
  seat: Seat;
  seatToken?: string;
  seatTokenHash?: string;
};

type Room = {
  id: string;
  clients: Set<Client>;
  events: GameEvent[];
  projection: GameProjection;
  seatTokens: Partial<Record<Color, SeatTokenState>>;
  clockTimer: ReturnType<typeof setTimeout> | null;
  engineTimer: ReturnType<typeof setTimeout> | null;
  mode: persistence.GameMode;
  randomEngine: boolean;
  pveEngineId: string | null;
  pendingWrites: Promise<void>;
  gameEndRecorded: boolean;
};

type LobbyTicket = {
  id: string;
  createdAt: number;
  hiddenDraft960: boolean;
  matchedAt: number | null;
  roomId: string | null;
  timeControl: RoomTimeControl | undefined;
};

const rooms = new Map<string, Room>();
const lobbyTickets = new Map<string, LobbyTicket>();
const lobbyQueue: LobbyTicket[] = [];
const port = Number(process.env.PORT ?? 3001);
const databaseRequired = isDatabaseRequired();
const wsMaxPayloadBytes = parsePositiveInteger(process.env.MISTBOARD_WS_MAX_PAYLOAD_BYTES) ?? 8_192;
const wsMessageLimit = parsePositiveInteger(process.env.MISTBOARD_WS_MESSAGE_LIMIT) ?? 40;
const wsMessageWindowMs = parsePositiveInteger(process.env.MISTBOARD_WS_MESSAGE_WINDOW_MS) ?? 10_000;
const shutdownGraceMs = parsePositiveInteger(process.env.MISTBOARD_SHUTDOWN_GRACE_MS) ?? 10_000;
const liveClockInitialMs = 30_000;
const liveClockIncrementMs = 2_000;
const minRoomClockInitialMs = 10_000;
const maxRoomClockInitialMs = 180 * 60 * 1000;
const maxRoomClockIncrementMs = 60_000;
const pveEngineMoveDelayMs = parsePositiveInteger(process.env.MISTBOARD_PVE_ENGINE_DELAY_MS) ?? 650;
const liveEngineTimeoutMs = parsePositiveInteger(process.env.MISTBOARD_LIVE_ENGINE_TIMEOUT_MS) ?? 3_000;
const guestPrestartAbortMs = parseNonNegativeInteger(process.env.MISTBOARD_GUEST_PRESTART_ABORT_MS) ?? 15 * 60 * 1000;
const abortPolicySweepMs = parsePositiveInteger(process.env.MISTBOARD_ABORT_POLICY_SWEEP_MS) ?? 60_000;
const lobbyTicketTtlMs = 5 * 60 * 1000;
const lobbyPollAfterMs = 1_000;
const pveBuiltinEngineClientId = 'builtin-random-legal';
const accountSessionCookieName = 'mistboard_session';
const accountSessionTtlMs = 30 * 24 * 60 * 60 * 1000;
const emailLoginCodeTtlMs = 10 * 60 * 1000;
const devAuthCodesEnabled = !isProductionLikeRuntime() || process.env.MISTBOARD_DEV_AUTH_CODES === 'true';
const resendApiKey = process.env.RESEND_API_KEY;
const authEmailFrom = process.env.MISTBOARD_AUTH_EMAIL_FROM ?? process.env.RESEND_FROM_EMAIL;
const authEmailDeliveryEnabled = !!resendApiKey && !!authEmailFrom;

const persistenceErrors: Array<{ at: number; roomId: string; eventType: string }> = [];
const PERSISTENCE_ERROR_RETENTION_MS = 3_600_000;

const staticDir = resolveStaticDir();

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

async function handleApiRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = request.url ?? '/';
  const parsedUrl = new URL(url, 'http://localhost');
  const method = request.method ?? 'GET';

  if (parsedUrl.pathname === '/api/auth/me') {
    if (method !== 'GET') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    const user = await currentAccountUser(request);
    writeJson(response, 200, { user: user ? publicUser(user) : null });
    return;
  }

  if (url === '/api/engines/playable') {
    if (method !== 'GET') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    writeJson(response, 200, {
      engines: playableLiveEngines().map((engine) => ({
        id: engine.id,
        name: engine.name,
        familyName: engine.engineName,
        kind: engine.kind,
      })),
    });
    return;
  }

  if (parsedUrl.pathname === '/api/auth/email/start') {
    if (method !== 'POST') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    if (!persistence.isInitialized()) {
      writeJson(response, 503, { error: 'persistence_disabled' });
      return;
    }
    if (!authEmailDeliveryEnabled && !devAuthCodesEnabled) {
      writeJson(response, 503, { error: 'email_delivery_not_configured' });
      return;
    }
    const body = await readJsonBody(request);
    const email = normalizeEmail(typeof body.email === 'string' ? body.email : null);
    if (!email) {
      writeJson(response, 400, { error: 'invalid_email' });
      return;
    }
    const loginId = randomUUID();
    const code = randomEmailLoginCode();
    const expiresAt = new Date(Date.now() + emailLoginCodeTtlMs);
    await persistence.createEmailLoginChallenge({
      id: loginId,
      email,
      codeHash: hashSecret(code),
      expiresAt,
    });
    if (authEmailDeliveryEnabled) {
      const delivery = await sendEmailLoginCode(email, code);
      if (!delivery.ok) {
        await persistence.deleteEmailLoginChallenge(loginId);
        writeJson(response, 502, { error: 'email_delivery_failed' });
        return;
      }
    }
    writeJson(response, 202, {
      loginId,
      email,
      expiresAt: expiresAt.toISOString(),
      delivery: authEmailDeliveryEnabled ? 'email' : 'dev-response',
      ...(devAuthCodesEnabled ? { devCode: code } : {}),
    });
    return;
  }

  if (parsedUrl.pathname === '/api/auth/email/confirm') {
    if (method !== 'POST') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    if (!persistence.isInitialized()) {
      writeJson(response, 503, { error: 'persistence_disabled' });
      return;
    }
    const body = await readJsonBody(request);
    const loginId = typeof body.loginId === 'string' ? body.loginId.trim() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!loginId || !code) {
      writeJson(response, 400, { error: 'invalid_login_code' });
      return;
    }
    const now = new Date();
    const challenge = await persistence.consumeEmailLoginChallenge(loginId, hashSecret(code), now);
    if (!challenge) {
      writeJson(response, 400, { error: 'invalid_login_code' });
      return;
    }

    const user = await ensureUserForEmail(challenge.email, now);
    const sessionId = randomUUID();
    const sessionToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + accountSessionTtlMs);
    await persistence.createAccountSession({
      id: sessionId,
      userId: user.id,
      tokenHash: hashSecret(sessionToken),
      expiresAt,
    });
    writeJson(response, 200, { user: publicUser(user) }, {
      'set-cookie': accountSessionCookie(sessionId, sessionToken, expiresAt),
    });
    return;
  }

  if (parsedUrl.pathname === '/api/auth/logout') {
    if (method !== 'POST') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    const session = accountSessionFromRequest(request);
    if (session && persistence.isInitialized()) {
      await persistence.revokeAccountSession(session.sessionId, hashSecret(session.token), new Date());
    }
    writeJson(response, 200, { ok: true }, {
      'set-cookie': expiredAccountSessionCookie(),
    });
    return;
  }

  if (parsedUrl.pathname === '/api/account/profile') {
    if (method !== 'PATCH') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    if (!persistence.isInitialized()) {
      writeJson(response, 503, { error: 'persistence_disabled' });
      return;
    }
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return;
    }
    const body = await readJsonBody(request);
    const handle = normalizeProfileHandle(typeof body.handle === 'string' ? body.handle : null);
    const displayName = normalizeDisplayName(typeof body.displayName === 'string' ? body.displayName : null);
    if (!handle) {
      writeJson(response, 400, { error: 'invalid_handle' });
      return;
    }
    if (!displayName) {
      writeJson(response, 400, { error: 'invalid_display_name' });
      return;
    }
    const result = await persistence.updateUserProfile(user.id, { handle, displayName }, new Date());
    if (!result.ok) {
      writeJson(response, result.error === 'handle_taken' ? 409 : 429, {
        error: result.error,
        ...(result.availableAt ? { availableAt: result.availableAt.toISOString() } : {}),
      });
      return;
    }
    writeJson(response, 200, { user: publicUser(result.user) });
    return;
  }

  if (url === '/api/rooms') {
    if (method !== 'POST') {
      response.writeHead(405, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }
    const body = await readJsonBody(request);
    const mode = parseRoomMode(body);
    const variant = parseVariantId(typeof body.variant === 'string' ? body.variant : null);
    const hiddenDraft960 = parseHiddenDraft960(body.hiddenDraft960);
    const engineId = mode === 'pve' ? parsePlayablePveEngineId(body.engineId) : null;
    const timeControl = body.timeControl === undefined ? undefined : parseRoomTimeControl(body.timeControl);
    if (!mode) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid_mode' }));
      return;
    }
    if (body.timeControl !== undefined && !timeControl) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid_time_control' }));
      return;
    }
    if (mode === 'pve' && body.engineId !== undefined && !engineId) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid_engine' }));
      return;
    }
    if (databaseRequired && !persistence.isInitialized()) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'persistence_disabled' }));
      return;
    }
    const room = await createRoom(mode, variant, engineId ?? pveBuiltinEngineClientId, hiddenDraft960, timeControl ?? undefined);
    response.writeHead(201, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ roomId: room.id, url: `/room/${encodeURIComponent(room.id)}`, mode: room.mode }));
    return;
  }

  if (url === '/api/lobby') {
    if (method === 'GET') {
      pruneLobbyTickets();
      writeJson(response, 200, { requests: lobbyOpenRequests() });
      return;
    }
    if (method !== 'POST') {
      response.writeHead(405, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }
    const body = await readJsonBody(request);
    const hiddenDraft960 = parseHiddenDraft960(body.hiddenDraft960);
    const timeControl = body.timeControl === undefined ? undefined : parseRoomTimeControl(body.timeControl);
    if (body.timeControl !== undefined && !timeControl) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid_time_control' }));
      return;
    }
    if (databaseRequired && !persistence.isInitialized()) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'persistence_disabled' }));
      return;
    }
    const ticket = await joinLobby(hiddenDraft960, timeControl ?? undefined);
    writeJson(response, ticket.roomId ? 201 : 202, lobbyTicketResponse(ticket));
    return;
  }

  const lobbyMatch = parsedUrl.pathname.match(/^\/api\/lobby\/([^/]+)$/);
  if (lobbyMatch) {
    pruneLobbyTickets();
    const ticketId = decodeURIComponent(lobbyMatch[1]!);
    const ticket = lobbyTickets.get(ticketId);
    if (!ticket) {
      writeJson(response, 404, { error: 'not_found' });
      return;
    }
    if (method === 'GET') {
      writeJson(response, 200, lobbyTicketResponse(ticket));
      return;
    }
    if (method === 'DELETE') {
      cancelLobbyTicket(ticketId);
      writeJson(response, 200, { ok: true });
      return;
    }
    response.writeHead(405, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  if (url === '/api/games/recent') {
    if (!persistence.isInitialized()) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'persistence_disabled' }));
      return;
    }
    const games = await persistence.listRecentPublicGames(10);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ games }));
    return;
  }

  const reviewMatch = url.match(/^\/api\/games\/([^/]+)\/review$/);
  if (reviewMatch) {
    if (method !== 'GET') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    const roomId = decodeURIComponent(reviewMatch[1]!);
    const review = await gameReviewForApi(roomId, request);
    if (!review) {
      writeJson(response, 404, { error: 'not_found' });
      return;
    }
    writeJson(response, 200, review);
    return;
  }

  const summaryMatch = url.match(/^\/api\/games\/([^/]+)$/);
  if (summaryMatch) {
    const roomId = decodeURIComponent(summaryMatch[1]!);
    const game = await gameSummaryForApi(roomId);
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
    const events = await gameEventsForApi(roomId);
    const replayResponse = eventReplayResponse(events);
    response.writeHead(replayResponse.status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(replayResponse.body));
    return;
  }

  const profileMatch = parsedUrl.pathname.match(/^\/api\/users\/([^/]+)\/profile$/);
  if (profileMatch) {
    if (method !== 'GET') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    if (!persistence.isInitialized()) {
      writeJson(response, 503, { error: 'persistence_disabled' });
      return;
    }
    const handle = decodeURIComponent(profileMatch[1] ?? '').trim();
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(handle)) {
      writeJson(response, 400, { error: 'invalid_handle' });
      return;
    }
    const viewer = await currentAccountUser(request);
    const profile = await persistence.getUserProfileByHandle(handle, viewer?.id ?? null);
    if (!profile) {
      writeJson(response, 404, { error: 'not_found' });
      return;
    }
    writeJson(response, 200, {
      profile: {
        ...profile,
        isViewer: viewer?.handle.toLowerCase() === profile.user.handle.toLowerCase(),
      },
    });
    return;
  }

  if (!persistence.isInitialized()) {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'persistence_disabled' }));
    return;
  }

  if (parsedUrl.pathname === '/api/games') {
    if (method !== 'GET') {
      response.writeHead(405, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }
    if (!isHttpAdminAuthorized(request)) {
      response.writeHead(403, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'admin_required' }));
      return;
    }

    const date = parseUtcDateParam(parsedUrl.searchParams.get('date'));
    const mode = parseGameModeParam(parsedUrl.searchParams.get('mode'));
    const limit = parsePositiveInteger(parsedUrl.searchParams.get('limit') ?? undefined);
    if (!date) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid_date' }));
      return;
    }
    if (parsedUrl.searchParams.has('mode') && !mode) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid_mode' }));
      return;
    }

    const endedFrom = date;
    const endedTo = new Date(endedFrom.getTime() + 24 * 60 * 60 * 1000);
    const games = await persistence.listCompletedGames({
      endedFrom,
      endedTo,
      ...(limit ? { limit } : {}),
      ...(mode ? { mode } : {}),
    });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      games,
      range: {
        date: parsedUrl.searchParams.get('date'),
        endedFrom: endedFrom.toISOString(),
        endedTo: endedTo.toISOString(),
      },
    }));
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

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not_found' }));
}

async function gameSummaryForApi(roomId: string): Promise<persistence.RecentEveGameRecord | null> {
  const persisted = persistence.isInitialized()
    ? await persistence.getGameSummary(roomId)
    : null;
  return persisted ?? inMemoryGameSummary(roomId);
}

async function gameEventsForApi(roomId: string): Promise<GameEvent[] | null> {
  const persisted = persistence.isInitialized()
    ? await persistence.loadRoom(roomId)
    : null;
  return persisted ?? rooms.get(roomId)?.events ?? null;
}

async function gameReviewForApi(roomId: string, request: IncomingMessage): Promise<Record<string, unknown> | null> {
  const game = await gameSummaryForApi(roomId);
  const events = await gameEventsForApi(roomId);
  const replayResponse = eventReplayResponse(events);
  if (!game || replayResponse.status !== 200) return null;

  const canViewEngineArtifacts = await canViewEngineArtifactsForRequest(request);
  const artifactSummaries = persistence.isInitialized()
    ? await persistence.listGameDebugArtifactSummaries(roomId)
    : [];
  const engineColors = engineParticipantColors(game);
  const hasEngineParticipant = engineColors.length > 0;
  const beliefArtifacts = artifactSummaries.filter((artifact) => artifact.artifactType === 'belief-snapshot');
  const traceArtifacts = artifactSummaries.filter((artifact) => (
    artifact.artifactType === 'engine-move-choice'
    || artifact.artifactType === 'trace-row'
  ));
  const beliefColors = intersectionColors(engineColors, artifactColors(beliefArtifacts));
  const traceColors = intersectionColors(engineColors, artifactColors(traceArtifacts));

  return {
    game,
    events: replayResponse.body.events,
    capabilities: {
      canViewEngineArtifacts,
      canAnnotate: false,
      canManageEngineArtifacts: canViewEngineArtifacts,
    },
    panels: {
      belief: {
        available: canViewEngineArtifacts && hasEngineParticipant && beliefArtifacts.length > 0 && beliefColors.length > 0,
        defaultOpen: false,
        seats: beliefColors,
        snapshotKinds: uniqueStrings(beliefArtifacts.flatMap((artifact) => artifact.snapshotKinds)),
      },
      trace: {
        available: canViewEngineArtifacts && hasEngineParticipant && traceArtifacts.length > 0 && traceColors.length > 0,
        defaultOpen: false,
        seats: traceColors,
      },
      annotations: {
        available: false,
        writable: false,
      },
    },
    artifacts: canViewEngineArtifacts ? artifactSummaries : [],
  };
}

async function canViewEngineArtifactsForRequest(request: IncomingMessage): Promise<boolean> {
  if (!isProductionLikeRuntime()) return true;
  const user = await currentAccountUser(request);
  return user?.accountRole === 'admin';
}

function engineParticipantColors(game: persistence.RecentEveGameRecord): Color[] {
  return game.participants
    .filter((participant) => participant.subjectType === 'engine-version')
    .map((participant) => participant.color);
}

function artifactColors(artifacts: persistence.GameDebugArtifactSummary[]): Color[] {
  return uniqueColors(artifacts.flatMap((artifact) => artifact.engineColors));
}

function intersectionColors(left: Color[], right: Color[]): Color[] {
  const rightSet = new Set(right);
  return uniqueColors(left.filter((color) => rightSet.has(color)));
}

function uniqueColors(values: Color[]): Color[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
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

function parseHiddenDraft960(value: unknown): boolean {
  return value === true || value === '1' || value === 'true' || value === 'yes';
}

function parsePlayablePveEngineId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return playableLiveEngines().some((engine) => engine.id === value) ? value : null;
}

function parseRoomTimeControl(value: unknown): RoomTimeControl | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const initialMs = parseIntegerValue(raw.initialMs ?? raw.initial_ms);
  const incrementMs = parseIntegerValue(raw.incrementMs ?? raw.increment_ms);
  if (initialMs === null || incrementMs === null) return null;
  if (initialMs < minRoomClockInitialMs || initialMs > maxRoomClockInitialMs) return null;
  if (incrementMs < 0 || incrementMs > maxRoomClockIncrementMs) return null;
  return { initialMs, incrementMs };
}

function parseIntegerValue(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value;
}

async function joinLobby(hiddenDraft960: boolean, timeControl: RoomTimeControl | undefined): Promise<LobbyTicket> {
  pruneLobbyTickets();
  const timeKey = timeControlKey(timeControl);
  const matchedTicket = lobbyQueue.find((ticket) => (
    ticket.roomId === null
    && ticket.hiddenDraft960 === hiddenDraft960
    && timeControlKey(ticket.timeControl) === timeKey
  ));
  const ticket: LobbyTicket = {
    id: randomUUID(),
    createdAt: Date.now(),
    hiddenDraft960,
    matchedAt: null,
    roomId: null,
    timeControl,
  };
  lobbyTickets.set(ticket.id, ticket);

  if (!matchedTicket) {
    lobbyQueue.push(ticket);
    return ticket;
  }

  let room: Room;
  try {
    room = await createRoom('pvp', 'fog-of-war', pveBuiltinEngineClientId, hiddenDraft960, timeControl);
  } catch (err) {
    lobbyTickets.delete(ticket.id);
    throw err;
  }
  const matchedAt = Date.now();
  matchedTicket.matchedAt = matchedAt;
  matchedTicket.roomId = room.id;
  ticket.matchedAt = matchedAt;
  ticket.roomId = room.id;
  const matchedIndex = lobbyQueue.findIndex((candidate) => candidate.id === matchedTicket.id);
  if (matchedIndex >= 0) lobbyQueue.splice(matchedIndex, 1);
  return ticket;
}

function cancelLobbyTicket(ticketId: string): void {
  const ticket = lobbyTickets.get(ticketId);
  if (!ticket || ticket.roomId !== null) return;
  lobbyTickets.delete(ticketId);
  const queueIndex = lobbyQueue.findIndex((candidate) => candidate.id === ticketId);
  if (queueIndex >= 0) lobbyQueue.splice(queueIndex, 1);
}

function pruneLobbyTickets(now = Date.now()): void {
  for (const [ticketId, ticket] of lobbyTickets) {
    if (now - ticket.createdAt >= lobbyTicketTtlMs) {
      lobbyTickets.delete(ticketId);
    }
  }
  for (let index = lobbyQueue.length - 1; index >= 0; index -= 1) {
    const ticket = lobbyQueue[index];
    if (!ticket || !lobbyTickets.has(ticket.id) || ticket.roomId !== null) {
      lobbyQueue.splice(index, 1);
    }
  }
}

function lobbyTicketResponse(ticket: LobbyTicket): Record<string, unknown> {
  return {
    ticketId: ticket.id,
    status: ticket.roomId ? 'matched' : 'waiting',
    pollAfterMs: lobbyPollAfterMs,
    ...(ticket.roomId ? {
      roomId: ticket.roomId,
      url: `/room/${encodeURIComponent(ticket.roomId)}`,
    } : {}),
  };
}

function lobbyOpenRequests(): Array<Record<string, unknown>> {
  const now = Date.now();
  return lobbyQueue
    .filter((ticket) => ticket.roomId === null)
    .slice(0, 20)
    .map((ticket) => ({
      hiddenDraft960: ticket.hiddenDraft960,
      timeControl: ticket.timeControl ?? {
        initialMs: liveClockInitialMs,
        incrementMs: liveClockIncrementMs,
      },
      waitingMs: Math.max(0, now - ticket.createdAt),
    }));
}

function timeControlKey(timeControl: RoomTimeControl | undefined): string {
  return timeControl ? `${timeControl.initialMs}:${timeControl.incrementMs}` : 'default';
}

async function currentAccountUser(request: IncomingMessage): Promise<persistence.UserAccount | null> {
  if (!persistence.isInitialized()) return null;
  const session = accountSessionFromRequest(request);
  if (!session) return null;
  return persistence.getUserByAccountSession(session.sessionId, hashSecret(session.token), new Date());
}

async function ensureUserForEmail(email: string, now: Date): Promise<persistence.UserAccount> {
  const existing = await persistence.findUserByEmail(email);
  if (existing) return persistence.markUserEmailVerified(existing.id, now);

  const baseHandle = handleBaseForEmail(email);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const handle = attempt === 0 ? baseHandle : `${baseHandle}${randomInt(10_000, 99_999)}`;
    try {
      return await persistence.createUser({
        id: `user_${randomUUID()}`,
        email,
        emailVerifiedAt: now,
        handle,
        displayName: displayNameForEmail(email),
        now,
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const raced = await persistence.findUserByEmail(email);
      if (raced) return persistence.markUserEmailVerified(raced.id, now);
    }
  }
  throw new Error('failed to allocate user handle');
}

function publicUser(user: persistence.UserAccount): Record<string, unknown> {
  return {
    id: user.id,
    email: user.email,
    emailVerified: !!user.emailVerifiedAt,
    handle: user.handle,
    handleChangedAt: user.handleChangedAt?.toISOString() ?? null,
    displayName: user.displayName,
    displayNameChangedAt: user.displayNameChangedAt?.toISOString() ?? null,
    profileVisibility: user.profileVisibility,
    accountRole: user.accountRole,
  };
}

function randomEmailLoginCode(): string {
  return String(randomInt(0, 100_000_000)).padStart(8, '0');
}

async function sendEmailLoginCode(email: string, code: string): Promise<{ ok: true } | { ok: false }> {
  if (!resendApiKey || !authEmailFrom) return { ok: false };
  const subject = 'Your Mistboard login code';
  const text = [
    `Your Mistboard login code is ${code}.`,
    '',
    'This code expires in 10 minutes.',
    'If you did not request this code, you can ignore this email.',
  ].join('\n');
  const html = [
    '<p>Your Mistboard login code is:</p>',
    `<p style="font-size:24px;font-weight:700;letter-spacing:0.12em">${escapeHtml(code)}</p>`,
    '<p>This code expires in 10 minutes.</p>',
    '<p>If you did not request this code, you can ignore this email.</p>',
  ].join('');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: authEmailFrom,
        to: [email],
        subject,
        text,
        html,
      }),
    });
    if (response.ok) return { ok: true };
    console.error(JSON.stringify({
      level: 'error',
      kind: 'email_delivery_failure',
      provider: 'resend',
      status: response.status,
      at: Date.now(),
    }));
    return { ok: false };
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      kind: 'email_delivery_failure',
      provider: 'resend',
      error: (err as Error).message,
      at: Date.now(),
    }));
    return { ok: false };
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function accountSessionFromRequest(request: IncomingMessage): { sessionId: string; token: string } | null {
  const value = cookieValue(request, accountSessionCookieName);
  if (!value) return null;
  const [sessionId, token] = value.split('.', 2);
  if (!sessionId || !token) return null;
  return { sessionId, token };
}

function cookieValue(request: IncomingMessage, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey !== name) continue;
    try {
      return decodeURIComponent(rawValue.join('='));
    } catch {
      return null;
    }
  }
  return null;
}

function accountSessionCookie(sessionId: string, token: string, expiresAt: Date): string {
  const maxAgeSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  const value = encodeURIComponent(`${sessionId}.${token}`);
  return cookieWithAttributes(`${accountSessionCookieName}=${value}`, [
    `Max-Age=${maxAgeSeconds}`,
    `Expires=${expiresAt.toUTCString()}`,
  ]);
}

function expiredAccountSessionCookie(): string {
  return cookieWithAttributes(`${accountSessionCookieName}=`, [
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ]);
}

function cookieWithAttributes(prefix: string, extra: string[]): string {
  const attrs = [prefix, 'Path=/', 'HttpOnly', 'SameSite=Lax', ...extra];
  if (isProductionLikeRuntime()) attrs.push('Secure');
  return attrs.join('; ');
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505';
}

function parseGameModeParam(value: string | null): persistence.GameMode | null {
  if (
    value === 'pvp'
    || value === 'pve'
    || value === 'eve'
    || value === 'imported'
    || value === 'manual'
  ) {
    return value;
  }
  return null;
}

function parseUtcDateParam(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().startsWith(value) ? date : null;
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
  const result = await chooseLiveEngineMove({
    context,
    engine,
    timeoutMs: liveEngineTimeoutMs,
    onFallback(event) {
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
