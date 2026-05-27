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
  inBounds,
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

// ── Fair fog-of-war bot ─────────────────────────────────────────────────────
//
// Plays using ONLY its own PlayerView — never the ground-truth board. See
// chooseFairMove below for the scoring model. Two earlier approaches failed and
// are worth not repeating: full-roster determinization (scatter the enemy's
// hidden pieces across the fog) invents phantom attackers — including phantom
// checks on the general worth 100k — that swamp the eval; and global material on
// the visible-only board makes the near-empty enemy look nearly dead, so any
// capture reads as a winning/king-mating move. Both traded a cannon for a
// defended horse. Local per-move scoring plus an explicit unseen-defender prior
// avoids both. Contained here: no private engine stack, no neural net, no CFR.

// Fraction of a destination's neighbourhood that must be fogged before a capture
// there is treated as fully defended (whole moving-piece value at risk).
const FOG_FULL_RISK_EXPOSURE = 0.5;

function oppositeColor(color: XiangqiColor): XiangqiColor {
  return color === 'red' ? 'black' : 'red';
}

// How fogged the neighbourhood of a square is, 0 (fully seen) … 1 (fully dark).
// A proxy for "could an unseen defender be covering this square."
function fogExposure(square: XiangqiSquare, visible: Set<XiangqiSquare>): number {
  const { file, rank } = coordOf(square);
  let total = 0;
  let fogged = 0;
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const f = file + df;
      const r = rank + dr;
      if (!inBounds(f, r)) continue;
      total++;
      if (!visible.has(squareOf(f, r))) fogged++;
    }
  }
  return total === 0 ? 0 : fogged / total;
}

// The board the bot can actually see: identified pieces as-is, shrouded enemy
// markers kept as minimal blockers (so cannon screens and blocked lines stay
// correct) without leaking their true type. `color` is the side to move.
function buildVisibleState(
  view: XiangqiPlayerView,
  color: XiangqiColor,
  id: string,
): XiangqiGameState {
  const enemy = oppositeColor(color);
  const board: XiangqiBoard = {};
  for (const [sq, entry] of Object.entries(view.board) as [
    XiangqiSquare,
    XiangqiVisibleBoardEntry | undefined,
  ][]) {
    if (!entry) continue;
    board[sq] = entry.shrouded ? { color: enemy, role: 'soldier' } : entry.piece;
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

// Tiny tie-breaker so safe quiet moves have direction instead of being random:
// nudge non-general pieces forward, gently discourage shuffling the general.
// Weights are deliberately an order of magnitude below any piece value so this
// never overrides a tactical decision.
function positionalNudge(move: XiangqiMove, mover: XiangqiPiece, color: XiangqiColor): number {
  if (mover.role === 'general') return -4;
  const forward = color === 'red' ? coordOf(move.to).rank - coordOf(move.from).rank : coordOf(move.from).rank - coordOf(move.to).rank;
  return Math.max(0, forward) * 2;
}

// Fair fog-of-war bot. Scores each move LOCALLY on what the bot can see — capture
// gain, minus what the opponent takes back (a visible recapture OR, for captures
// into fog, an unseen-defender prior worth the moving piece), minus any piece
// left hanging to a visible enemy, plus a small positional nudge. Only capturing
// a visible enemy general counts as a win. It never counts global material or
// terminal stalemate, both of which are meaningless when most of the enemy is
// hidden (that was what made the earlier determinization and visible-board
// material evals trade a cannon for a defended horse).
export function chooseFairMove(
  state: XiangqiGameState,
  color: XiangqiColor,
  mode: XiangqiCannonVisionMode = 'D',
): XiangqiMove | null {
  if (state.status.type !== 'playing' || state.status.turn !== color) return null;
  const view = getPlayerView(state, color, mode);
  const moves = view.legalMoves;
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  const visible = new Set(view.visibleSquares);
  const known = buildVisibleState(view, color, state.id);

  let best = -Infinity;
  let bestIdxs: number[] = [];
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const mover = known.board[move.from];
    const captured = known.board[move.to];
    const capturesEnemy = !!captured && !!mover && captured.color !== mover.color;

    let score: number;
    if (capturesEnemy && captured!.role === 'general') {
      score = WIN; // taking the (visible) enemy general ends the game
    } else {
      const next = applyMove(known, move);
      if (next === known || !mover) {
        // Illegal once the visible board is laid out (a shrouded blocker sits in
        // the line) — playable on the true board, but discourage relying on it.
        score = -DRAW_PENALTY;
      } else {
        const moverValue = PIECE_VALUE[mover.role];
        const captureGain = capturesEnemy ? PIECE_VALUE[captured!.role] : 0;
        // What the opponent grabs in reply, using only pieces the bot can see.
        const visibleThreat = bestOpponentCaptureValue(next);
        // Unseen defender: a capture into fog risks losing the moving piece to a
        // piece the bot cannot see; ramp to the full mover value as fog deepens.
        const fogThreat = capturesEnemy
          ? moverValue * Math.min(1, fogExposure(move.to, visible) / FOG_FULL_RISK_EXPOSURE)
          : 0;
        score = captureGain - Math.max(visibleThreat, fogThreat) + positionalNudge(move, mover, color);
      }
    }

    if (score > best) {
      best = score;
      bestIdxs = [i];
    } else if (score === best) {
      bestIdxs.push(i);
    }
  }
  return moves[bestIdxs[Math.floor(Math.random() * bestIdxs.length)]];
}
