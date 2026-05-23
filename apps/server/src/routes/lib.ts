// Shared utilities for the HTTP route modules under apps/server/src/routes/.
// Lives one level below http-api.ts (the dispatcher) so route modules don't
// have to know about each other or about the dispatcher. http-api.ts
// re-exports the public surface (HttpApiContext, parseVariantId, etc.) so
// index.ts and other consumers continue to import from './http-api.js'.

import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  findTimeControl,
  type RoomTimeControl,
  type TimeControlId,
  type VariantId,
} from '@mistboard/game';
import * as persistence from './../persistence.js';
import { isAdminDebugToken, isProductionLikeRuntime } from './../server-policy.js';
import type { LobbyTicket, Room } from './../server-types.js';

// ── Constants ──────────────────────────────────────────────────────────────
export const minRoomClockInitialMs = 10_000;
export const maxRoomClockInitialMs = 180 * 60 * 1000;
export const maxRoomClockIncrementMs = 60_000;

// PvE time-control allowlist. References canonical TC ids from
// packages/game/src/time-controls.ts. Currently only 3+2 is enabled for PvE
// because Tier1's per-move compute can exceed the per-move budget on shorter
// time controls. When 1+1 is engine-ready, add '1m1' here.
const PVE_ALLOWED_TIME_CONTROL_IDS: ReadonlySet<TimeControlId> = new Set(['3m2']);

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
    options?: {
      randomSeating?: boolean;
      engineColor?: 'white' | 'black';
      creatorPreference?: 'white' | 'black';
    },
  ): Promise<Room>;
  abandonRoom(
    roomId: string,
    seatToken: string,
  ): Promise<
    { ok: true } | { ok: false; error: 'not_found' | 'unauthorized' | 'already_terminal' }
  >;
  inMemoryGameSummary(roomId: string): persistence.RecentEveGameRecord | null;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  activeGameCount(): number;
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

// Guard helpers: collapse the ~25-site `if (method !== 'X') { writeJson(...) }`
// + `if (!persistence.isInitialized()) { writeJson(...) }` boilerplate.
// Returns false when the guard fails (caller `return`s); true to continue.
export function requireMethod(
  request: IncomingMessage,
  response: ServerResponse,
  ...allowed: string[]
): boolean {
  const method = request.method ?? 'GET';
  if (allowed.includes(method)) return true;
  writeJson(response, 405, { error: 'method_not_allowed' });
  return false;
}

export function requirePersistence(response: ServerResponse): boolean {
  if (persistence.isInitialized()) return true;
  writeJson(response, 503, { error: 'persistence_disabled' });
  return false;
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
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
}

// ── Parse helpers (also used by WebSocket handler in index.ts) ─────────────
export function parseVariantId(value: string | null): VariantId {
  if (value === 'draft960') return 'draft960';
  return 'fog-of-war';
}

export function parseHiddenDraft960(value: unknown): boolean {
  return value === true || value === '1' || value === 'true' || value === 'yes';
}

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

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

export function isHttpAdminAuthorized(request: IncomingMessage): boolean {
  if (!isProductionLikeRuntime()) return true;
  const authorization = Array.isArray(request.headers.authorization)
    ? request.headers.authorization[0]
    : request.headers.authorization;
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : undefined;
  return isAdminDebugToken(token);
}
