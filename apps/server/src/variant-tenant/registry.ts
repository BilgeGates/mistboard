/**
 * VariantTenant registry — the extension point that makes "a new variant is
 * one registry entry" true at the dispatch layer.
 *
 * Registrations are variant-type-ERASED: they carry routing identity (kind,
 * gameSpecId, roomIdPrefix, flag) plus bound closures over the tenant's
 * concrete types, so dispatch sites (index.ts room sweeps,
 * server-ws-connection's runtime resolver, the /api/rooms create dispatch,
 * the /api/lobby matcher) route without knowing any variant's
 * Color/Move/State. Each tenant registers from its *-registration.ts module;
 * variant-tenant/register-tenants.ts is the single side-effect import that
 * populates the registry.
 *
 * Chess is deliberately NOT registered: a registry miss IS the chess
 * fallback (the strangler boundary until the P2 chess migration).
 * game-spec-request-gate.ts also stays hand-coded on purpose — it is a
 * fail-closed allowlist guarding the chess path, and backing it by the
 * registry would fail OPEN whenever the registry is empty.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RoomTimeControl } from '@mistboard/game';
import type { WebSocket } from 'ws';

// The structural slice of a live tenant room the dispatch layer touches.
// Registration closures cast back to their concrete room type internally.
export type TenantManagedRoom = {
  id: string;
  clients: Iterable<{ socket: { close(code?: number, reason?: string): unknown } }>;
  pendingWrites: Promise<void>;
};

// Connection config handed to attachWebSocket by the ws dispatch site.
export type TenantWsAttachContext = {
  defaultRoomRegion: string;
  wsMessageLimit: number;
  wsMessageWindowMs: number;
};

// The slice of the HTTP context a tenant create handler may need. Kept
// structural (and minimal) so this module stays a leaf — routes/lib.ts's
// HttpApiContext satisfies it.
export type TenantCreateHttpContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  reserveLiveEngineSeat(engineId: string, color: 'white' | 'black'): Promise<string | null>;
};

export type VariantTenantRegistration = {
  kind: string;
  gameSpecId: string;
  roomIdPrefix: string;
  // snake_case identity used in wire error codes: `${errorPrefix}_disabled`,
  // `${errorPrefix}_not_integrated`.
  errorPrefix: string;
  enabled(): boolean;
  // The tenant's live room map (adapter-owned). Read by the ws resolver
  // (live rooms route before flag checks) and the shutdown sweeps.
  rooms: ReadonlyMap<string, TenantManagedRoom>;
  // Hydrate a persisted room into the live map (null = unknown/invalid room).
  getOrLoadRoom(roomId: string): Promise<TenantManagedRoom | null>;
  // Hand a resolved live room its WebSocket connection.
  attachWebSocket(
    ctx: TenantWsAttachContext,
    socket: WebSocket,
    request: IncomingMessage,
    room: TenantManagedRoom,
  ): Promise<void>;
  // Shutdown sweep hook: clear this room's runtime timers.
  clearRuntimeTimers(room: TenantManagedRoom): void;
  // Shutdown/test-teardown hook: empty the live map.
  clearRooms(): void;
  http: {
    // Claim a POST /api/rooms body (matchers are disjoint across tenants).
    matchesCreateRequest(body: Record<string, unknown>): boolean;
    // Full create flow including the tenant's own flag/rated/engine gates and
    // error strings; writes the response itself.
    handleCreate(
      ctx: TenantCreateHttpContext,
      request: IncomingMessage,
      response: ServerResponse,
      body: Record<string, unknown>,
    ): Promise<void>;
  };
  // Matchmaking capability; null = no lobby surface (the lobby route answers
  // `${errorPrefix}_not_integrated` when the tenant is enabled).
  lobby: {
    supportsRated: boolean;
    allowsTimeControl(timeControl: RoomTimeControl): boolean;
    createRoom(
      timeControl: RoomTimeControl | undefined,
      rated: boolean,
    ): Promise<{ id: string; region: string }>;
  } | null;
};

const registrationsByPrefix = new Map<string, VariantTenantRegistration>();

// Room-id collision lookup for rooms living OUTSIDE the registry (the chess
// map in index.ts). Installed at server wiring time; factories only consult it
// at room-creation time, long after startup.
let fallbackRoomLookup: (roomId: string) => boolean = () => false;

export function registerVariantTenant(registration: VariantTenantRegistration): void {
  const existing = registrationsByPrefix.get(registration.roomIdPrefix);
  if (existing && existing.kind !== registration.kind) {
    throw new Error(
      `variant tenant room-id prefix collision: '${registration.roomIdPrefix}' claimed by both '${existing.kind}' and '${registration.kind}'`,
    );
  }
  registrationsByPrefix.set(registration.roomIdPrefix, registration);
}

export function variantTenantForRoomId(roomId: string): VariantTenantRegistration | null {
  for (const registration of registrationsByPrefix.values()) {
    if (roomId.startsWith(registration.roomIdPrefix)) return registration;
  }
  return null;
}

export function variantTenantForSpecId(gameSpecId: string): VariantTenantRegistration | null {
  for (const registration of registrationsByPrefix.values()) {
    if (registration.gameSpecId === gameSpecId) return registration;
  }
  return null;
}

export function registeredVariantTenants(): VariantTenantRegistration[] {
  return [...registrationsByPrefix.values()];
}

export function setVariantTenantFallbackRoomLookup(lookup: (roomId: string) => boolean): void {
  fallbackRoomLookup = lookup;
}

// Cross-variant room-id collision check used by tenant room factories. The
// caller's own map is checked by the factory itself, so it excludes its kind.
export function variantTenantRoomIdTaken(roomId: string, excludeKind?: string): boolean {
  if (fallbackRoomLookup(roomId)) return true;
  for (const registration of registrationsByPrefix.values()) {
    if (registration.kind === excludeKind) continue;
    if (registration.rooms.has(roomId)) return true;
  }
  return false;
}
