/**
 * Generic lifecycle timers for tenant rooms: the pregame abort window, the
 * active-clock expiry timer, and the disconnect-forfeit window. All timers are
 * speculative and .unref()'d (leaked-timer rule), re-derived from room state on
 * every schedule call, and append their terminal event through the tenant's
 * event writer so persistence/broadcast behave exactly like a player action.
 */

import { logger } from '../obs.js';
import { ABORT_WINDOW_MS, FORFEIT_WINDOW_MS } from '../room-manager.js';
import { expireTenantClock, tenantClockRemainingMs } from './runtime.js';
import type {
  TenantAbortPhase,
  TenantGameStateLike,
  TenantRoomEvent,
  TenantRuntimeRoom,
} from './tenant.js';

export type TenantLifecycleClient<C extends string> = {
  displaced: boolean;
  seat: C;
};

export type TenantLifecycleRoom<
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  Spec extends string = string,
  Client extends TenantLifecycleClient<C> = TenantLifecycleClient<C>,
> = Omit<TenantRuntimeRoom<string, C, M, State, Spec>, 'clients' | 'kind'> & {
  kind: string;
  clients: Iterable<Client>;
};

export type TenantLifecycleContext<
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  Spec extends string = string,
  Room extends TenantLifecycleRoom<C, M, State, Spec> = TenantLifecycleRoom<C, M, State, Spec>,
> = {
  appendEvent(room: Room, event: TenantRoomEvent<C, M, Spec>): Promise<number>;
  broadcastEventAppended(room: Room, event: TenantRoomEvent<C, M, Spec>, seq: number): void;
  logTimerFailure?(kind: 'abort' | 'clock' | 'forfeit', roomId: string, err: Error): void;
  now?(): number;
};

export type TenantLifecycleTenant<C extends string> = {
  colors: readonly [C, C];
  engine?: { isEngineClientId(clientId: string | undefined): boolean };
  persistence: { logKindPrefix: string; logLabel: string };
};

export function clearTenantRuntimeTimers(room: {
  abortTimer: ReturnType<typeof setTimeout> | null;
  clockTimer: ReturnType<typeof setTimeout> | null;
  forfeitTimer: ReturnType<typeof setTimeout> | null;
  engineTimer: ReturnType<typeof setTimeout> | null;
}): void {
  clearTenantAbortTimer(room);
  clearTenantClockTimer(room);
  clearTenantForfeitTimer(room);
  if (room.engineTimer) clearTimeout(room.engineTimer);
  room.engineTimer = null;
}

export function clearTenantAbortTimer(room: {
  abortTimer: ReturnType<typeof setTimeout> | null;
}): void {
  if (room.abortTimer) clearTimeout(room.abortTimer);
  room.abortTimer = null;
}

export function clearTenantClockTimer(room: {
  clockTimer: ReturnType<typeof setTimeout> | null;
}): void {
  if (room.clockTimer) clearTimeout(room.clockTimer);
  room.clockTimer = null;
}

export function clearTenantForfeitTimer(room: {
  forfeitTimer: ReturnType<typeof setTimeout> | null;
}): void {
  if (room.forfeitTimer) clearTimeout(room.forfeitTimer);
  room.forfeitTimer = null;
}

export function scheduleTenantLifecycleTimers<
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  Spec extends string,
  Room extends TenantLifecycleRoom<C, M, State, Spec>,
>(
  tenant: TenantLifecycleTenant<C>,
  room: Room,
  ctx: TenantLifecycleContext<C, M, State, Spec, Room>,
): void {
  scheduleTenantAbortTimeout(tenant, room, ctx);
  scheduleTenantClockTimeout(tenant, room, ctx);
  scheduleTenantForfeitTimeout(tenant, room, ctx);
}

export function tenantAbortPhaseFor<
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  Spec extends string,
>(
  tenant: TenantLifecycleTenant<C>,
  room: TenantLifecycleRoom<C, M, State, Spec>,
): TenantAbortPhase<C> | null {
  const { status, moveNumber, lastMove } = room.projection.state;
  if (status.type !== 'playing' || moveNumber >= 2) return null;
  for (const color of tenant.colors) {
    if (!room.projection.seats[color]) return null;
  }
  return lastMove === undefined ? `${tenant.colors[0]}-1` : `${tenant.colors[1]}-1`;
}

export function tenantForfeitingSeat<
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  Spec extends string,
>(tenant: TenantLifecycleTenant<C>, room: TenantLifecycleRoom<C, M, State, Spec>): C | null {
  const { status, moveNumber } = room.projection.state;
  if (status.type !== 'playing' || moveNumber < 2) return null;
  const connected = tenantConnectedSeats(tenant, room.clients);
  // PvE: the engine seat has no WS client but is always "present" — never forfeit
  // it for "disconnection" (else a PvE game self-forfeits to the human the moment
  // play starts). A human who actually leaves still forfeits their own seat.
  if (tenant.engine) {
    for (const seat of tenant.colors) {
      if (tenant.engine.isEngineClientId(room.projection.seats[seat])) connected[seat] = true;
    }
  }
  const [first, second] = tenant.colors;
  if (connected[first] && !connected[second]) return second;
  if (!connected[first] && connected[second]) return first;
  return null;
}

export function tenantConnectedSeats<C extends string>(
  tenant: { colors: readonly [C, C] },
  clients: Iterable<TenantLifecycleClient<C>>,
): Record<C, boolean> {
  const connected = {} as Record<C, boolean>;
  for (const color of tenant.colors) connected[color] = false;
  for (const client of clients) {
    if (client.displaced) continue;
    connected[client.seat] = true;
  }
  return connected;
}

function scheduleTenantAbortTimeout<
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  Spec extends string,
  Room extends TenantLifecycleRoom<C, M, State, Spec>,
>(
  tenant: TenantLifecycleTenant<C>,
  room: Room,
  ctx: TenantLifecycleContext<C, M, State, Spec, Room>,
): void {
  clearTenantAbortTimer(room);
  const phase = tenantAbortPhaseFor(tenant, room);
  if (phase === null) {
    room.abortDeadline = null;
    room.abortPhase = null;
    return;
  }
  const now = ctx.now?.() ?? Date.now();
  if (room.abortPhase !== phase || room.abortDeadline === null) {
    room.abortPhase = phase;
    room.abortDeadline = now + ABORT_WINDOW_MS;
  }
  const delay = Math.max(0, room.abortDeadline - now);
  room.abortTimer = setTimeout(() => {
    if (tenantAbortPhaseFor(tenant, room) === null) return;
    void ctx
      .appendEvent(room, {
        type: 'game-aborted',
        at: Date.now(),
        roomId: room.id,
        reason: 'pregame-timeout',
      })
      .then((seq) => {
        const event = room.events[seq];
        if (event) ctx.broadcastEventAppended(room, event, seq);
      })
      .catch((err) => {
        (ctx.logTimerFailure ?? tenantTimerFailureLogger(tenant))('abort', room.id, err as Error);
      });
  }, delay + 25);
  room.abortTimer.unref();
}

function scheduleTenantClockTimeout<
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  Spec extends string,
  Room extends TenantLifecycleRoom<C, M, State, Spec>,
>(
  tenant: TenantLifecycleTenant<C>,
  room: Room,
  ctx: TenantLifecycleContext<C, M, State, Spec, Room>,
): void {
  clearTenantClockTimer(room);
  const clock = room.projection.clock;
  const activeColor = clock?.activeColor ?? null;
  if (room.projection.state.status.type !== 'playing' || !clock || activeColor === null) return;
  const now = ctx.now?.() ?? Date.now();
  const delay = Math.max(0, tenantClockRemainingMs(clock, activeColor, now));
  room.clockTimer = setTimeout(() => {
    const currentClock = room.projection.clock;
    const currentActive = currentClock?.activeColor ?? null;
    if (room.projection.state.status.type !== 'playing' || !currentClock || currentActive === null)
      return;
    const firedAt = Date.now();
    if (tenantClockRemainingMs(currentClock, currentActive, firedAt) > 0) return;
    const expiredClock = expireTenantClock(currentClock, firedAt, currentActive);
    if (!expiredClock) return;
    void ctx
      .appendEvent(room, {
        type: 'clock-expired',
        at: firedAt,
        roomId: room.id,
        color: currentActive,
        clock: expiredClock,
      })
      .then((seq) => {
        const event = room.events[seq];
        if (event) ctx.broadcastEventAppended(room, event, seq);
      })
      .catch((err) => {
        (ctx.logTimerFailure ?? tenantTimerFailureLogger(tenant))('clock', room.id, err as Error);
      });
  }, delay + 25);
  room.clockTimer.unref();
}

function scheduleTenantForfeitTimeout<
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  Spec extends string,
  Room extends TenantLifecycleRoom<C, M, State, Spec>,
>(
  tenant: TenantLifecycleTenant<C>,
  room: Room,
  ctx: TenantLifecycleContext<C, M, State, Spec, Room>,
): void {
  clearTenantForfeitTimer(room);
  const seat = tenantForfeitingSeat(tenant, room);
  if (seat === null) {
    room.forfeitSeat = null;
    room.forfeitDeadline = null;
    return;
  }
  const now = ctx.now?.() ?? Date.now();
  if (room.forfeitSeat !== seat || room.forfeitDeadline === null) {
    room.forfeitSeat = seat;
    room.forfeitDeadline = now + FORFEIT_WINDOW_MS;
  }
  const delay = Math.max(0, room.forfeitDeadline - now);
  room.forfeitTimer = setTimeout(() => {
    if (tenantForfeitingSeat(tenant, room) !== seat) return;
    void ctx
      .appendEvent(room, {
        type: 'seat-forfeited',
        at: Date.now(),
        roomId: room.id,
        color: seat,
      })
      .then((seq) => {
        const event = room.events[seq];
        if (event) ctx.broadcastEventAppended(room, event, seq);
      })
      .catch((err) => {
        (ctx.logTimerFailure ?? tenantTimerFailureLogger(tenant))('forfeit', room.id, err as Error);
      });
  }, delay + 25);
  room.forfeitTimer.unref();
}

function tenantTimerFailureLogger(tenant: {
  persistence: { logKindPrefix: string; logLabel: string };
}): (kind: 'abort' | 'clock' | 'forfeit', roomId: string, err: Error) => void {
  return (kind, roomId, err) => logTenantTimerFailure(tenant.persistence, kind, roomId, err);
}

function logTenantTimerFailure(
  identity: { logKindPrefix: string; logLabel: string },
  kind: 'abort' | 'clock' | 'forfeit',
  roomId: string,
  err: Error,
): void {
  logger.error(
    {
      kind:
        kind === 'abort'
          ? `${identity.logKindPrefix}_abort_window_failure`
          : kind === 'clock'
            ? `${identity.logKindPrefix}_clock_failure`
            : `${identity.logKindPrefix}_forfeit_window_failure`,
      room_id: roomId,
      error: err.message,
      at: Date.now(),
    },
    kind === 'abort'
      ? `${identity.logLabel} abort window failure`
      : kind === 'clock'
        ? `${identity.logLabel} clock failure`
        : `${identity.logLabel} forfeit window failure`,
  );
}
