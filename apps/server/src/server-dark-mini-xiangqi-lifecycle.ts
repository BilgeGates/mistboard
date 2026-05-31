import type { MiniXiangqiColor } from '@mistboard/game';
import type {
  DarkMiniXiangqiEvent,
  DarkMiniXiangqiRuntimeRoom,
} from './dark-mini-xiangqi-runtime.js';
import { logger } from './obs.js';
import { ABORT_WINDOW_MS, FORFEIT_WINDOW_MS } from './room-manager.js';

export type DarkMiniXiangqiLifecycleClient = {
  displaced: boolean;
  seat: MiniXiangqiColor;
};

export type DarkMiniXiangqiLifecycleRoom<
  Client extends DarkMiniXiangqiLifecycleClient = DarkMiniXiangqiLifecycleClient,
> = Omit<DarkMiniXiangqiRuntimeRoom, 'clients'> & {
  clients: Iterable<Client>;
};

export type DarkMiniXiangqiLifecycleContext<
  Room extends DarkMiniXiangqiLifecycleRoom = DarkMiniXiangqiLifecycleRoom,
> = {
  appendEvent(room: Room, event: DarkMiniXiangqiEvent): Promise<number>;
  broadcastEventAppended(room: Room, event: DarkMiniXiangqiEvent, seq: number): void;
  logTimerFailure?(kind: 'abort' | 'forfeit', roomId: string, err: Error): void;
  now?(): number;
};

type DarkMiniXiangqiAbortPhase = 'red-1' | 'black-1';

export function clearDarkMiniXiangqiRuntimeTimers(room: DarkMiniXiangqiLifecycleRoom): void {
  clearDarkMiniXiangqiAbortTimer(room);
  clearDarkMiniXiangqiClockTimer(room);
  clearDarkMiniXiangqiForfeitTimer(room);
}

export function clearDarkMiniXiangqiAbortTimer(room: DarkMiniXiangqiLifecycleRoom): void {
  if (room.abortTimer) clearTimeout(room.abortTimer);
  room.abortTimer = null;
}

export function clearDarkMiniXiangqiClockTimer(room: DarkMiniXiangqiLifecycleRoom): void {
  if (room.clockTimer) clearTimeout(room.clockTimer);
  room.clockTimer = null;
}

export function clearDarkMiniXiangqiForfeitTimer(room: DarkMiniXiangqiLifecycleRoom): void {
  if (room.forfeitTimer) clearTimeout(room.forfeitTimer);
  room.forfeitTimer = null;
}

export function scheduleDarkMiniXiangqiLifecycleTimers<Room extends DarkMiniXiangqiLifecycleRoom>(
  room: Room,
  ctx: DarkMiniXiangqiLifecycleContext<Room>,
): void {
  scheduleDarkMiniXiangqiAbortTimeout(room, ctx);
  scheduleDarkMiniXiangqiForfeitTimeout(room, ctx);
}

export function darkMiniXiangqiAbortPhaseFor(
  room: DarkMiniXiangqiLifecycleRoom,
): DarkMiniXiangqiAbortPhase | null {
  const { status, moveNumber, lastMove } = room.projection.state;
  if (status.type !== 'playing' || moveNumber >= 2) return null;
  if (!room.projection.seats.red || !room.projection.seats.black) return null;
  return lastMove === undefined ? 'red-1' : 'black-1';
}

export function darkMiniXiangqiForfeitingSeat(
  room: DarkMiniXiangqiLifecycleRoom,
): MiniXiangqiColor | null {
  const { status, moveNumber } = room.projection.state;
  if (status.type !== 'playing' || moveNumber < 2) return null;
  const connected = darkMiniXiangqiConnectedSeats(room.clients);
  if (connected.red && !connected.black) return 'black';
  if (!connected.red && connected.black) return 'red';
  return null;
}

export function darkMiniXiangqiConnectedSeats(
  clients: Iterable<DarkMiniXiangqiLifecycleClient>,
): Record<MiniXiangqiColor, boolean> {
  const connected = { red: false, black: false };
  for (const client of clients) {
    if (client.displaced) continue;
    connected[client.seat] = true;
  }
  return connected;
}

function scheduleDarkMiniXiangqiAbortTimeout<Room extends DarkMiniXiangqiLifecycleRoom>(
  room: Room,
  ctx: DarkMiniXiangqiLifecycleContext<Room>,
): void {
  clearDarkMiniXiangqiAbortTimer(room);
  const phase = darkMiniXiangqiAbortPhaseFor(room);
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
    if (darkMiniXiangqiAbortPhaseFor(room) === null) return;
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
        (ctx.logTimerFailure ?? logDarkMiniXiangqiTimerFailure)('abort', room.id, err as Error);
      });
  }, delay + 25);
  room.abortTimer.unref();
}

function scheduleDarkMiniXiangqiForfeitTimeout<Room extends DarkMiniXiangqiLifecycleRoom>(
  room: Room,
  ctx: DarkMiniXiangqiLifecycleContext<Room>,
): void {
  clearDarkMiniXiangqiForfeitTimer(room);
  const seat = darkMiniXiangqiForfeitingSeat(room);
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
    if (darkMiniXiangqiForfeitingSeat(room) !== seat) return;
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
        (ctx.logTimerFailure ?? logDarkMiniXiangqiTimerFailure)('forfeit', room.id, err as Error);
      });
  }, delay + 25);
  room.forfeitTimer.unref();
}

function logDarkMiniXiangqiTimerFailure(
  kind: 'abort' | 'forfeit',
  roomId: string,
  err: Error,
): void {
  logger.error(
    {
      kind:
        kind === 'abort'
          ? 'dark_mini_xiangqi_abort_window_failure'
          : 'dark_mini_xiangqi_forfeit_window_failure',
      room_id: roomId,
      error: err.message,
      at: Date.now(),
    },
    kind === 'abort'
      ? 'Dark Mini Xiangqi abort window failure'
      : 'Dark Mini Xiangqi forfeit window failure',
  );
}
