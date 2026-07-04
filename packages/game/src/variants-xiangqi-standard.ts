// Standard (open-information) Xiangqi — the 9x10 rules engine for ordinary
// Chinese chess. This is the open-info sibling of the Fog-of-War kernel in
// variants-xiangqi.ts and shares its types, coordinate system, initial state,
// and repetition digest.
//
// The critical difference from the FoW kernel: standard play is CHECK-AWARE.
// A move that leaves your own general in check is illegal, generals may not
// face each other across an empty file (flying-general), and the game ends on
// checkmate/stalemate rather than on a literal general capture. We therefore
// drive move generation through elephantops's CHECKED API (`Xiangqi.fromSetup`
// + `position.dests`), NOT the FoW kernel's `setupUnchecked` + `pseudoDests`
// path (which deliberately ignores check — see variants-xiangqi.ts L269-276).
//
// Terminal semantics (xiangqi, not chess):
//   - checkmate  → the side that delivered mate WINS.
//   - stalemate  → the side with NO legal move LOSES (opposite of chess). This
//     is exactly how elephantops's outcome()/isStalemate() score it: both
//     checkmate and stalemate return { winner: opposite(sideToMove) }.
//   - 3-fold repetition / no-progress clock → draw.

import type { Square as EoSquare } from 'elephantops';
import { makeSquare as eoMakeSquare, parseSquare as eoParseSquare } from 'elephantops/util';
import { Xiangqi as EoXiangqi } from 'elephantops/xiangqi';
import {
  boardToEoBoard,
  eoToRole,
  positionRepetitionKey,
  type XiangqiBoard,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiGameStatus,
  type XiangqiMove,
  type XiangqiSquare,
} from './variants-xiangqi.js';

// Standard xiangqi shares the whole kernel type surface, including the initial
// state: reuse `createInitialXiangqiState` from variants-xiangqi.ts directly
// (the opening position is identical to the FoW kernel's).

// Plies since the last capture. Matches the FoW kernel's convention.
const DEFAULT_STANDARD_PROGRESS_CLOCK_LIMIT = 60;

export type StandardXiangqiApplyMoveOptions = {
  progressClockLimit?: number;
};

// Open-information player view. Both players see the full truth board; the
// legal-move list is populated only for the side to move.
export type StandardXiangqiPlayerView = {
  id: string;
  perspective: XiangqiColor;
  board: XiangqiBoard;
  legalMoves: XiangqiMove[];
  status: XiangqiGameStatus;
  moveNumber: number;
  lastMove?: XiangqiMove;
};

// ── elephantops boundary (CHECKED path) ─────────────────────────────────────

// Lift a playing state into a validated elephantops Xiangqi position. Unlike
// the FoW kernel we go through `fromSetup`, which enforces the flying-general
// rule and rejects self-check setups. An invalid setup here is a programming
// error (the server only ever holds legal positions), so we throw.
function positionFromStandardState(state: XiangqiGameState): EoXiangqi {
  if (state.status.type !== 'playing') {
    throw new Error('positionFromStandardState requires a playing state');
  }
  const setup = {
    board: boardToEoBoard(state.board),
    turn: state.status.turn,
    halfmoves: state.progressClock,
    fullmoves: state.moveNumber,
  };
  // Result.unwrap() returns the position or throws the PositionError.
  return EoXiangqi.fromSetup(setup).unwrap();
}

// ── Legal move generation (check-filtered) ──────────────────────────────────

export function getStandardXiangqiLegalMoves(state: XiangqiGameState): XiangqiMove[] {
  if (state.status.type !== 'playing') return [];
  const position = positionFromStandardState(state);
  const ctx = position.ctx();
  const moves: XiangqiMove[] = [];
  for (const [sqEo, piece] of position.board) {
    if (piece.color !== position.turn) continue;
    const from = eoMakeSquare(sqEo as EoSquare);
    for (const toEo of position.dests(sqEo as EoSquare, ctx)) {
      moves.push({ from, to: eoMakeSquare(toEo) });
    }
  }
  return moves;
}

export function getStandardXiangqiLegalMovesFrom(
  state: XiangqiGameState,
  from: XiangqiSquare,
): XiangqiMove[] {
  if (state.status.type !== 'playing') return [];
  const position = positionFromStandardState(state);
  const fromEo = eoParseSquare(from);
  if (fromEo === undefined) return [];
  const piece = position.board.get(fromEo);
  if (!piece || piece.color !== state.status.turn) return [];
  const moves: XiangqiMove[] = [];
  for (const toEo of position.dests(fromEo)) {
    moves.push({ from, to: eoMakeSquare(toEo) });
  }
  return moves;
}

export function isStandardXiangqiLegalMove(state: XiangqiGameState, move: XiangqiMove): boolean {
  if (state.status.type !== 'playing') return false;
  const position = positionFromStandardState(state);
  const fromEo = eoParseSquare(move.from);
  const toEo = eoParseSquare(move.to);
  if (fromEo === undefined || toEo === undefined) return false;
  const piece = position.board.get(fromEo);
  if (!piece || piece.color !== state.status.turn) return false;
  return position.dests(fromEo).has(toEo);
}

// ── Apply move + terminal detection ─────────────────────────────────────────
// Order: checkmate > stalemate > 3-fold repetition > progress-clock. A literal
// general capture cannot arise under check-filtered legal play (the mover can
// never leave its own general capturable, and the opponent must always resolve
// a check), so there is no 'general-captured' branch here.

export function applyStandardXiangqiMove(
  state: XiangqiGameState,
  move: XiangqiMove,
  opts: StandardXiangqiApplyMoveOptions = {},
): XiangqiGameState {
  if (state.status.type !== 'playing') return state;
  const mover = state.status.turn;

  const position = positionFromStandardState(state);
  const fromEo = eoParseSquare(move.from);
  const toEo = eoParseSquare(move.to);
  if (fromEo === undefined || toEo === undefined) return state;
  const movingPiece = position.board.get(fromEo);
  if (!movingPiece || movingPiece.color !== mover) return state;
  // Reject illegal moves — return state unchanged (kernel convention).
  if (!position.dests(fromEo).has(toEo)) return state;

  // Read capture BEFORE play() mutates the board (drives the progress clock).
  const wasCapture = state.board[move.to] !== undefined;

  position.play({ from: fromEo, to: toEo });

  const newBoard: XiangqiBoard = {};
  for (const [sqEo, piece] of position.board) {
    newBoard[eoMakeSquare(sqEo as EoSquare)] = {
      color: piece.color,
      role: eoToRole(piece.role),
    };
  }
  const nextTurn = position.turn;
  const newMoveNumber = position.fullmoves;
  const newProgressClock = wasCapture ? 0 : state.progressClock + 1;

  // Position-count bookkeeping (3-fold repetition) reuses the kernel digest.
  const nextStateForKey: XiangqiGameState = {
    ...state,
    board: newBoard,
    status: { type: 'playing', turn: nextTurn },
    moveNumber: newMoveNumber,
    progressClock: newProgressClock,
    lastMove: move,
  };
  const repKey = positionRepetitionKey(nextStateForKey);
  const newPositionCounts = { ...state.positionCounts };
  newPositionCounts[repKey] = (newPositionCounts[repKey] ?? 0) + 1;

  const limit = opts.progressClockLimit ?? DEFAULT_STANDARD_PROGRESS_CLOCK_LIMIT;
  const ctx = position.ctx();
  let nextStatus: XiangqiGameStatus = { type: 'playing', turn: nextTurn };
  if (position.isCheckmate(ctx)) {
    // Side to move (nextTurn) is mated → the mover wins.
    nextStatus = { type: 'finished', winner: mover, reason: 'checkmate' };
  } else if (position.isStalemate(ctx)) {
    // Xiangqi: the side with no legal move LOSES → the mover wins.
    nextStatus = { type: 'finished', winner: mover, reason: 'stalemate' };
  } else if ((newPositionCounts[repKey] ?? 0) >= 3) {
    nextStatus = { type: 'finished', winner: null, reason: 'repetition' };
  } else if (newProgressClock >= limit) {
    nextStatus = { type: 'finished', winner: null, reason: 'progress-clock' };
  }

  return {
    ...state,
    board: newBoard,
    status: nextStatus,
    moveNumber: newMoveNumber,
    progressClock: newProgressClock,
    lastMove: move,
    positionCounts: newPositionCounts,
  };
}

// ── Open-information player view ─────────────────────────────────────────────

export function getStandardXiangqiPlayerView(
  state: XiangqiGameState,
  color: XiangqiColor,
): StandardXiangqiPlayerView {
  const legalMoves =
    state.status.type === 'playing' && state.status.turn === color
      ? getStandardXiangqiLegalMoves(state)
      : [];
  return {
    id: state.id,
    perspective: color,
    // Open info: the whole truth board is shared with both players.
    board: { ...state.board },
    legalMoves,
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}
