// Hand-tuned FoW Xiangqi bots — Phase A baselines.
//
// What it is:
//   - 1-ply greedy with a 1-ply opponent-best-capture lookahead. Defends
//     against simple hangs without paying for full 2-ply minimax.
//   - chooseHandTunedMove is god-view (operates on full ground-truth state).
//   - chooseVisibleGreedyMove scores only what the side's PlayerView reveals.
//   - Material + soldier-crossing bonus. General capture is terminal-win.
//
// What it isn't:
//   - A full fair FoW engine. chooseVisibleGreedyMove does not track a belief
//     over hidden pieces.
//   - A strong xiangqi engine. There's no positional eval beyond material,
//     no search past 1.5 plies, no quiescence on full trees.
//
// Purpose: make the /xiangqi-spike random-vs-random probe less stalled,
// and give us a baseline to iterate against.

import {
  applyMove,
  coordOf,
  getLegalMoves,
  getPlayerView,
  inOwnHalf,
  inPalace,
  squareOf,
  type XiangqiBoard,
  type XiangqiCannonVisionMode,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiPiece,
  type XiangqiPieceRole,
  type XiangqiPlayerView,
  type XiangqiSquare,
  type XiangqiVisibleBoardEntry,
} from '@mistboard/game';

const PIECE_VALUE: Record<XiangqiPieceRole, number> = {
  general: 100_000,
  chariot: 900,
  cannon: 450,
  horse: 400,
  elephant: 200,
  advisor: 200,
  soldier: 100,
};

const SOLDIER_CROSSED_BONUS = 80;
const WIN = 1_000_000;
const DRAW_PENALTY = 50;

function pieceValue(piece: XiangqiPiece, square: XiangqiSquare): number {
  const base = PIECE_VALUE[piece.role];
  if (piece.role === 'soldier') {
    const { rank } = coordOf(square);
    const crossed = piece.color === 'red' ? rank >= 6 : rank <= 5;
    return base + (crossed ? SOLDIER_CROSSED_BONUS : 0);
  }
  return base;
}

export function evaluatePosition(state: XiangqiGameState, color: XiangqiColor): number {
  let score = 0;
  for (const sq in state.board) {
    const piece = state.board[sq as XiangqiSquare];
    if (!piece) continue;
    const v = pieceValue(piece, sq as XiangqiSquare);
    score += piece.color === color ? v : -v;
  }
  return score;
}

function bestOpponentCaptureValue(state: XiangqiGameState): number {
  // Assumes `state` is playing — caller checks. Returns the highest piece
  // value the side-to-move can capture in one ply, or 0 if no captures.
  const moves = getLegalMoves(state);
  let best = 0;
  for (const m of moves) {
    const target = state.board[m.to];
    if (!target) continue;
    const v = pieceValue(target, m.to);
    if (v > best) best = v;
  }
  return best;
}

function evaluateMove(state: XiangqiGameState, move: XiangqiMove, color: XiangqiColor): number {
  const next = applyMove(state, move);
  if (next.status.type === 'finished') {
    if (next.status.winner === color) return WIN;
    if (next.status.winner === null) return -DRAW_PENALTY;
    return -WIN;
  }
  // Material balance after our move, minus opponent's best one-ply capture.
  // Opponent's threat is the same across every one of our moves UNLESS our
  // move changes the board in a way that defends — in which case
  // bestOpponentCaptureValue(next) drops naturally.
  const material = evaluatePosition(next, color);
  const oppThreat = bestOpponentCaptureValue(next);
  return material - oppThreat;
}

export function chooseHandTunedMove(
  state: XiangqiGameState,
  color: XiangqiColor,
): XiangqiMove | null {
  if (state.status.type !== 'playing' || state.status.turn !== color) return null;
  const moves = getLegalMoves(state);
  if (moves.length === 0) return null;

  let bestScore = -Infinity;
  let bestMoves: XiangqiMove[] = [];
  for (const move of moves) {
    const score = evaluateMove(state, move, color);
    if (score > bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

export function chooseVisibleGreedyMove(
  state: XiangqiGameState,
  color: XiangqiColor,
  mode: XiangqiCannonVisionMode = 'D',
): XiangqiMove | null {
  if (state.status.type !== 'playing' || state.status.turn !== color) return null;
  const view = getPlayerView(state, color, mode);
  const visible = new Set(view.visibleSquares);
  const moves = view.legalMoves.filter((move) => visible.has(move.to));
  if (moves.length === 0) return null;

  let bestScore = -Infinity;
  let bestMoves: XiangqiMove[] = [];
  for (const move of moves) {
    const target = view.board[move.to];
    const score =
      target && !target.shrouded && target.piece.color !== color
        ? pieceValue(target.piece, move.to)
        : 0;
    if (score > bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

// ── Fair fog-of-war bot: determinization / PIMC-lite ────────────────────────
//
// Plays using ONLY its own PlayerView — never the ground-truth board. For each
// candidate move it samples a handful of full boards consistent with what it
// can see (known pieces fixed; the rest of the standard roster scattered across
// fogged squares under light legality constraints), scores the move on every
// sample with the same material-minus-threat eval the god-view bot uses, and
// plays the best average. This is the variant of belief the demo opponent needs
// without the private engine stack: contained here, no cross-file dependency,
// no neural net, no CFR.
//
// Known simplification: with no move history it assumes the enemy's full roster
// is still on the board (minus pieces it can currently identify), so it slightly
// over-estimates hidden material and errs cautious. Cross-move capture tracking
// is the next increment if that caution reads as passivity in playtest.

const FULL_SIDE_ROSTER: readonly XiangqiPieceRole[] = [
  'general',
  'advisor',
  'advisor',
  'elephant',
  'elephant',
  'horse',
  'horse',
  'chariot',
  'chariot',
  'cannon',
  'cannon',
  'soldier',
  'soldier',
  'soldier',
  'soldier',
  'soldier',
];

const DEFAULT_FAIR_SAMPLES = 8;

function oppositeColor(color: XiangqiColor): XiangqiColor {
  return color === 'red' ? 'black' : 'red';
}

// Cheap legality gate for sampled hidden placements. Tight where a wrong guess
// most distorts the eval (a misplaced general is worth 100k), loose elsewhere.
function canHoldHidden(role: XiangqiPieceRole, color: XiangqiColor, square: XiangqiSquare): boolean {
  const { file, rank } = coordOf(square);
  switch (role) {
    case 'general':
    case 'advisor':
      return inPalace(color, file, rank);
    case 'elephant':
      return inOwnHalf(color, rank);
    case 'soldier':
      // A soldier never sits behind its own starting rank.
      return color === 'red' ? rank >= 4 : rank <= 7;
    default:
      return true; // horse, chariot, cannon: anywhere
  }
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// Build one full board consistent with `view`: every visible square is fixed,
// every shrouded enemy marker gets a plausible type, and the remaining roster is
// scattered across fogged squares. `color` is the bot to move.
function determinize(view: XiangqiPlayerView, color: XiangqiColor, id: string): XiangqiGameState {
  const enemy = oppositeColor(color);
  const board: XiangqiBoard = {};
  const occupied = new Set<XiangqiSquare>();
  const shroudedSquares: XiangqiSquare[] = [];
  const identifiedEnemy = new Map<XiangqiPieceRole, number>();

  for (const [sq, entry] of Object.entries(view.board) as [
    XiangqiSquare,
    XiangqiVisibleBoardEntry | undefined,
  ][]) {
    if (!entry) continue;
    if (entry.shrouded) {
      shroudedSquares.push(sq); // enemy occupies a known square, type unknown
      occupied.add(sq);
      continue;
    }
    board[sq] = entry.piece;
    occupied.add(sq);
    if (entry.piece.color === enemy) {
      identifiedEnemy.set(entry.piece.role, (identifiedEnemy.get(entry.piece.role) ?? 0) + 1);
    }
  }

  // Hidden roster = standard side roster minus pieces already identified.
  const remaining: XiangqiPieceRole[] = [];
  const rosterCounts = new Map<XiangqiPieceRole, number>();
  for (const role of FULL_SIDE_ROSTER) rosterCounts.set(role, (rosterCounts.get(role) ?? 0) + 1);
  for (const [role, total] of rosterCounts) {
    const seen = identifiedEnemy.get(role) ?? 0;
    for (let i = seen; i < total; i++) remaining.push(role);
  }
  shuffleInPlace(remaining);

  // Assign a plausible type to each known-square shrouded marker first.
  for (const sq of shroudedSquares) {
    const idx = remaining.findIndex((role) => canHoldHidden(role, enemy, sq));
    const role = idx >= 0 ? remaining.splice(idx, 1)[0] : 'soldier';
    board[sq] = { color: enemy, role };
  }

  // Scatter the rest across fogged (not-visible, not-occupied) squares.
  const visible = new Set(view.visibleSquares);
  const fogged: XiangqiSquare[] = [];
  for (let f = 0; f < 9; f++) {
    for (let rank = 1; rank <= 10; rank++) {
      const sq = squareOf(f, rank);
      if (!visible.has(sq) && !occupied.has(sq)) fogged.push(sq);
    }
  }
  shuffleInPlace(fogged);
  let cursor = 0;
  for (const role of remaining) {
    for (let k = 0; k < fogged.length; k++) {
      const sq = fogged[(cursor + k) % fogged.length];
      if (occupied.has(sq) || !canHoldHidden(role, enemy, sq)) continue;
      board[sq] = { color: enemy, role };
      occupied.add(sq);
      cursor = (cursor + k + 1) % fogged.length;
      break;
    }
    // If no legal fogged square exists, the piece is simply dropped (≈ captured).
  }

  return {
    id,
    board,
    status: { type: 'playing', turn: color },
    moveNumber: view.moveNumber,
    progressClock: 0,
    positionCounts: {},
  };
}

export function chooseFairMove(
  state: XiangqiGameState,
  color: XiangqiColor,
  mode: XiangqiCannonVisionMode = 'D',
  samples = DEFAULT_FAIR_SAMPLES,
): XiangqiMove | null {
  if (state.status.type !== 'playing' || state.status.turn !== color) return null;
  const view = getPlayerView(state, color, mode);
  const moves = view.legalMoves;
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  const totals = new Array<number>(moves.length).fill(0);
  for (let s = 0; s < samples; s++) {
    const sampled = determinize(view, color, `${state.id}-det${s}`);
    for (let i = 0; i < moves.length; i++) {
      const next = applyMove(sampled, moves[i]);
      let score: number;
      if (next === sampled) {
        // Move was illegal in this determinization (a sampled hidden piece
        // blocked the line). Mildly discourage, but it may be fine elsewhere.
        score = -DRAW_PENALTY;
      } else if (next.status.type === 'finished') {
        score =
          next.status.winner === color ? WIN : next.status.winner === null ? -DRAW_PENALTY : -WIN;
      } else {
        score = evaluatePosition(next, color) - bestOpponentCaptureValue(next);
      }
      totals[i] += score;
    }
  }

  let best = -Infinity;
  let bestIdxs: number[] = [];
  for (let i = 0; i < totals.length; i++) {
    if (totals[i] > best) {
      best = totals[i];
      bestIdxs = [i];
    } else if (totals[i] === best) {
      bestIdxs.push(i);
    }
  }
  return moves[bestIdxs[Math.floor(Math.random() * bestIdxs.length)]];
}
