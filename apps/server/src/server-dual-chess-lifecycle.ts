import type { DualChessColor } from '@mistboard/game';
import {
  type DualChessEvent,
  type DualChessRuntimeRoom,
  type DualChessSeat,
  dualChessClockRemainingMs,
  expireDualChessClock,
} from './dual-chess-runtime.js';
import { logger } from './obs.js';
import { ABORT_WINDOW_MS, FORFEIT_WINDOW_MS } from './room-manager.js';

// Seat may be a spectator (the runtime room's client set is mixed); connected-seat
// accounting ignores spectators.
export type DualChessLifecycleClient = { displaced: boolean; seat: DualChessSeat };

export type DualChessLifecycleRoom<
  Client extends DualChessLifecycleClient = DualChessLifecycleClient,
> = Omit<DualChessRuntimeRoom, 'clients'> & { clients: Iterable<Client> };

export type DualChessLifecycleContext<
  Room extends DualChessLifecycleRoom = DualChessLifecycleRoom,
> = {
  appendEvent(room: Room, event: DualChessEvent): Promise<number>;
  broadcastEventAppended(room: Room, event: DualChessEvent, seq: number): void;
  logTimerFailure?(kind: 'abort' | 'clock' | 'forfeit', roomId: string, err: Error): void;
  now?(): number;
};

type DualChessAbortPhase = 'white-1' | 'red-1';

export function clearDualChessRuntimeTimers(room: DualChessLifecycleRoom): void {
  clearDualChessAbortTimer(room);
  clearDualChessClockTimer(room);
  clearDualChessForfeitTimer(room);
}

export function clearDualChessAbortTimer(room: DualChessLifecycleRoom): void {
  if (room.abortTimer) clearTimeout(room.abortTimer);
  room.abortTimer = null;
}

export function clearDualChessClockTimer(room: DualChessLifecycleRoom): void {
  if (room.clockTimer) clearTimeout(room.clockTimer);
  room.clockTimer = null;
}

export function clearDualChessForfeitTimer(room: DualChessLifecycleRoom): void {
  if (room.forfeitTimer) clearTimeout(room.forfeitTimer);
  room.forfeitTimer = null;
}

export function scheduleDualChessLifecycleTimers<Room extends DualChessLifecycleRoom>(
  room: Room,
  ctx: DualChessLifecycleContext<Room>,
): void {
  scheduleDualChessAbortTimeout(room, ctx);
  scheduleDualChessClockTimeout(room, ctx);
  scheduleDualChessForfeitTimeout(room, ctx);
}

export function dualChessAbortPhaseFor(room: DualChessLifecycleRoom): DualChessAbortPhase | null {
  const { status, moveNumber, lastMove } = room.projection.state;
  if (status.type !== 'playing' || moveNumber >= 2) return null;
  if (!room.projection.seats.white || !room.projection.seats.red) return null;
  return lastMove === undefined ? 'white-1' : 'red-1';
}

export function dualChessForfeitingSeat(room: DualChessLifecycleRoom): DualChessColor | null {
  const { status, moveNumber } = room.projection.state;
  if (status.type !== 'playing' || moveNumber < 2) return null;
  const connected = dualChessConnectedSeats(room.clients);
  if (connected.white && !connected.red) return 'red';
  if (!connected.white && connected.red) return 'white';
  return null;
}

export function dualChessConnectedSeats(
  clients: Iterable<DualChessLifecycleClient>,
): Record<DualChessColor, boolean> {
  const connected = { white: false, red: false };
  for (const client of clients) {
    if (client.displaced || client.seat === 'spectator') continue;
    connected[client.seat] = true;
  }
  return connected;
}

function scheduleDualChessAbortTimeout<Room extends DualChessLifecycleRoom>(
  room: Room,
  ctx: DualChessLifecycleContext<Room>,
): void {
  clearDualChessAbortTimer(room);
  const phase = dualChessAbortPhaseFor(room);
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
    if (dualChessAbortPhaseFor(room) === null) return;
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
        (ctx.logTimerFailure ?? logDualChessTimerFailure)('abort', room.id, err as Error);
      });
  }, delay + 25);
  room.abortTimer.unref();
}

function scheduleDualChessClockTimeout<Room extends DualChessLifecycleRoom>(
  room: Room,
  ctx: DualChessLifecycleContext<Room>,
): void {
  clearDualChessClockTimer(room);
  const clock = room.projection.clock;
  const activeColor = clock?.activeColor ?? null;
  if (room.projection.state.status.type !== 'playing' || !clock || activeColor === null) return;
  const now = ctx.now?.() ?? Date.now();
  const delay = Math.max(0, dualChessClockRemainingMs(clock, activeColor, now));
  room.clockTimer = setTimeout(() => {
    const currentClock = room.projection.clock;
    const currentActive = currentClock?.activeColor ?? null;
    if (room.projection.state.status.type !== 'playing' || !currentClock || currentActive === null)
      return;
    const firedAt = Date.now();
    if (dualChessClockRemainingMs(currentClock, currentActive, firedAt) > 0) return;
    const expiredClock = expireDualChessClock(currentClock, firedAt, currentActive);
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
        (ctx.logTimerFailure ?? logDualChessTimerFailure)('clock', room.id, err as Error);
      });
  }, delay + 25);
  room.clockTimer.unref();
}

function scheduleDualChessForfeitTimeout<Room extends DualChessLifecycleRoom>(
  room: Room,
  ctx: DualChessLifecycleContext<Room>,
): void {
  clearDualChessForfeitTimer(room);
  const seat = dualChessForfeitingSeat(room);
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
    if (dualChessForfeitingSeat(room) !== seat) return;
    void ctx
      .appendEvent(room, { type: 'seat-forfeited', at: Date.now(), roomId: room.id, color: seat })
      .then((seq) => {
        const event = room.events[seq];
        if (event) ctx.broadcastEventAppended(room, event, seq);
      })
      .catch((err) => {
        (ctx.logTimerFailure ?? logDualChessTimerFailure)('forfeit', room.id, err as Error);
      });
  }, delay + 25);
  room.forfeitTimer.unref();
}

function logDualChessTimerFailure(
  kind: 'abort' | 'clock' | 'forfeit',
  roomId: string,
  err: Error,
): void {
  logger.error(
    {
      kind: `dual_chess_${kind}_window_failure`,
      room_id: roomId,
      error: err.message,
      at: Date.now(),
    },
    `Dual Chess ${kind} window failure`,
  );
}
