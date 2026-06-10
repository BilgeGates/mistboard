import type { CrossroadsChessColor } from '@mistboard/game';
import {
  type CrossroadsChessEvent,
  type CrossroadsChessRuntimeRoom,
  type CrossroadsChessSeat,
  crossroadsChessClockRemainingMs,
  expireCrossroadsChessClock,
} from './crossroads-chess-runtime.js';
import { logger } from './obs.js';
import { ABORT_WINDOW_MS, FORFEIT_WINDOW_MS } from './room-manager.js';

// Seat may be a spectator (the runtime room's client set is mixed); connected-seat
// accounting ignores spectators.
export type CrossroadsChessLifecycleClient = { displaced: boolean; seat: CrossroadsChessSeat };

export type CrossroadsChessLifecycleRoom<
  Client extends CrossroadsChessLifecycleClient = CrossroadsChessLifecycleClient,
> = Omit<CrossroadsChessRuntimeRoom, 'clients'> & { clients: Iterable<Client> };

export type CrossroadsChessLifecycleContext<
  Room extends CrossroadsChessLifecycleRoom = CrossroadsChessLifecycleRoom,
> = {
  appendEvent(room: Room, event: CrossroadsChessEvent): Promise<number>;
  broadcastEventAppended(room: Room, event: CrossroadsChessEvent, seq: number): void;
  logTimerFailure?(kind: 'abort' | 'clock' | 'forfeit', roomId: string, err: Error): void;
  now?(): number;
};

type CrossroadsChessAbortPhase = 'white-1' | 'red-1';

export function clearCrossroadsChessRuntimeTimers(room: CrossroadsChessLifecycleRoom): void {
  clearCrossroadsChessAbortTimer(room);
  clearCrossroadsChessClockTimer(room);
  clearCrossroadsChessForfeitTimer(room);
}

export function clearCrossroadsChessAbortTimer(room: CrossroadsChessLifecycleRoom): void {
  if (room.abortTimer) clearTimeout(room.abortTimer);
  room.abortTimer = null;
}

export function clearCrossroadsChessClockTimer(room: CrossroadsChessLifecycleRoom): void {
  if (room.clockTimer) clearTimeout(room.clockTimer);
  room.clockTimer = null;
}

export function clearCrossroadsChessForfeitTimer(room: CrossroadsChessLifecycleRoom): void {
  if (room.forfeitTimer) clearTimeout(room.forfeitTimer);
  room.forfeitTimer = null;
}

export function scheduleCrossroadsChessLifecycleTimers<Room extends CrossroadsChessLifecycleRoom>(
  room: Room,
  ctx: CrossroadsChessLifecycleContext<Room>,
): void {
  scheduleCrossroadsChessAbortTimeout(room, ctx);
  scheduleCrossroadsChessClockTimeout(room, ctx);
  scheduleCrossroadsChessForfeitTimeout(room, ctx);
}

export function crossroadsChessAbortPhaseFor(
  room: CrossroadsChessLifecycleRoom,
): CrossroadsChessAbortPhase | null {
  const { status, moveNumber, lastMove } = room.projection.state;
  if (status.type !== 'playing' || moveNumber >= 2) return null;
  if (!room.projection.seats.white || !room.projection.seats.red) return null;
  return lastMove === undefined ? 'white-1' : 'red-1';
}

export function crossroadsChessForfeitingSeat(
  room: CrossroadsChessLifecycleRoom,
): CrossroadsChessColor | null {
  const { status, moveNumber } = room.projection.state;
  if (status.type !== 'playing' || moveNumber < 2) return null;
  const connected = crossroadsChessConnectedSeats(room.clients);
  if (connected.white && !connected.red) return 'red';
  if (!connected.white && connected.red) return 'white';
  return null;
}

export function crossroadsChessConnectedSeats(
  clients: Iterable<CrossroadsChessLifecycleClient>,
): Record<CrossroadsChessColor, boolean> {
  const connected = { white: false, red: false };
  for (const client of clients) {
    if (client.displaced || client.seat === 'spectator') continue;
    connected[client.seat] = true;
  }
  return connected;
}

function scheduleCrossroadsChessAbortTimeout<Room extends CrossroadsChessLifecycleRoom>(
  room: Room,
  ctx: CrossroadsChessLifecycleContext<Room>,
): void {
  clearCrossroadsChessAbortTimer(room);
  const phase = crossroadsChessAbortPhaseFor(room);
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
    if (crossroadsChessAbortPhaseFor(room) === null) return;
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
        (ctx.logTimerFailure ?? logCrossroadsChessTimerFailure)('abort', room.id, err as Error);
      });
  }, delay + 25);
  room.abortTimer.unref();
}

function scheduleCrossroadsChessClockTimeout<Room extends CrossroadsChessLifecycleRoom>(
  room: Room,
  ctx: CrossroadsChessLifecycleContext<Room>,
): void {
  clearCrossroadsChessClockTimer(room);
  const clock = room.projection.clock;
  const activeColor = clock?.activeColor ?? null;
  if (room.projection.state.status.type !== 'playing' || !clock || activeColor === null) return;
  const now = ctx.now?.() ?? Date.now();
  const delay = Math.max(0, crossroadsChessClockRemainingMs(clock, activeColor, now));
  room.clockTimer = setTimeout(() => {
    const currentClock = room.projection.clock;
    const currentActive = currentClock?.activeColor ?? null;
    if (room.projection.state.status.type !== 'playing' || !currentClock || currentActive === null)
      return;
    const firedAt = Date.now();
    if (crossroadsChessClockRemainingMs(currentClock, currentActive, firedAt) > 0) return;
    const expiredClock = expireCrossroadsChessClock(currentClock, firedAt, currentActive);
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
        (ctx.logTimerFailure ?? logCrossroadsChessTimerFailure)('clock', room.id, err as Error);
      });
  }, delay + 25);
  room.clockTimer.unref();
}

function scheduleCrossroadsChessForfeitTimeout<Room extends CrossroadsChessLifecycleRoom>(
  room: Room,
  ctx: CrossroadsChessLifecycleContext<Room>,
): void {
  clearCrossroadsChessForfeitTimer(room);
  const seat = crossroadsChessForfeitingSeat(room);
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
    if (crossroadsChessForfeitingSeat(room) !== seat) return;
    void ctx
      .appendEvent(room, { type: 'seat-forfeited', at: Date.now(), roomId: room.id, color: seat })
      .then((seq) => {
        const event = room.events[seq];
        if (event) ctx.broadcastEventAppended(room, event, seq);
      })
      .catch((err) => {
        (ctx.logTimerFailure ?? logCrossroadsChessTimerFailure)('forfeit', room.id, err as Error);
      });
  }, delay + 25);
  room.forfeitTimer.unref();
}

function logCrossroadsChessTimerFailure(
  kind: 'abort' | 'clock' | 'forfeit',
  roomId: string,
  err: Error,
): void {
  logger.error(
    {
      kind: `crossroads_chess_${kind}_window_failure`,
      room_id: roomId,
      error: err.message,
      at: Date.now(),
    },
    `Crossroads Chess ${kind} window failure`,
  );
}
