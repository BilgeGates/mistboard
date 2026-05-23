import type { ClockState, Color, GameStatus } from './types.js';

export const defaultClockInitialMs = 5 * 60 * 1000;
export const defaultClockIncrementMs = 0;

export function createClock(
  _at: number,
  initialMs = defaultClockInitialMs,
  incrementMs = defaultClockIncrementMs,
): ClockState {
  // Starts frozen: neither clock ticks until both players have played their
  // first move. The clock is armed (see armClockOnFirstMoves) when black
  // completes the first full move.
  return {
    activeColor: null,
    incrementMs,
    initialMs,
    remainingMs: {
      black: initialMs,
      white: initialMs,
    },
    runningSince: null,
  };
}

// Pre-arm clock progression for the first two plies. While the clock is frozen
// (before both first moves), no time is spent, but the mover is granted their
// increment (increment-from-move-1). Black's first move (moveNumber 1 -> 2)
// arms the clock so the side to move begins ticking normally.
export function armClockOnFirstMoves(
  clock: ClockState | undefined,
  at: number,
  movedColor: Color,
  prevMoveNumber: number,
  nextStatus: GameStatus,
): ClockState | undefined {
  if (!clock) return clock;
  const remainingMs = {
    ...clock.remainingMs,
    [movedColor]: clock.remainingMs[movedColor] + clock.incrementMs,
  };
  const armsNow = movedColor === 'black' && prevMoveNumber === 1;
  if (armsNow && nextStatus.type === 'playing') {
    return { ...clock, activeColor: nextStatus.turn, remainingMs, runningSince: at };
  }
  return { ...clock, remainingMs };
}

export function isClockFrozenPregame(clock: ClockState | undefined): boolean {
  return !!clock && clock.activeColor === null && clock.runningSince === null;
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
