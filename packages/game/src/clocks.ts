import type { ClockState, Color, GameStatus } from './types.js';

export const defaultClockInitialMs = 5 * 60 * 1000;
export const defaultClockIncrementMs = 0;

// Clock policy: how the clock transitions when a move completes. 'live' is
// Fischer deduct-plus-increment; 'days-per-move' is correspondence semantics —
// the mover's allowance resets to the full per-move budget (initialMs) after
// every completed move, with no banking. The policy is selected per room from
// the persisted RoomTimeControl (presence of daysPerMove), never per variant
// or tenant, so replay and hydration re-derive it from the event log alone.
export type ClockPolicyKind = 'live' | 'days-per-move';

// Structural parameter (not RoomTimeControl) because events.ts imports this
// module — importing the type back would be a cycle.
export function clockPolicyKindFor(
  timeControl: { daysPerMove?: number } | null | undefined,
): ClockPolicyKind {
  return timeControl?.daysPerMove ? 'days-per-move' : 'live';
}

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
  policy: ClockPolicyKind = 'live',
): ClockState | undefined {
  if (!clock || clock.activeColor !== movedColor || clock.runningSince === null) return clock;

  const elapsed = Math.max(0, at - clock.runningSince);
  const remaining = Math.max(0, clock.remainingMs[movedColor] - elapsed);
  const nextActiveColor = nextStatus.type === 'playing' ? nextStatus.turn : null;
  // A game-ending move keeps the spent value under both policies; the
  // days-per-move reset only matters when the mover will move again.
  const moverNextMs =
    nextStatus.type !== 'playing'
      ? remaining
      : policy === 'days-per-move'
        ? clock.initialMs
        : remaining + clock.incrementMs;

  return {
    ...clock,
    activeColor: nextActiveColor,
    remainingMs: {
      ...clock.remainingMs,
      [movedColor]: moverNextMs,
    },
    runningSince: nextActiveColor ? at : null,
  };
}

// Single source of truth for the clock transition a move produces. Arms the
// clock on the first full move (frozen-pregame), otherwise advances the active
// clock. Both the live move handlers (room-manager) and the event reducer
// (events) MUST go through this — computing the clock in only one of them lets
// the two diverge (a live handler that just advanceClock()'d never armed the
// clock, so it stayed frozen for the whole game).
export function nextClockForMove(
  clock: ClockState | undefined,
  at: number,
  movedColor: Color,
  prevMoveNumber: number,
  nextStatus: GameStatus,
  policy: ClockPolicyKind = 'live',
): ClockState | undefined {
  return isClockFrozenPregame(clock)
    ? armClockOnFirstMoves(clock, at, movedColor, prevMoveNumber, nextStatus)
    : advanceClock(clock, at, movedColor, nextStatus, policy);
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
