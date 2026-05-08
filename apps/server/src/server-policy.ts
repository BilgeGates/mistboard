import { timingSafeEqual } from 'node:crypto';
import { replayGameEvents, type GameEvent } from '@bichess/game';

type RuntimeEnvKey =
  | 'BICHESS_ADMIN_DEBUG_TOKEN'
  | 'BICHESS_ALLOW_IN_MEMORY_PERSISTENCE'
  | 'BICHESS_ALLOWED_ORIGINS'
  | 'BICHESS_REQUIRE_DATABASE'
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
  if (!canExposeFullEventReplay(events)) return { status: 403, body: { error: 'game_not_public' } };
  return { status: 200, body: { events } };
}

export function canExposeFullEventReplay(events: GameEvent[]): boolean {
  return replayGameEvents(events).state.status.type === 'finished';
}

export function adminDebugTokenFromProtocolHeader(value: string | string[] | undefined): string | undefined {
  const header = Array.isArray(value) ? value.join(',') : value;
  if (!header) return undefined;
  const prefix = 'bichess-admin-debug.';
  return header.split(',')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

export function isAdminDebugToken(candidate: string | undefined, env: RuntimeEnv = process.env): boolean {
  const expected = env.BICHESS_ADMIN_DEBUG_TOKEN;
  if (!expected || !candidate) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isDatabaseRequired(env: RuntimeEnv = process.env): boolean {
  if (parseBooleanEnv(env.BICHESS_ALLOW_IN_MEMORY_PERSISTENCE)) return false;
  if (parseBooleanEnv(env.BICHESS_REQUIRE_DATABASE)) return true;
  return isProductionLikeRuntime(env);
}

export function isProductionLikeRuntime(env: RuntimeEnv = process.env): boolean {
  return env.NODE_ENV === 'production'
    || env.RAILWAY_ENVIRONMENT === 'production'
    || env.RAILWAY_ENVIRONMENT_NAME === 'production'
    || env.RAILWAY_SERVICE_NAME !== undefined;
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

export function allowedWebSocketOrigins(host: string | undefined, env: RuntimeEnv = process.env): Set<string> {
  const configured = parseCsvEnv(env.BICHESS_ALLOWED_ORIGINS);
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

function parseBooleanEnv(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}

function parseCsvEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}
