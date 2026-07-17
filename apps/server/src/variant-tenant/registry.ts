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
// Client identity fields (`id`, `seat`, `userId`) and the projection status
// are in the slice so presence surfaces (/api/players/online, /api/live-stats)
// can enumerate connections and playing seats without knowing any tenant's
// concrete client/state types. All are optional in the slice but present on
// every TenantLiveClient / TenantRuntimeRoom at runtime.
export type TenantManagedRoom = {
  id: string;
  clients: Iterable<{
    socket: { close(code?: number, reason?: string): unknown; send(data: string): unknown };
    id?: string;
    seat?: string;
    userId?: string | null;
  }>;
  projection?: { state: { status: { type: string } } };
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

// Mistboard TV channel metadata for a registered tenant. Optional: tenants
// without a watch surface (correspondence-only dark-chess, the dark-xiangqi
// dev spike) omit it. watch-channels.ts derives the per-variant channels from
// the tenants that set this, keeping "a new watchable variant = one registry
// field" true. `default` only ever describes the dark-chess channel, which is a
// registry MISS (not a tenant), so registered tenants never set it; the field
// is kept for shape completeness.
export type VariantTenantWatchChannel = {
  channelId: string;
  label: string;
  family: string;
  legacyVariants: readonly string[];
  default?: boolean;
};

export type VariantTenantRegistration = {
  kind: string;
  gameSpecId: string;
  roomIdPrefix: string;
  // Mistboard TV channel for this tenant, or null/absent when it has no watch
  // surface. Derived into WatchChannel by watch-channels.ts.
  watch?: VariantTenantWatchChannel | null;
  // Whether this registration is the spec's PRIMARY routing surface
  // (variantTenantForSpecId — today that means the lobby). True for tenants
  // that solely own their spec (DMX, Dark Xiangqi, Crossroads). False for
  // registrations owning only a prefixed slice of a spec whose primary
  // surface lives elsewhere — dark-chess correspondence (dchx_) must not
  // shadow the legacy chess stack's lobby, which is reached via registry
  // MISS.
  ownsSpecRouting: boolean;
  // snake_case identity used in wire error codes: `${errorPrefix}_disabled`,
  // `${errorPrefix}_not_integrated`.
  errorPrefix: string;
  enabled(): boolean;
  // The tenant's live room map (adapter-owned). Read by the ws resolver
  // (live rooms route before flag checks) and the shutdown sweeps.
  rooms: ReadonlyMap<string, TenantManagedRoom>;
  // Rooms holding a live in-progress game. Feeds the drain controller's
  // activeGames gate (/api/server-status) so safe deploys wait on tenant
  // games exactly like chess games. Bound by the adapter because the
  // playing-status check needs the tenant's concrete room type.
  activeGameCount(): number;
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
  // Correspondence capability; null = the tenant hosts no days-per-move
  // rooms. Implementations hydrate the room, re-derive its deadline from the
  // event log (never trusting the room_deadlines row), and when actually due
  // append the timeout/abort event through the tenant's writer with
  // broadcast (sweepTenantRoomDeadline over the ws runtime's lifecycleCtx).
  sweepDueDeadline: ((roomId: string) => Promise<void>) | null;
  // Seek-accept capability: create a correspondence room seating BOTH accounts, for a
  // seek the accepter just won. null = this tenant cannot back a correspondence seek.
  //
  // Colors never cross this boundary: the seek stores move order (migration 106) and the
  // tenant maps `first`/`second` onto its own colors pair, which is what lets one seek
  // board serve chess and xiangqi at once.
  //
  // PAIRS WITH sweepDueDeadline — a correspondence game with no deadline sweeper never
  // times out and hangs forever. The two are separate fields rather than one object to
  // spare 17 non-correspondence registrations a churn, so the pairing is held by
  // correspondence-eligibility.test.ts instead of the type: every spec in
  // CORRESPONDENCE_ELIGIBLE_SPECS must supply BOTH.
  // `seats` reports the concrete colors first/second landed on, so the route can name the
  // accepter's seat without knowing any variant's colors itself.
  createCorrespondenceGameForSeek:
    | ((args: {
        timeControl: RoomTimeControl;
        first: { userId: string };
        second: { userId: string };
      }) => Promise<
        | {
            ok: true;
            room: { id: string; gameSpecId: string };
            seats: { first: string; second: string };
          }
        | { ok: false; error: 'disabled' | 'persistence_failure' | 'room_id_collision' }
      >)
    | null;
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
    if (!registration.ownsSpecRouting) continue;
    if (registration.gameSpecId === gameSpecId) return registration;
  }
  return null;
}

/**
 * The registration that backs this spec's CORRESPONDENCE rooms, or null.
 *
 * Deliberately not variantTenantForSpecId: that one answers "who owns this spec's primary
 * routing" and so skips ownsSpecRouting:false — which is exactly the dark-chess
 * correspondence registration (it owns only the dchx_ slice and must not shadow the legacy
 * chess lobby). Routing ownership and correspondence ownership are different questions, and
 * for dark chess they have different answers.
 *
 * Selecting on the capability itself keeps it unambiguous: at most one registration per spec
 * offers a seek factory.
 */
export function correspondenceTenantForSpecId(
  gameSpecId: string,
): VariantTenantRegistration | null {
  for (const registration of registrationsByPrefix.values()) {
    if (registration.gameSpecId !== gameSpecId) continue;
    if (registration.createCorrespondenceGameForSeek) return registration;
  }
  return null;
}

export function registeredVariantTenants(): VariantTenantRegistration[] {
  return [...registrationsByPrefix.values()];
}

export function setVariantTenantFallbackRoomLookup(lookup: (roomId: string) => boolean): void {
  fallbackRoomLookup = lookup;
}

// Live in-progress games across every registered tenant. Summed into the
// drain controller's chess count for the deploy-safety activeGames gate.
export function variantTenantActiveGameCount(): number {
  let count = 0;
  for (const registration of registrationsByPrefix.values()) {
    count += registration.activeGameCount();
  }
  return count;
}

// Broadcast a raw wire message to every connected client of every registered
// tenant's live rooms. Used by the drain controller's restart broadcasts so
// tenant players see the countdown banner exactly like chess players.
export function variantTenantBroadcast(message: string): void {
  for (const registration of registrationsByPrefix.values()) {
    for (const room of registration.rooms.values()) {
      for (const client of room.clients) {
        try {
          client.socket.send(message);
        } catch {
          /* socket closed */
        }
      }
    }
  }
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
