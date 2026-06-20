import type { BughouseSeatId } from '@mistboard/game';
import {
  type BughouseRuntimeRoom,
  expireBughouseRuntimeClock,
  nextBughouseClockDeadline,
} from './bughouse-runtime.js';

export type BughouseClockLifecycleContext = {
  now?(): number;
  expireClock?(
    room: BughouseRuntimeRoom,
    seat: BughouseSeatId,
    at: number,
  ): Promise<unknown> | unknown;
  logTimerFailure?(kind: 'clock', roomId: string, err: Error): void;
};

export function clearBughouseClockTimer(room: {
  clockTimer: ReturnType<typeof setTimeout> | null;
}): void {
  if (room.clockTimer) clearTimeout(room.clockTimer);
  room.clockTimer = null;
}

export function scheduleBughouseClockTimer(
  room: BughouseRuntimeRoom,
  ctx: BughouseClockLifecycleContext = {},
): void {
  clearBughouseClockTimer(room);
  const now = ctx.now?.() ?? Date.now();
  const deadline = nextBughouseClockDeadline(room.match, now);
  if (!deadline) return;

  const delay = Math.max(0, deadline.remainingMs);
  room.clockTimer = setTimeout(() => {
    const firedAt = Date.now();
    const currentDeadline = nextBughouseClockDeadline(room.match, firedAt);
    if (!currentDeadline || currentDeadline.seat !== deadline.seat) return;
    if (currentDeadline.remainingMs > 0) return;
    void Promise.resolve(
      (ctx.expireClock ?? expireBughouseRuntimeClock)(room, deadline.seat, firedAt),
    ).catch((err) => {
      ctx.logTimerFailure?.('clock', room.id, err as Error);
    });
  }, delay + 25);
  room.clockTimer.unref();
}
