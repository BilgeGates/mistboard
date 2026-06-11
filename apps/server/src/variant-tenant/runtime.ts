/**
 * Generic event-sourced live-room runtime over a VariantTenant.
 *
 * One implementation of the room event model, projection replay, clock
 * arithmetic, event-log validation, and the per-seat snapshot payload. The
 * tenant supplies rules, redaction policy, and color/spec identity; this
 * module never inspects variant state beyond the TenantGameStateLike slice
 * and never builds variant status objects (rules.finish / rules.abort do).
 *
 * Wire-parity contract: for a migrated tenant the snapshot payload and
 * per-seat client events must be deep-equal to its pre-migration stack —
 * pinned by that tenant's golden wire fixture (e.g.
 * dark-mini-xiangqi-golden-wire.test.ts).
 */

import type { RoomTimeControl } from '@mistboard/game';
import { isAbortReason } from '@mistboard/game';
import type {
  TenantClientEvent,
  TenantClockState,
  TenantGameStateLike,
  TenantGameStatus,
  TenantProjection,
  TenantRoomEvent,
  TenantRuntimeRoom,
  TenantSeat,
  TenantSnapshotClient,
  VariantTenant,
} from './tenant.js';

export type TenantRoomCreation<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  Spec extends string = string,
> =
  | { ok: true; room: TenantRuntimeRoom<Kind, C, M, State, Spec> }
  | { ok: false; error: 'disabled' };

export type TenantRoomHydration<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  Spec extends string = string,
> =
  | { ok: true; room: TenantRuntimeRoom<Kind, C, M, State, Spec> }
  | { ok: false; error: 'empty_event_log' | 'invalid_event_log' };

export function isTenantRoomId(tenant: { roomIdPrefix: string }, roomId: string): boolean {
  return roomId.startsWith(tenant.roomIdPrefix);
}

export function createTenantClock<C extends string>(
  tenant: { colors: readonly [C, C] },
  initialMs: number,
  incrementMs: number,
): TenantClockState<C> {
  const remainingMs = {} as Record<C, number>;
  for (const color of [...tenant.colors].sort()) remainingMs[color] = initialMs;
  return {
    activeColor: null,
    incrementMs,
    initialMs,
    remainingMs,
    runningSince: null,
  };
}

export function nextTenantClockForMove<C extends string>(
  tenant: { colors: readonly [C, C] },
  clock: TenantClockState<C> | undefined,
  at: number,
  movedColor: C,
  prevMoveNumber: number,
  nextStatus: TenantGameStatus<C>,
): TenantClockState<C> | undefined {
  if (!clock) return clock;
  if (clock.activeColor === null && clock.runningSince === null) {
    const remainingMs = {
      ...clock.remainingMs,
      [movedColor]: clock.remainingMs[movedColor] + clock.incrementMs,
    };
    const armsNow = movedColor === tenant.colors[1] && prevMoveNumber === 1;
    if (armsNow && nextStatus.type === 'playing') {
      return { ...clock, activeColor: nextStatus.turn, remainingMs, runningSince: at };
    }
    return { ...clock, remainingMs };
  }
  if (clock.activeColor !== movedColor || clock.runningSince === null) return clock;
  const remaining = Math.max(0, tenantClockRemainingMs(clock, movedColor, at));
  const nextActiveColor = nextStatus.type === 'playing' ? nextStatus.turn : null;
  return {
    ...clock,
    activeColor: nextActiveColor,
    remainingMs: {
      ...clock.remainingMs,
      [movedColor]: nextStatus.type === 'playing' ? remaining + clock.incrementMs : remaining,
    },
    runningSince: nextActiveColor ? at : null,
  };
}

export function expireTenantClock<C extends string>(
  clock: TenantClockState<C> | undefined,
  at: number,
  color: C,
): TenantClockState<C> | undefined {
  if (!clock) return clock;
  return {
    ...clock,
    activeColor: null,
    remainingMs: {
      ...clock.remainingMs,
      [color]: Math.max(0, tenantClockRemainingMs(clock, color, at)),
    },
    runningSince: null,
  };
}

export function freezeTenantClock<C extends string>(
  clock: TenantClockState<C> | undefined,
  at: number,
): TenantClockState<C> | undefined {
  if (!clock) return clock;
  if (clock.activeColor === null && clock.runningSince === null) return clock;
  const active = clock.activeColor;
  const remainingMs = { ...clock.remainingMs };
  if (active) remainingMs[active] = Math.max(0, tenantClockRemainingMs(clock, active, at));
  return {
    ...clock,
    activeColor: null,
    remainingMs,
    runningSince: null,
  };
}

export function tenantClockRemainingMs<C extends string>(
  clock: TenantClockState<C>,
  color: C,
  at: number,
): number {
  const remaining = clock.remainingMs[color];
  if (clock.activeColor !== color || clock.runningSince === null) return remaining;
  return Math.max(0, remaining - Math.max(0, at - clock.runningSince));
}

export function createTenantRuntimeRoom<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  roomId: string,
  options: {
    creatorPreference?: C | 'random';
    now?: number;
    rated?: boolean;
    timeControl?: RoomTimeControl;
  } = {},
): TenantRoomCreation<Kind, C, M, State, Spec> {
  if (!tenant.enabled()) return { ok: false, error: 'disabled' };

  const now = options.now ?? Date.now();
  const events: TenantRoomEvent<C, M, Spec>[] = [
    {
      type: 'room-created',
      at: now,
      roomId,
      gameSpecId: tenant.gameSpecId,
      ...(options.creatorPreference ? { creatorPreference: options.creatorPreference } : {}),
      ...(options.rated ? { rated: true } : {}),
      ...(options.timeControl ? { timeControl: options.timeControl } : {}),
    },
  ];
  if (options.timeControl) {
    events.push({
      type: 'clock-started',
      at: now,
      roomId,
      clock: createTenantClock(
        tenant,
        options.timeControl.initialMs,
        options.timeControl.incrementMs,
      ),
    });
  }
  const hydrated = createTenantRuntimeRoomFromEvents(tenant, events);
  if (!hydrated.ok) throw new Error(`failed to create ${tenant.kind} room: ${hydrated.error}`);
  return { ok: true, room: hydrated.room };
}

export function createTenantRuntimeRoomFromEvents<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  events: readonly TenantRoomEvent<C, M, Spec>[],
  projection = replayTenantEvents(tenant, events),
): TenantRoomHydration<Kind, C, M, State, Spec> {
  if (events.length === 0) return { ok: false, error: 'empty_event_log' };
  if (!isTenantEventLog(tenant, events)) return { ok: false, error: 'invalid_event_log' };
  const first = events[0]!;
  return {
    ok: true,
    room: {
      kind: tenant.kind,
      id: first.roomId,
      clients: new Set(),
      events: [...events],
      projection,
      gameSpecId: tenant.gameSpecId,
      rated: projection.rated,
      abortTimer: null,
      abortDeadline: null,
      abortPhase: null,
      clockTimer: null,
      forfeitTimer: null,
      forfeitDeadline: null,
      forfeitSeat: null,
      gameEndRecorded: projection.state.status.type !== 'playing',
      pendingWrites: Promise.resolve(),
      seatTokens: {},
      rematch: { offers: {} },
      engineTimer: null,
      engineReservationId: null,
    },
  };
}

export function appendTenantRuntimeEvent<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  room: TenantRuntimeRoom<Kind, C, M, State, Spec>,
  event: TenantRoomEvent<C, M, Spec>,
): number {
  room.events.push(event);
  room.projection = applyTenantEvent(tenant, room.projection, event);
  return room.events.length - 1;
}

export function replayTenantEvents<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  events: readonly TenantRoomEvent<C, M, Spec>[],
): TenantProjection<C, State, Spec> {
  const firstRoomId = events[0]?.roomId ?? 'unknown-room';
  return events.reduce(
    (projection, event) => applyTenantEvent(tenant, projection, event),
    initialTenantProjection(tenant, firstRoomId),
  );
}

export function applyTenantEvent<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  projection: TenantProjection<C, State, Spec>,
  event: TenantRoomEvent<C, M, Spec>,
): TenantProjection<C, State, Spec> {
  if (event.roomId !== projection.roomId) return projection;
  const status: TenantGameStatus<C> = projection.state.status;
  if (event.type === 'room-created') {
    return initialTenantProjection(
      tenant,
      event.roomId,
      event.timeControl,
      event.creatorPreference,
      event.rated === true,
    );
  }
  if (event.type === 'seat-assigned') {
    return {
      ...projection,
      seats: {
        ...projection.seats,
        [event.seat]: event.clientId,
      },
    };
  }
  if (event.type === 'clock-started') {
    if (status.type !== 'playing' || projection.clock) return projection;
    return { ...projection, clock: event.clock };
  }
  if (event.type === 'move-played') {
    if (status.type !== 'playing') return projection;
    if (status.turn !== event.color) return projection;
    const prevMoveNumber = projection.state.moveNumber;
    const nextState = tenant.rules.applyMove(projection.state, event.move);
    return {
      ...projection,
      clock:
        event.clock ??
        nextTenantClockForMove(
          tenant,
          projection.clock,
          event.at,
          event.color,
          prevMoveNumber,
          nextState.status,
        ),
      state: nextState,
    };
  }
  if (event.type === 'clock-expired') {
    if (status.type !== 'playing') return projection;
    return {
      ...projection,
      clock: event.clock,
      state: tenant.rules.finish(projection.state, tenant.oppositeColor(event.color), 'timeout'),
    };
  }
  if (event.type === 'seat-resigned') {
    if (status.type !== 'playing') return projection;
    return {
      ...projection,
      clock: event.clock ?? freezeTenantClock(projection.clock, event.at),
      state: tenant.rules.finish(
        projection.state,
        tenant.oppositeColor(event.color),
        'resignation',
      ),
    };
  }
  if (event.type === 'game-aborted') {
    if (status.type !== 'playing') return projection;
    if (projection.state.moveNumber !== 1) return projection;
    return {
      ...projection,
      clock: event.clock ?? freezeTenantClock(projection.clock, event.at),
      state: tenant.rules.abort(projection.state, event.reason),
    };
  }
  if (event.type === 'seat-forfeited') {
    if (status.type !== 'playing') return projection;
    return {
      ...projection,
      clock: event.clock ?? freezeTenantClock(projection.clock, event.at),
      state: tenant.rules.finish(
        projection.state,
        tenant.oppositeColor(event.color),
        'abandonment',
      ),
    };
  }
  return projection;
}

// The full per-seat snapshot wire shape. Pinned per tenant by its golden wire
// fixture; key-set changes here are protocol changes for every tenant.
export type TenantSnapshotPayload<C extends string, M, View, Spec extends string = string> = {
  type: 'snapshot';
  roomId: string;
  gameSpecId: Spec;
  serverAt: number;
  clients: number;
  seat: TenantSeat<C>;
  solo: boolean;
  mode: 'pve' | 'pvp';
  pveEngineId: string | null;
  rated: boolean;
  abortDeadline: number | null;
  forfeitDeadline: number | null;
  clock: TenantClockState<C> | undefined;
  connectedSeats: Record<C, boolean>;
  events: TenantClientEvent<C, M, Spec>[];
  seats: Partial<Record<C, string>>;
  state: View;
  timeControl: RoomTimeControl | undefined;
  rematch: { offers: Record<C, boolean>; finalizedRoomId: string | null };
};

export function tenantSnapshotPayload<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  room: TenantRuntimeRoom<Kind, C, M, State, Spec>,
  client: TenantSnapshotClient<C>,
): TenantSnapshotPayload<C, M, View, Spec> {
  const pveEngineId = tenantPveEngineId(tenant, room);
  const state = tenant.visibility.viewForClient(room.projection.state, client, room.events);
  return {
    type: 'snapshot' as const,
    roomId: room.id,
    gameSpecId: room.gameSpecId,
    serverAt: Date.now(),
    clients: room.clients.size,
    seat: client.seat,
    solo: client.solo,
    mode: pveEngineId ? ('pve' as const) : ('pvp' as const),
    pveEngineId,
    rated: room.rated,
    abortDeadline: room.abortDeadline,
    // Only the present winning seat (opposite the forfeiting seat) learns the
    // forfeit deadline, so the "you win in Ns" banner never leaks to the leaver.
    forfeitDeadline:
      room.forfeitSeat !== null && client.seat === tenant.oppositeColor(room.forfeitSeat)
        ? room.forfeitDeadline
        : null,
    clock: room.projection.clock,
    connectedSeats: computeTenantConnectedSeats(tenant, room.clients, room.projection.seats),
    events: tenantEventsForClient(tenant, room, client),
    seats: room.projection.seats,
    state,
    timeControl: room.projection.timeControl,
    rematch: {
      offers: tenantRematchOfferFlags(tenant, room),
      finalizedRoomId: room.rematch.finalizedRoomId ?? null,
    },
  };
}

function tenantRematchOfferFlags<C extends string>(
  tenant: { colors: readonly [C, C] },
  room: { rematch: { offers: Partial<Record<C, unknown>> } },
): Record<C, boolean> {
  const flags = {} as Record<C, boolean>;
  for (const color of tenant.colors) flags[color] = room.rematch.offers[color] !== undefined;
  return flags;
}

function tenantPveEngineId<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  room: TenantRuntimeRoom<Kind, C, M, State, Spec>,
): string | null {
  if (!tenant.engine) return null;
  for (const seat of tenant.colors) {
    const clientId = room.projection.seats[seat];
    if (tenant.engine.isEngineClientId(clientId)) return clientId ?? null;
  }
  return null;
}

export function tenantEventsForClient<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  room: TenantRuntimeRoom<Kind, C, M, State, Spec>,
  client: TenantSnapshotClient<C>,
): TenantClientEvent<C, M, Spec>[] {
  const out: TenantClientEvent<C, M, Spec>[] = [];
  let ply = 0;
  for (const event of room.events) {
    if (event.type === 'move-played') ply += 1;
    const visible = tenant.visibility.clientEventFor(event, client.seat, ply);
    if (visible) out.push(visible);
  }
  return out;
}

export function tenantPlyAtEventIndex(
  events: readonly { type: string }[],
  eventIndex: number,
): number {
  let ply = 0;
  for (let index = 0; index <= eventIndex && index < events.length; index += 1) {
    if (events[index]?.type === 'move-played') ply += 1;
  }
  return ply;
}

export function isTenantEventLog<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  events: readonly unknown[],
  roomId?: string,
): events is readonly TenantRoomEvent<C, M, Spec>[] {
  const firstRoomId = roomId ?? roomIdFromUnknownEvent(events[0]);
  if (!firstRoomId) return false;
  const [created, ...rest] = events;
  if (
    !isTenantEvent(tenant, created, firstRoomId) ||
    created.type !== 'room-created' ||
    created.gameSpecId !== tenant.gameSpecId ||
    !isFiniteTimestamp(created.at)
  ) {
    return false;
  }
  return rest.every((event) => isTenantEvent(tenant, event, firstRoomId));
}

export function isTenantEvent<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  value: unknown,
  roomId?: string,
): value is TenantRoomEvent<C, M, Spec> {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.roomId !== 'string') return false;
  if (roomId !== undefined && event.roomId !== roomId) return false;
  if (!isFiniteTimestamp(event.at)) return false;
  if (event.type === 'room-created') {
    return (
      event.gameSpecId === tenant.gameSpecId &&
      (event.creatorPreference === undefined ||
        event.creatorPreference === 'random' ||
        tenant.rules.isColor(event.creatorPreference)) &&
      (event.rated === undefined || typeof event.rated === 'boolean') &&
      (event.timeControl === undefined || isRoomTimeControl(event.timeControl))
    );
  }
  if (event.type === 'seat-assigned') {
    return typeof event.clientId === 'string' && tenant.rules.isColor(event.seat);
  }
  if (event.type === 'clock-started') {
    return isTenantClockState(tenant, event.clock);
  }
  if (event.type === 'clock-expired') {
    return tenant.rules.isColor(event.color) && isTenantClockState(tenant, event.clock);
  }
  if (event.type === 'move-played') {
    return (
      tenant.rules.isColor(event.color) &&
      tenant.rules.isMove(event.move) &&
      (event.clock === undefined || isTenantClockState(tenant, event.clock))
    );
  }
  if (event.type === 'seat-resigned') {
    return (
      tenant.rules.isColor(event.color) &&
      (event.clock === undefined || isTenantClockState(tenant, event.clock))
    );
  }
  if (event.type === 'game-aborted') {
    return (
      isAbortReason(event.reason) &&
      (event.clock === undefined || isTenantClockState(tenant, event.clock))
    );
  }
  if (event.type === 'seat-forfeited') {
    return (
      tenant.rules.isColor(event.color) &&
      (event.clock === undefined || isTenantClockState(tenant, event.clock))
    );
  }
  return false;
}

function initialTenantProjection<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  roomId: string,
  timeControl?: RoomTimeControl,
  creatorPreference?: C | 'random',
  rated = false,
): TenantProjection<C, State, Spec> {
  return {
    roomId,
    ...(creatorPreference ? { creatorPreference } : {}),
    gameSpecId: tenant.gameSpecId,
    rated,
    state: tenant.rules.createInitialState(roomId),
    seats: {},
    ...(timeControl ? { timeControl } : {}),
  };
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRoomTimeControl(value: unknown): value is RoomTimeControl {
  if (typeof value !== 'object' || value === null) return false;
  const timeControl = value as Partial<Record<keyof RoomTimeControl, unknown>>;
  return (
    typeof timeControl.initialMs === 'number' &&
    Number.isInteger(timeControl.initialMs) &&
    typeof timeControl.incrementMs === 'number' &&
    Number.isInteger(timeControl.incrementMs)
  );
}

export function isTenantClockState<C extends string>(
  tenant: { colors: readonly [C, C]; rules: { isColor(value: unknown): value is C } },
  value: unknown,
): value is TenantClockState<C> {
  if (typeof value !== 'object' || value === null) return false;
  const clock = value as Partial<TenantClockState<C>>;
  if (!(clock.activeColor === null || tenant.rules.isColor(clock.activeColor))) return false;
  if (typeof clock.initialMs !== 'number' || !Number.isFinite(clock.initialMs)) return false;
  if (typeof clock.incrementMs !== 'number' || !Number.isFinite(clock.incrementMs)) return false;
  if (!(typeof clock.runningSince === 'number' || clock.runningSince === null)) return false;
  if (typeof clock.remainingMs !== 'object' || clock.remainingMs === null) return false;
  const remaining = clock.remainingMs as Partial<Record<C, unknown>>;
  for (const color of tenant.colors) {
    const ms = remaining[color];
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return false;
  }
  return true;
}

export function computeTenantConnectedSeats<C extends string>(
  tenant: {
    colors: readonly [C, C];
    engine?: { isEngineClientId(clientId: string | undefined): boolean };
  },
  clients: Iterable<{ seat: TenantSeat<C>; displaced: boolean }>,
  seats: Partial<Record<C, string>> = {},
): Record<C, boolean> {
  const connected = {} as Record<C, boolean>;
  for (const color of tenant.colors) connected[color] = false;
  for (const client of clients) {
    if (client.displaced) continue;
    if (client.seat !== 'spectator') connected[client.seat as C] = true;
  }
  // PvE: the engine seat holds no WS client but is always present — show it as
  // connected so the human doesn't see the engine as "offline".
  if (tenant.engine) {
    for (const seat of tenant.colors) {
      if (tenant.engine.isEngineClientId(seats[seat])) connected[seat] = true;
    }
  }
  return connected;
}

function roomIdFromUnknownEvent(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const roomId = (value as Record<string, unknown>).roomId;
  return typeof roomId === 'string' ? roomId : undefined;
}
