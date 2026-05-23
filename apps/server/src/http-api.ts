import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  findTimeControl,
  type Color,
  type GameEvent,
  type RoomTimeControl,
  type TimeControlId,
  type VariantId,
} from '@mistboard/game';
import * as persistence from './persistence.js';
import { buildGamePgn, buildGamePublicationJson } from './game-export.js';
import {
  DEFAULT_RATING_BUCKET,
  parseRatingTimeClass,
  parseRatingVariant,
} from './rating-buckets.js';
import { playableLiveEngines } from './engine-registry.js';
import {
  adminDebugTokenFromProtocolHeader,
  eventReplayResponse,
  isAdminDebugToken,
  isProductionLikeRuntime,
  parsePositiveInteger,
} from './server-policy.js';
import {
  accountSessionCookie,
  accountSessionFromRequest,
  accountSessionTtlMs,
  authEmailDeliveryEnabled,
  currentAccountUser,
  devAuthCodesEnabled,
  emailLoginCodeTtlMs,
  ensureUserForEmail,
  expiredAccountSessionCookie,
  hashSecret,
  publicUser,
  randomEmailLoginCode,
  sendEmailLoginCode,
} from './account-session.js';
import { sendFeedbackNotification } from './feedback-notify.js';
import {
  normalizeDisplayName,
  normalizeEmail,
  normalizeProfileHandle,
} from './account-identity.js';
import type { LobbyTicket, Room } from './server-types.js';

// ── Private constants ──────────────────────────────────────────────────────
const lobbyTicketTtlMs = 5 * 60 * 1000;
const lobbyPollAfterMs = 1_000;
const minRoomClockInitialMs = 10_000;
const maxRoomClockInitialMs = 180 * 60 * 1000;
const maxRoomClockIncrementMs = 60_000;

const feedbackMaxMessageLength = 5000;
const feedbackMaxPathLength = 256;
const feedbackMaxUserAgentLength = 512;
const feedbackAnonWindowMs = 24 * 60 * 60 * 1000;
const feedbackAnonPerWindow = 1;

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

// ── Context ────────────────────────────────────────────────────────────────
export interface HttpApiContext {
  rooms: Map<string, Room>;
  lobbyTickets: Map<string, LobbyTicket>;
  lobbyQueue: LobbyTicket[];
  databaseRequired: boolean;
  pveBuiltinEngineClientId: string;
  annotationsFile: string;
  liveClockInitialMs: number;
  liveClockIncrementMs: number;
  createRoom(
    mode: 'pvp' | 'pve',
    variant: VariantId,
    engineId: string,
    hiddenDraft960?: boolean,
    timeControl?: RoomTimeControl,
    rated?: boolean,
    options?: { randomSeating?: boolean; engineColor?: 'white' | 'black' },
  ): Promise<Room>;
  abandonRoom(
    roomId: string,
    seatToken: string,
  ): Promise<
    | { ok: true }
    | { ok: false; error: 'not_found' | 'unauthorized' | 'already_terminal' }
  >;
  inMemoryGameSummary(roomId: string): persistence.RecentEveGameRecord | null;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  activeGameCount(): number;
}

// ── Exported pure parse helpers (also used by WebSocket handler) ───────────
export function parseVariantId(value: string | null): VariantId {
  if (value === 'draft960') return 'draft960';
  return 'fog-of-war';
}

export function parseHiddenDraft960(value: unknown): boolean {
  return value === true || value === '1' || value === 'true' || value === 'yes';
}

// ── Main HTTP API handler ──────────────────────────────────────────────────
export async function handleApiRequest(
  ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = request.url ?? '/';
  const parsedUrl = new URL(url, 'http://localhost');
  const method = request.method ?? 'GET';

  if (parsedUrl.pathname === '/api/annotations') {
    await handleAnnotationsApi(ctx, request, response);
    return;
  }

  if (parsedUrl.pathname === '/api/auth/me') {
    if (method !== 'GET') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    const user = await currentAccountUser(request);
    writeJson(response, 200, { user: user ? publicUser(user) : null });
    return;
  }

  if (parsedUrl.pathname === '/api/server-status') {
    if (method !== 'GET') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    writeJson(response, 200, {
      restartAt: ctx.drainDeadlineMs(),
      activeGames: ctx.activeGameCount(),
    });
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

    const { user, isNew } = await ensureUserForEmail(challenge.email, now);
    const sessionId = randomUUID();
    const sessionToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + accountSessionTtlMs);
    await persistence.createAccountSession({
      id: sessionId,
      userId: user.id,
      tokenHash: hashSecret(sessionToken),
      expiresAt,
    });
    writeJson(response, 200, { user: publicUser(user), isNewUser: isNew }, {
      'set-cookie': accountSessionCookie(sessionId, sessionToken, expiresAt),
    });
    return;
  }

  if (parsedUrl.pathname === '/api/feedback') {
    if (method !== 'POST') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return;
    }

    const user = await currentAccountUser(request);
    const xff = request.headers['x-forwarded-for'];
    const ip = typeof xff === 'string' && xff.length > 0
      ? xff.split(',')[0]!.trim()
      : request.socket.remoteAddress ?? 'unknown';
    const ipHash = user ? null : hashIp(ip);

    if (!user && persistence.isInitialized() && ipHash) {
      const since = new Date(Date.now() - feedbackAnonWindowMs);
      try {
        const recent = await persistence.countAnonFeedbackSubmissionsSince(ipHash, since);
        if (recent >= feedbackAnonPerWindow) {
          writeJson(response, 429, { error: 'rate_limited' });
          return;
        }
      } catch (err) {
        console.error(JSON.stringify({
          level: 'error',
          kind: 'feedback_throttle_lookup_failure',
          error: (err as Error).message,
          at: Date.now(),
        }));
      }
    }

    const body = await readJsonBody(request);

    // Honeypot: bots often fill every text field. Real form leaves this blank.
    const honeypot = typeof body.website === 'string' ? body.website.trim() : '';
    if (honeypot.length > 0) {
      writeJson(response, 202, { ok: true });
      return;
    }

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length === 0 || message.length > feedbackMaxMessageLength) {
      writeJson(response, 400, { error: 'invalid_message' });
      return;
    }
    // Anonymous lane: optional user-supplied reply email. Logged-in lane:
    // reply_to is the verified account email (set in feedback-notify), so
    // ignore any client-supplied email to avoid spoofing the audit trail.
    const email = user
      ? null
      : normalizeEmail(typeof body.email === 'string' ? body.email : null);
    const rawPath = typeof body.path === 'string' ? body.path.trim() : '';
    const path = rawPath.length > 0 ? rawPath.slice(0, feedbackMaxPathLength) : null;
    const rawUa = request.headers['user-agent'];
    const userAgent = typeof rawUa === 'string' && rawUa.length > 0
      ? rawUa.slice(0, feedbackMaxUserAgentLength)
      : null;
    const userId = user?.id ?? null;
    const id = randomUUID();

    if (persistence.isInitialized()) {
      try {
        await persistence.insertFeedbackSubmission({
          id, message, email, path, userId, userAgent, ipHash,
        });
      } catch (err) {
        console.error(JSON.stringify({
          level: 'error',
          kind: 'feedback_persist_failure',
          error: (err as Error).message,
          at: Date.now(),
        }));
      }
    }

    void sendFeedbackNotification({
      id,
      message,
      email,
      path,
      userId,
      userAgent,
      accountHandle: user?.handle ?? null,
      accountEmail: user?.email ?? null,
    });

    writeJson(response, 202, { ok: true });
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
    // engineColor: PvE only. 'black' (default) → human plays white. 'white' →
    // human plays black. Lets us test color-asymmetric engine behavior without
    // a UI control. Body field is ignored for PvP.
    const engineColor: 'white' | 'black' = (
      mode === 'pve' && body.engineColor === 'white' ? 'white' : 'black'
    );
    const timeControl = body.timeControl === undefined ? undefined : parseRoomTimeControl(body.timeControl);
    // Engine games are never rated — rated play is human-vs-human only.
    const rated = mode === 'pve' ? false : (body.rated === false ? false : true);
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
    // PvE is scoped to 3+2 until the engine can hold its per-move budget at
    // shorter time controls (currently Tier1 p99 ~12s on Railway prod). UI
    // already disables non-3+2 presets for PvE; this is defense in depth
    // against direct API calls. PvP keeps the full preset range — humans
    // set their own pace.
    if (mode === 'pve' && timeControl && !isPveAllowedTimeControl(timeControl)) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'time_control_unsupported_for_pve' }));
      return;
    }
    if (ctx.databaseRequired && !persistence.isInitialized()) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'persistence_disabled' }));
      return;
    }
    if (ctx.isDraining()) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'server_draining', restartAt: ctx.drainDeadlineMs() }));
      return;
    }
    const room = await ctx.createRoom(mode, variant, engineId ?? ctx.pveBuiltinEngineClientId, hiddenDraft960, timeControl ?? undefined, rated, { engineColor });
    response.writeHead(201, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ roomId: room.id, url: `/room/${encodeURIComponent(room.id)}`, mode: room.mode }));
    return;
  }

  const abandonMatch = parsedUrl.pathname.match(/^\/api\/rooms\/([^/]+)\/abandon$/);
  if (abandonMatch) {
    if (method !== 'POST') {
      response.writeHead(405, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }
    const roomId = decodeURIComponent(abandonMatch[1]!);
    const body = await readJsonBody(request);
    const seatToken = typeof body.seatToken === 'string' ? body.seatToken : '';
    if (!seatToken) {
      writeJson(response, 400, { error: 'missing_seat_token' });
      return;
    }
    const result = await ctx.abandonRoom(roomId, seatToken);
    if (result.ok) {
      writeJson(response, 200, { ok: true });
      return;
    }
    const statusByError = { not_found: 404, unauthorized: 401, already_terminal: 409 } as const;
    writeJson(response, statusByError[result.error], { error: result.error });
    return;
  }

  if (url === '/api/lobby') {
    if (method === 'GET') {
      pruneLobbyTickets(ctx);
      writeJson(response, 200, { requests: lobbyOpenRequests(ctx) });
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
    const lobbyRated = body.rated === false ? false : true;
    if (body.timeControl !== undefined && !timeControl) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid_time_control' }));
      return;
    }
    if (ctx.databaseRequired && !persistence.isInitialized()) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'persistence_disabled' }));
      return;
    }
    if (ctx.isDraining()) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'server_draining', restartAt: ctx.drainDeadlineMs() }));
      return;
    }
    const ticket = await joinLobby(ctx, hiddenDraft960, timeControl ?? undefined, lobbyRated);
    writeJson(response, ticket.roomId ? 201 : 202, lobbyTicketResponse(ticket));
    return;
  }

  if (url === '/api/live-stats') {
    if (method !== 'GET') {
      response.writeHead(405, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }
    let playing = 0;
    const uniqueClientIds = new Set<string>();
    for (const room of ctx.rooms.values()) {
      if (room.projection.state.status.type === 'playing') playing += 1;
      for (const client of room.clients) {
        uniqueClientIds.add(client.id);
      }
    }
    writeJson(response, 200, { playing, online: uniqueClientIds.size });
    return;
  }

  const lobbyMatch = parsedUrl.pathname.match(/^\/api\/lobby\/([^/]+)$/);
  if (lobbyMatch) {
    pruneLobbyTickets(ctx);
    const ticketId = decodeURIComponent(lobbyMatch[1]!);
    const ticket = ctx.lobbyTickets.get(ticketId);
    if (!ticket) {
      writeJson(response, 404, { error: 'not_found' });
      return;
    }
    if (method === 'GET') {
      writeJson(response, 200, lobbyTicketResponse(ticket));
      return;
    }
    if (method === 'DELETE') {
      cancelLobbyTicket(ctx, ticketId);
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
    const review = await gameReviewForApi(ctx, roomId, request);
    if (!review) {
      writeJson(response, 404, { error: 'not_found' });
      return;
    }
    writeJson(response, 200, review);
    return;
  }

  const artifactsMatch = parsedUrl.pathname.match(/^\/api\/games\/([^/]+)\/artifacts$/);
  if (artifactsMatch) {
    if (method !== 'GET') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    const artifactType = parseReviewArtifactType(parsedUrl.searchParams.get('type'));
    if (!artifactType) {
      writeJson(response, 400, { error: 'invalid_artifact_type' });
      return;
    }
    const color = parseOptionalColor(parsedUrl.searchParams.get('color'));
    if (parsedUrl.searchParams.has('color') && !color) {
      writeJson(response, 400, { error: 'invalid_color' });
      return;
    }
    const roomId = decodeURIComponent(artifactsMatch[1]!);
    const artifactResponse = await gameArtifactsForApi(ctx, roomId, artifactType, color, request);
    if (!artifactResponse) {
      writeJson(response, 404, { error: 'not_found' });
      return;
    }
    if (artifactResponse.status === 403) {
      writeJson(response, 403, { error: 'forbidden' });
      return;
    }
    writeJson(response, 200, artifactResponse.body);
    return;
  }

  const exportMatch = parsedUrl.pathname.match(/^\/api\/games\/([^/]+)\/export\.(pgn|json)$/);
  if (exportMatch) {
    if (method !== 'GET') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    const roomId = decodeURIComponent(exportMatch[1]!);
    const format = exportMatch[2]!;
    const summary = await gameSummaryForApi(ctx, roomId);
    const events = await gameEventsForApi(ctx, roomId);
    const replayResponse = eventReplayResponse(events);
    if (replayResponse.status !== 200 || !summary || !events) {
      writeJson(response, replayResponse.status, replayResponse.body);
      return;
    }
    if (summary.variant === 'draft960') {
      writeJson(response, 501, { error: 'export_not_supported_for_variant', variant: summary.variant });
      return;
    }
    if (format === 'pgn') {
      const pgn = buildGamePgn(summary, events);
      response.writeHead(200, {
        'content-type': 'application/x-chess-pgn; charset=utf-8',
        'content-disposition': `inline; filename="mistboard-${roomId}.pgn"`,
      });
      response.end(pgn);
      return;
    }
    const payload = buildGamePublicationJson(summary, events);
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `inline; filename="mistboard-${roomId}.json"`,
    });
    response.end(JSON.stringify(payload));
    return;
  }

  const summaryMatch = url.match(/^\/api\/games\/([^/]+)$/);
  if (summaryMatch) {
    const roomId = decodeURIComponent(summaryMatch[1]!);
    const game = await gameSummaryForApi(ctx, roomId);
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
    const events = await gameEventsForApi(ctx, roomId);
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

  if (parsedUrl.pathname === '/api/leaderboard') {
    if (method !== 'GET') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    const variant = parseRatingVariant(parsedUrl.searchParams.get('variant'))
      ?? DEFAULT_RATING_BUCKET.variant;
    const timeClass = parseRatingTimeClass(parsedUrl.searchParams.get('time'))
      ?? DEFAULT_RATING_BUCKET.timeClass;
    const limitParam = parseInt(parsedUrl.searchParams.get('limit') ?? '100', 10);
    const limit = isNaN(limitParam) ? 100 : Math.max(1, Math.min(limitParam, 500));
    const entries = await persistence.getLeaderboard({ variant, timeClass, limit });
    writeJson(response, 200, { leaderboard: entries, bucket: { variant, timeClass } });
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

  if (url === '/api/eve-games/recent') {
    const games = await persistence.listRecentEveGames();
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ games }));
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not_found' }));
}

// ── Game data helpers ──────────────────────────────────────────────────────
async function gameSummaryForApi(ctx: HttpApiContext, roomId: string): Promise<persistence.RecentEveGameRecord | null> {
  const persisted = persistence.isInitialized()
    ? await persistence.getGameSummary(roomId)
    : null;
  return persisted ?? ctx.inMemoryGameSummary(roomId);
}

async function gameEventsForApi(ctx: HttpApiContext, roomId: string): Promise<GameEvent[] | null> {
  const persisted = persistence.isInitialized()
    ? await persistence.loadRoom(roomId)
    : null;
  return persisted ?? ctx.rooms.get(roomId)?.events ?? null;
}

async function gameReviewForApi(
  ctx: HttpApiContext,
  roomId: string,
  request: IncomingMessage,
): Promise<Record<string, unknown> | null> {
  const game = await gameSummaryForApi(ctx, roomId);
  const events = await gameEventsForApi(ctx, roomId);
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

async function gameArtifactsForApi(
  ctx: HttpApiContext,
  roomId: string,
  artifactType: ReviewArtifactType,
  color: Color | null,
  request: IncomingMessage,
): Promise<{ status: 200; body: Record<string, unknown> } | { status: 403 } | null> {
  if (!persistence.isInitialized()) return null;
  const game = await gameSummaryForApi(ctx, roomId);
  const events = await gameEventsForApi(ctx, roomId);
  const replayResponse = eventReplayResponse(events);
  if (!game || replayResponse.status !== 200) return null;
  if (!(await canViewEngineArtifactsForRequest(request))) return { status: 403 };

  const engineColors = engineParticipantColors(game);
  if (engineColors.length === 0) {
    return { status: 200, body: { artifacts: [] } };
  }
  const requestedColors = color ? [color] : engineColors;
  const allowedColors = intersectionColors(engineColors, requestedColors);
  if (allowedColors.length === 0) {
    return { status: 200, body: { artifacts: [] } };
  }

  const artifacts = await persistence.listGameDebugArtifactPayloads(roomId, {
    artifactType,
    engineColors: allowedColors,
  });
  return {
    status: 200,
    body: {
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id,
        gameId: artifact.gameId,
        ply: artifact.ply,
        engineColor: artifact.engineColor,
        artifactType: artifact.artifactType,
        payload: artifact.payload,
        createdAt: artifact.createdAt.toISOString(),
      })),
    },
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

// ── Artifact type helpers ──────────────────────────────────────────────────
type ReviewArtifactType = 'belief-snapshot' | 'trace-row' | 'engine-move-choice';

function parseReviewArtifactType(value: string | null): ReviewArtifactType | null {
  return value === 'belief-snapshot' || value === 'trace-row' || value === 'engine-move-choice'
    ? value
    : null;
}

function parseOptionalColor(value: string | null): Color | null {
  return value === 'white' || value === 'black' ? value : null;
}

// ── HTTP utilities ─────────────────────────────────────────────────────────
export function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

async function handleAnnotationsApi(
  ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (!isHttpAdminAuthorized(request)) {
    writeJson(response, 403, { error: 'forbidden' });
    return;
  }

  const method = request.method ?? 'GET';
  if (method === 'GET') {
    const text = await fs.readFile(ctx.annotationsFile, 'utf-8').catch(() => '');
    const annotations = text
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    writeJson(response, 200, { annotations, file: ctx.annotationsFile });
    return;
  }

  if (method === 'POST') {
    const body = await readJsonBody(request);
    await fs.mkdir(dirname(ctx.annotationsFile), { recursive: true });
    await fs.appendFile(ctx.annotationsFile, JSON.stringify(body) + '\n', 'utf-8');
    writeJson(response, 200, { ok: true });
    return;
  }

  if (method === 'PUT') {
    const body = await readJsonBody(request);
    if (typeof body.id !== 'string' || body.id.length === 0) {
      writeJson(response, 400, { error: 'missing_id' });
      return;
    }
    const existing = await fs.readFile(ctx.annotationsFile, 'utf-8').catch(() => '');
    const lines = existing.split('\n').filter((line) => line.trim().length > 0);
    let updated = false;
    const nextLines = lines.map((line) => {
      const row = JSON.parse(line) as Record<string, unknown>;
      if (row.id === body.id) {
        updated = true;
        return JSON.stringify(body);
      }
      return line;
    });
    if (!updated) nextLines.push(JSON.stringify(body));
    await fs.mkdir(dirname(ctx.annotationsFile), { recursive: true });
    await fs.writeFile(ctx.annotationsFile, nextLines.join('\n') + '\n', 'utf-8');
    writeJson(response, 200, { ok: true, updated, appended: !updated });
    return;
  }

  writeJson(response, 405, { error: 'method_not_allowed' });
}

export async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
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

// ── Room and lobby helpers ─────────────────────────────────────────────────
function parseRoomMode(body: Record<string, unknown>): 'pvp' | 'pve' | null {
  if (body.mode === 'pvp' || body.mode === 'pve') return body.mode;
  return null;
}

function parsePlayablePveEngineId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return playableLiveEngines().some((engine) => engine.id === value) ? value : null;
}

// PvE time-control allowlist. References canonical TC ids from
// packages/game/src/time-controls.ts. Currently only 3+2 is enabled for PvE
// because Tier1's per-move compute can exceed the per-move budget on shorter
// time controls. When 1+1 is engine-ready, add '1m1' here.
const PVE_ALLOWED_TIME_CONTROL_IDS: ReadonlySet<TimeControlId> = new Set(['3m2']);

export function isPveAllowedTimeControl(tc: RoomTimeControl): boolean {
  const spec = findTimeControl(tc.initialMs, tc.incrementMs);
  return spec !== null && PVE_ALLOWED_TIME_CONTROL_IDS.has(spec.id);
}

export function parseRoomTimeControl(value: unknown): RoomTimeControl | null {
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

async function joinLobby(
  ctx: HttpApiContext,
  hiddenDraft960: boolean,
  timeControl: RoomTimeControl | undefined,
  rated = true,
): Promise<LobbyTicket> {
  pruneLobbyTickets(ctx);
  const timeKey = timeControlKey(timeControl);
  const matchedTicket = ctx.lobbyQueue.find((ticket) => (
    ticket.roomId === null
    && ticket.hiddenDraft960 === hiddenDraft960
    && ticket.rated === rated
    && timeControlKey(ticket.timeControl) === timeKey
  ));
  const ticket: LobbyTicket = {
    id: randomUUID(),
    createdAt: Date.now(),
    hiddenDraft960,
    rated,
    matchedAt: null,
    roomId: null,
    timeControl,
  };
  ctx.lobbyTickets.set(ticket.id, ticket);

  if (!matchedTicket) {
    ctx.lobbyQueue.push(ticket);
    return ticket;
  }

  let room: Room;
  try {
    room = await ctx.createRoom('pvp', 'fog-of-war', ctx.pveBuiltinEngineClientId, hiddenDraft960, timeControl, rated, { randomSeating: true });
  } catch (err) {
    ctx.lobbyTickets.delete(ticket.id);
    throw err;
  }
  const matchedAt = Date.now();
  matchedTicket.matchedAt = matchedAt;
  matchedTicket.roomId = room.id;
  ticket.matchedAt = matchedAt;
  ticket.roomId = room.id;
  const matchedIndex = ctx.lobbyQueue.findIndex((candidate) => candidate.id === matchedTicket.id);
  if (matchedIndex >= 0) ctx.lobbyQueue.splice(matchedIndex, 1);
  return ticket;
}

function cancelLobbyTicket(ctx: HttpApiContext, ticketId: string): void {
  const ticket = ctx.lobbyTickets.get(ticketId);
  if (!ticket || ticket.roomId !== null) return;
  ctx.lobbyTickets.delete(ticketId);
  const queueIndex = ctx.lobbyQueue.findIndex((candidate) => candidate.id === ticketId);
  if (queueIndex >= 0) ctx.lobbyQueue.splice(queueIndex, 1);
}

function pruneLobbyTickets(ctx: HttpApiContext, now = Date.now()): void {
  for (const [ticketId, ticket] of ctx.lobbyTickets) {
    if (now - ticket.createdAt >= lobbyTicketTtlMs) {
      ctx.lobbyTickets.delete(ticketId);
    }
  }
  for (let index = ctx.lobbyQueue.length - 1; index >= 0; index -= 1) {
    const ticket = ctx.lobbyQueue[index];
    if (!ticket || !ctx.lobbyTickets.has(ticket.id) || ticket.roomId !== null) {
      ctx.lobbyQueue.splice(index, 1);
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

function lobbyOpenRequests(ctx: HttpApiContext): Array<Record<string, unknown>> {
  const now = Date.now();
  return ctx.lobbyQueue
    .filter((ticket) => ticket.roomId === null)
    .slice(0, 20)
    .map((ticket) => ({
      hiddenDraft960: ticket.hiddenDraft960,
      rated: ticket.rated,
      timeControl: ticket.timeControl ?? {
        initialMs: ctx.liveClockInitialMs,
        incrementMs: ctx.liveClockIncrementMs,
      },
      waitingMs: Math.max(0, now - ticket.createdAt),
    }));
}

function timeControlKey(timeControl: RoomTimeControl | undefined): string {
  return timeControl ? `${timeControl.initialMs}:${timeControl.incrementMs}` : 'default';
}

// ── Admin and auth helpers ─────────────────────────────────────────────────
function isHttpAdminAuthorized(request: IncomingMessage): boolean {
  if (!isProductionLikeRuntime()) return true;
  const authorization = Array.isArray(request.headers.authorization)
    ? request.headers.authorization[0]
    : request.headers.authorization;
  const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined;
  return isAdminDebugToken(token);
}

// ── Date/mode param parsers (admin API) ────────────────────────────────────
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
