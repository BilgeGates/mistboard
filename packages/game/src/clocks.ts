import type { ClockState, Color, GameStatus } from './types.js';

export const defaultClockInitialMs = 5 * 60 * 1000;
export const defaultClockIncrementMs = 0;

export function createClock(
  at: number,
  initialMs = defaultClockInitialMs,
  incrementMs = defaultClockIncrementMs,
): ClockState {
  return {
    activeColor: 'white',
    incrementMs,
    initialMs,
    remainingMs: {
      black: initialMs,
      white: initialMs,
    },
    runningSince: at,
  };
}

export function advanceClock(
  clock: ClockState | undefined,
  at: number,
  movedColor: Color,
  nextStatus: GameStatus,
): ClockState | undefined {
  if (!clock || clock.activeColor !== movedColor || clock.runningSince === null) return clock;

  const elapsed = Math.max(0, at - clock.runningSince);
  const remaining = Math.max(0, clock.remainingMs[movedColor] - elapsed);
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

export function expireClock(
  clock: ClockState | undefined,
  at: number,
  color: Color,
): ClockState | undefined {
  if (!clock) return clock;
  return {
    ...clock,
    activeColor: null,
    remainingMs: {
      ...clock.remainingMs,
      [color]: Math.max(0, clockRemainingMs(clock, color, at)),
    },
    runningSince: null,
  };
}

export function freezeClock(clock: ClockState | undefined, at: number): ClockState | undefined {
  if (!clock) return clock;
  if (clock.activeColor === null && clock.runningSince === null) return clock;
  const active = clock.activeColor;
  const remainingMs = { ...clock.remainingMs };
  if (active) {
    remainingMs[active] = Math.max(0, clockRemainingMs(clock, active, at));
  }
  return {
    ...clock,
    activeColor: null,
    remainingMs,
    runningSince: null,
  };
}

export function unfreezeClock(
  clock: ClockState | undefined,
  at: number,
  turn: Color,
): ClockState | undefined {
  if (!clock) return clock;
  return {
    ...clock,
    activeColor: turn,
    runningSince: at,
  };
}

export function clockRemainingMs(clock: ClockState, color: Color, at: number): number {
  const remaining = clock.remainingMs[color];
  if (clock.activeColor !== color || clock.runningSince === null) return remaining;
  return Math.max(0, remaining - Math.max(0, at - clock.runningSince));
}
