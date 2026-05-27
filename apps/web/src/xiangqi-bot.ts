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
  type XiangqiCannonVisionMode,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiPiece,
  type XiangqiPieceRole,
  type XiangqiSquare,
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
