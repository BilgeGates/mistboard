import type { JieqiColor, JieqiMove, JieqiPlayerView, JieqiSquare } from '@mistboard/game';

// Pure click-to-move decision for the jieqi board — the web-side half of the
// interaction contract, kept out of the DOM client so it is unit-testable.
//
// Jieqi is identity-hidden, not position-hidden: a player CAN select their own
// face-down pieces (they move by starting point and reveal on the move). So
// selectability is "your own piece with a legal move" — face-down or revealed —
// never an opponent or empty square.

export type JieqiClickResult =
  | { kind: 'select'; square: JieqiSquare }
  | { kind: 'clear' }
  | { kind: 'move'; move: JieqiMove }
  | { kind: 'noop' };

export function jieqiClickResult(
  view: JieqiPlayerView,
  seat: unknown,
  selected: JieqiSquare | null,
  square: JieqiSquare,
): JieqiClickResult {
  if (!canInteract(view, seat)) return { kind: 'noop' };
  if (!selected) {
    return canSelect(view, seat, square) ? { kind: 'select', square } : { kind: 'noop' };
  }
  if (selected === square) return { kind: 'clear' };
  const move = view.legalMoves.find(
    (candidate) => candidate.from === selected && candidate.to === square,
  );
  if (move) return { kind: 'move', move };
  return canSelect(view, seat, square) ? { kind: 'select', square } : { kind: 'clear' };
}

function isJieqiColor(value: unknown): value is JieqiColor {
  return value === 'red' || value === 'black';
}

function canInteract(view: JieqiPlayerView, seat: unknown): boolean {
  return view.status.type === 'playing' && isJieqiColor(seat) && view.status.turn === seat;
}

function canSelect(view: JieqiPlayerView, seat: unknown, square: JieqiSquare): boolean {
  if (!canInteract(view, seat)) return false;
  const entry = view.board[square];
  if (!entry || entry.color !== seat) return false;
  return view.legalMoves.some((move) => move.from === square);
}
