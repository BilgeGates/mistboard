import type { XiangqiColor } from '@mistboard/game';
import {
  darkXiangqiClockRemainingMs,
  expireDarkXiangqiClock,
  type DarkXiangqiEvent,
  type DarkXiangqiRuntimeRoom,
} from './dark-xiangqi-runtime.js';
import { logger } from './obs.js';
import { ABORT_WINDOW_MS, FORFEIT_WINDOW_MS } from './room-manager.js';

export type DarkXiangqiLifecycleClient = {
  displaced: boolean;
  seat: XiangqiColor;
};

export type DarkXiangqiLifecycleRoom<
  Client extends DarkXiangqiLifecycleClient = DarkXiangqiLifecycleClient,
> = Omit<DarkXiangqiRuntimeRoom, 'clients'> & {
  clients: Iterable<Client>;
};

export type DarkXiangqiLifecycleContext<
  Room extends DarkXiangqiLifecycleRoom = DarkXiangqiLifecycleRoom,
> = {
  appendEvent(room: Room, event: DarkXiangqiEvent): Promise<number>;
  broadcastEventAppended(room: Room, event: DarkXiangqiEvent, seq: number): void;
  logTimerFailure?(kind: 'abort' | 'clock' | 'forfeit', roomId: string, err: Error): void;
  now?(): number;
};

type DarkXiangqiAbortPhase = 'red-1' | 'black-1';

export function clearDarkXiangqiRuntimeTimers(room: DarkXiangqiLifecycleRoom): void {
  clearDarkXiangqiAbortTimer(room);
  clearDarkXiangqiClockTimer(room);
  clearDarkXiangqiForfeitTimer(room);
}

export function clearDarkXiangqiAbortTimer(room: DarkXiangqiLifecycleRoom): void {
  if (room.abortTimer) clearTimeout(room.abortTimer);
  room.abortTimer = null;
}

export function clearDarkXiangqiClockTimer(room: DarkXiangqiLifecycleRoom): void {
  if (room.clockTimer) clearTimeout(room.clockTimer);
  room.clockTimer = null;
}

export function clearDarkXiangqiForfeitTimer(room: DarkXiangqiLifecycleRoom): void {
  if (room.forfeitTimer) clearTimeout(room.forfeitTimer);
  room.forfeitTimer = null;
}

export function scheduleDarkXiangqiLifecycleTimers<Room extends DarkXiangqiLifecycleRoom>(
  room: Room,
  ctx: DarkXiangqiLifecycleContext<Room>,
): void {
  scheduleDarkXiangqiAbortTimeout(room, ctx);
  scheduleDarkXiangqiClockTimeout(room, ctx);
  scheduleDarkXiangqiForfeitTimeout(room, ctx);
}

export function darkXiangqiAbortPhaseFor(
  room: DarkXiangqiLifecycleRoom,
): DarkXiangqiAbortPhase | null {
  const { status, moveNumber, lastMove } = room.projection.state;
  if (status.type !== 'playing' || moveNumber >= 2) return null;
  if (!room.projection.seats.red || !room.projection.seats.black) return null;
  return lastMove === undefined ? 'red-1' : 'black-1';
}

export function darkXiangqiForfeitingSeat(room: DarkXiangqiLifecycleRoom): XiangqiColor | null {
  const { status, moveNumber } = room.projection.state;
  if (status.type !== 'playing' || moveNumber < 2) return null;
  const connected = darkXiangqiConnectedSeats(room.clients);
  if (connected.red && !connected.black) return 'black';
  if (!connected.red && connected.black) return 'red';
  return null;
}

export function darkXiangqiConnectedSeats(
  clients: Iterable<DarkXiangqiLifecycleClient>,
): Record<XiangqiColor, boolean> {
  const connected = { red: false, black: false };
  for (const client of clients) {
    if (client.displaced) continue;
    connected[client.seat] = true;
  }
  return connected;
}

function scheduleDarkXiangqiAbortTimeout<Room extends DarkXiangqiLifecycleRoom>(
  room: Room,
  ctx: DarkXiangqiLifecycleContext<Room>,
): void {
  clearDarkXiangqiAbortTimer(room);
  const phase = darkXiangqiAbortPhaseFor(room);
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
    if (darkXiangqiAbortPhaseFor(room) === null) return;
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
        (ctx.logTimerFailure ?? logDarkXiangqiTimerFailure)('abort', room.id, err as Error);
      });
  }, delay + 25);
  room.abortTimer.unref();
}

function scheduleDarkXiangqiClockTimeout<Room extends DarkXiangqiLifecycleRoom>(
  room: Room,
  ctx: DarkXiangqiLifecycleContext<Room>,
): void {
  clearDarkXiangqiClockTimer(room);
  const clock = room.projection.clock;
  const activeColor = clock?.activeColor ?? null;
  if (room.projection.state.status.type !== 'playing' || !clock || activeColor === null) return;
  const now = ctx.now?.() ?? Date.now();
  const delay = Math.max(0, darkXiangqiClockRemainingMs(clock, activeColor, now));
  room.clockTimer = setTimeout(() => {
    const currentClock = room.projection.clock;
    const currentActive = currentClock?.activeColor ?? null;
    if (room.projection.state.status.type !== 'playing' || !currentClock || currentActive === null)
      return;
    const firedAt = Date.now();
    if (darkXiangqiClockRemainingMs(currentClock, currentActive, firedAt) > 0) return;
    const expiredClock = expireDarkXiangqiClock(currentClock, firedAt, currentActive);
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
        (ctx.logTimerFailure ?? logDarkXiangqiTimerFailure)('clock', room.id, err as Error);
      });
  }, delay + 25);
  room.clockTimer.unref();
}

function scheduleDarkXiangqiForfeitTimeout<Room extends DarkXiangqiLifecycleRoom>(
  room: Room,
  ctx: DarkXiangqiLifecycleContext<Room>,
): void {
  clearDarkXiangqiForfeitTimer(room);
  const seat = darkXiangqiForfeitingSeat(room);
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
    if (darkXiangqiForfeitingSeat(room) !== seat) return;
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
        (ctx.logTimerFailure ?? logDarkXiangqiTimerFailure)('forfeit', room.id, err as Error);
      });
  }, delay + 25);
  room.forfeitTimer.unref();
}

function logDarkXiangqiTimerFailure(
  kind: 'abort' | 'clock' | 'forfeit',
  roomId: string,
  err: Error,
): void {
  logger.error(
    {
      kind:
        kind === 'abort'
          ? 'dark_xiangqi_abort_window_failure'
          : kind === 'clock'
            ? 'dark_xiangqi_clock_failure'
            : 'dark_xiangqi_forfeit_window_failure',
      room_id: roomId,
      error: err.message,
      at: Date.now(),
    },
    kind === 'abort'
      ? 'Dark Xiangqi abort window failure'
      : kind === 'clock'
        ? 'Dark Xiangqi clock failure'
        : 'Dark Xiangqi forfeit window failure',
  );
}
