import { timingSafeEqual } from 'node:crypto';
import { type GameEvent, type GameProjection, replayGameEvents } from '@mistboard/game';

// Visibility rule: live games are visible only to seated players; finished
// games are public via replay endpoints. This is enforced at two layers —
// connection accept (canObserveLiveRoom) and replay HTTP (eventReplayResponse).
// See docs/fog-of-war/server-side-enforcement.md.

export type GameAccessMode = 'pvp' | 'pve' | 'eve' | 'imported' | 'manual';

type RuntimeEnvKey =
  | 'MISTBOARD_ADMIN_DEBUG_TOKEN'
  | 'MISTBOARD_ALLOW_IN_MEMORY_PERSISTENCE'
  | 'MISTBOARD_ALLOWED_ORIGINS'
  | 'MISTBOARD_ABORT_POLICY_SWEEP_MS'
  | 'MISTBOARD_DRAIN_TOKEN'
  | 'MISTBOARD_GUEST_PRESTART_ABORT_MS'
  | 'MISTBOARD_REQUIRE_DATABASE'
  | 'NODE_ENV'
  | 'RAILWAY_ENVIRONMENT'
  | 'RAILWAY_ENVIRONMENT_NAME'
  | 'RAILWAY_SERVICE_NAME';

export type RuntimeEnv = Partial<Record<RuntimeEnvKey, string>>;

export type EventReplayResponse =
  | { status: 200; body: { events: GameEvent[] } }
  | { status: 403; body: { error: 'game_not_public' } }
  | { status: 404; body: { error: 'not_found' } };

export function eventReplayResponse(events: GameEvent[] | null): EventReplayResponse {
  if (!events) return { status: 404, body: { error: 'not_found' } };
  if (canExposeFullEventReplay(events)) return { status: 200, body: { events } };
  return { status: 403, body: { error: 'game_not_public' } };
}

export function canExposeFullEventReplay(events: GameEvent[]): boolean {
  try {
    return replayGameEvents(events).state.status.type === 'finished';
  } catch {
    // Unknown or non-chess room-family event logs are not public replay data.
    return false;
  }
}

export function modeForProjection(projection: GameProjection): GameAccessMode {
  const whiteIsEngine = isServerEngineClient(projection.seats.white);
  const blackIsEngine = isServerEngineClient(projection.seats.black);
  if (whiteIsEngine && blackIsEngine) return 'eve';
  if (whiteIsEngine !== blackIsEngine) return 'pve';
  return 'pvp';
}

export function isServerEngineClient(clientId: string | undefined): boolean {
  if (!clientId) return false;
  return (
    clientId === 'random-engine' ||
    clientId === 'engine:white' ||
    clientId === 'engine:black' ||
    clientId.startsWith('engine:') ||
    clientId.startsWith('builtin-') ||
    clientId.startsWith('python-')
  );
}

export function canObserveLiveRoom(projection: GameProjection): boolean {
  return projection.state.status.type === 'finished';
}

// SPA fallback allowlist. The web client owns these routes (see apps/web/src/main.ts);
// the server must hand them index.html so direct hits and refreshes don't 404. Keep in
// sync with main.ts — server-policy.test.ts covers parity.
export function isClientRoute(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return (
    normalized === '/about' ||
    normalized === '/learn' ||
    normalized === '/rules' ||
    normalized === '/zh-hans/rules' ||
    normalized === '/zh-hant/rules' ||
    normalized === '/play' ||
    normalized === '/watch' ||
    normalized === '/source' ||
    normalized === '/contact' ||
    normalized === '/faq' ||
    normalized === '/terms' ||
    normalized === '/privacy' ||
    normalized === '/account' ||
    normalized === '/account/settings' ||
    normalized === '/leaderboard' ||
    normalized === '/mini-xiangqi-spike' ||
    normalized === '/xiangqi-demo' ||
    normalized === '/articles' ||
    normalized === '/zh-hans/articles' ||
    normalized === '/zh-hant/articles' ||
    normalized.startsWith('/articles/') ||
    normalized.startsWith('/zh-hans/articles/') ||
    normalized.startsWith('/zh-hant/articles/') ||
    normalized.startsWith('/dark-xiangqi/game/') ||
    normalized.startsWith('/dark-mini-xiangqi/game/') ||
    normalized.startsWith('/game/') ||
    normalized.startsWith('/@/') ||
    normalized.startsWith('/room/')
  );
}

export function adminDebugTokenFromProtocolHeader(
  value: string | string[] | undefined,
): string | undefined {
  return tokenFromProtocolHeader(value, 'mistboard-admin-debug.');
}

export function seatTokenFromProtocolHeader(
  value: string | string[] | undefined,
): string | undefined {
  return tokenFromProtocolHeader(value, 'mistboard-seat.');
}

function tokenFromProtocolHeader(
  value: string | string[] | undefined,
  prefix: string,
): string | undefined {
  const header = Array.isArray(value) ? value.join(',') : value;
  if (!header) return undefined;
  return header
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

export function isAdminDebugToken(
  candidate: string | undefined,
  env: RuntimeEnv = process.env,
): boolean {
  const expected = env.MISTBOARD_ADMIN_DEBUG_TOKEN;
  if (!expected || !candidate) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Drain-token check. Uses a SEPARATE env var from the debug token so a leak in
// either secret doesn't escalate. Constant-time compare. See
// docs/server-restart-pause-resume.md (Security & hardening).
export function isDrainToken(
  candidate: string | undefined,
  env: RuntimeEnv = process.env,
): boolean {
  const expected = env.MISTBOARD_DRAIN_TOKEN;
  if (!expected || !candidate) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isDatabaseRequired(env: RuntimeEnv = process.env): boolean {
  if (parseBooleanEnv(env.MISTBOARD_ALLOW_IN_MEMORY_PERSISTENCE)) return false;
  if (parseBooleanEnv(env.MISTBOARD_REQUIRE_DATABASE)) return true;
  return isProductionLikeRuntime(env);
}

export function isProductionLikeRuntime(env: RuntimeEnv = process.env): boolean {
  return (
    env.NODE_ENV === 'production' ||
    env.RAILWAY_ENVIRONMENT === 'production' ||
    env.RAILWAY_ENVIRONMENT_NAME === 'production' ||
    env.RAILWAY_SERVICE_NAME !== undefined
  );
}

export function isAllowedWebSocketOrigin(
  origin: string | undefined,
  host: string | undefined,
  env: RuntimeEnv = process.env,
): boolean {
  if (!isProductionLikeRuntime(env)) return true;
  if (!origin) return false;
  return allowedWebSocketOrigins(host, env).has(origin);
}

export function allowedWebSocketOrigins(
  host: string | undefined,
  env: RuntimeEnv = process.env,
): Set<string> {
  const configured = parseCsvEnv(env.MISTBOARD_ALLOWED_ORIGINS);
  if (configured.length > 0) return new Set(configured);
  return host ? new Set([`https://${host}`]) : new Set();
}

export function recordMessageTimestamp(
  timestamps: number[],
  now: number,
  limit: number,
  windowMs: number,
): boolean {
  const cutoff = now - windowMs;
  while (timestamps.length > 0 && timestamps[0]! < cutoff) timestamps.shift();
  timestamps.push(now);
  return timestamps.length <= limit;
}

export function parsePositiveInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseNonNegativeInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseBooleanEnv(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}

function parseCsvEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}
