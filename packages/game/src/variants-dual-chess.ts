// Dual Chess (中西象棋) — pure rules + fog kernel.
//
// A 6x8 chess x xiangqi fusion. Like the Mini Xiangqi module, this stays
// deliberately PARALLEL to the chess Variant interface and the xiangqi spikes:
// it owns its own color / coord / piece / move / view types. Forcing a 6x8
// board with cannons, horses and soldiers through the 8x8 chess shape (or the
// xiangqi shape) would hide rules and privacy boundaries. The only thing shared
// with the rest of packages/game is `AbortReason`.
//
// Two referees share one pseudo-legal move generator:
//   - DARK mode (king-capture): check is unenforceable under fog, so the win is
//     capturing the King, plus the racing "Try". See applyDualChessMove.
//   - PERFECT-INFORMATION mode (checkmate): real chess legality (you may not
//     leave your own King attacked); the win is checkmate or a safe Try; a side
//     with no legal move loses (stalemate is a loss). See applyDualChessOpenMove.
// Both are cross-checked against Fairy-Stockfish self-play in the replay test.
// See docs-private/dual-chess-track.md.
//
// Pieces: King, Queen (promoted pawn only), Bishop, Knight (free leaper), Pawn
// (chess) + Chariot (=rook), Cannon (screen-capture), Horse (blockable leaper),
// Soldier (forward-only, gains sideways after the river) (xiangqi).

import type { AbortReason } from './types.js';

export type DualChessColor = 'white' | 'red';

export type DualChessPieceRole =
  | 'king'
  | 'queen'
  | 'bishop'
  | 'knight'
  | 'pawn'
  | 'chariot'
  | 'cannon'
  | 'horse'
  | 'soldier';

export type DualChessPiece = {
  color: DualChessColor;
  role: DualChessPieceRole;
};

export type DualChessCoord = { file: number; rank: number };

// 6 files (a..f) x 8 ranks (1..8) = 48 squares.
export type DualChessFile = 'a' | 'b' | 'c' | 'd' | 'e' | 'f';
export type DualChessRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type DualChessSquare = `${DualChessFile}${DualChessRank}`;

export type DualChessBoard = Partial<Record<DualChessSquare, DualChessPiece>>;

export type DualChessMove = {
  from: DualChessSquare;
  to: DualChessSquare;
  // Only a Queen promotion exists in this variant (pawns cannot underpromote).
  promotion?: 'queen';
};

export type DualChessVisibleBoardEntry =
  | { piece: DualChessPiece; shrouded: false }
  | { color: DualChessColor; shrouded: true };

export type DualChessPlayerBoard = Partial<Record<DualChessSquare, DualChessVisibleBoardEntry>>;

export type DualChessGameEndReason =
  | 'king-captured' // dark mode: the King is captured (check is unenforceable)
  | 'checkmate' // perfect-info mode: the King is attacked with no legal reply
  | 'race'
  | 'stalemate'
  | 'repetition'
  | 'progress-clock'
  | 'timeout'
  | 'resignation'
  | 'abandonment';

export type DualChessGameStatus =
  | { type: 'playing'; turn: DualChessColor }
  | { type: 'finished'; winner: DualChessColor | null; reason: DualChessGameEndReason }
  | { type: 'aborted'; reason: AbortReason };

export type DualChessGameState = {
  id: string;
  board: DualChessBoard;
  status: DualChessGameStatus;
  moveNumber: number;
  progressClock: number;
  lastMove?: DualChessMove;
  positionCounts: Record<string, number>;
};

export type DualChessPlayerView = {
  id: string;
  perspective: DualChessColor;
  board: DualChessPlayerBoard;
  visibleSquares: DualChessSquare[];
  legalMoves: DualChessMove[];
  status: DualChessGameStatus;
  moveNumber: number;
  lastMove?: DualChessMove;
};

type VisionAccum = {
  directlyVisible: Set<DualChessSquare>;
  shroudedBlockers: Set<DualChessSquare>;
  cannonScreens: Set<DualChessSquare>;
  cannonTargets: Set<DualChessSquare>;
  cannonPath: Set<DualChessSquare>;
};

const FILE_CHARS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const FILE_COUNT = 6;
const RANK_COUNT = 8;
const DEFAULT_PROGRESS_CLOCK_LIMIT = 100;

const ROLE_REPETITION_CODES: Record<DualChessPieceRole, string> = {
  king: 'k',
  queen: 'q',
  bishop: 'b',
  knight: 'n',
  pawn: 'p',
  chariot: 'v',
  cannon: 'c',
  horse: 'h',
  soldier: 'o',
};

const ORTHOGONAL: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAGONAL: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const ALL_DIRECTIONS: readonly (readonly [number, number])[] = [...ORTHOGONAL, ...DIAGONAL];

// [df, dr] for the eight L-jumps shared by Knight (unblockable) and Horse.
const KNIGHT_JUMPS: readonly (readonly [number, number])[] = [
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
];

// [df, dr, legDf, legDr] — the Horse's leg is the orthogonal square it steps
// through toward the leap; if occupied, that leap is blocked.
const HORSE_JUMPS: readonly (readonly [number, number, number, number])[] = [
  [1, 2, 0, 1],
  [1, -2, 0, -1],
  [-1, 2, 0, 1],
  [-1, -2, 0, -1],
  [2, 1, 1, 0],
  [2, -1, 1, 0],
  [-2, 1, -1, 0],
  [-2, -1, -1, 0],
];

export type DualChessApplyMoveOptions = {
  progressClockLimit?: number;
};

// ── Coordinate helpers ──────────────────────────────────────────────────────

export function dualChessSquareOf(file: number, rank: number): DualChessSquare {
  if (!dualChessInBounds(file, rank)) {
    throw new RangeError(`dual chess coord out of range: file=${file} rank=${rank}`);
  }
  return `${FILE_CHARS[file]}${rank as DualChessRank}` as DualChessSquare;
}

export function dualChessCoordOf(square: DualChessSquare): DualChessCoord {
  const file = FILE_CHARS.indexOf(square[0] as (typeof FILE_CHARS)[number]);
  const rank = Number(square.slice(1));
  if (file < 0 || !Number.isInteger(rank) || rank < 1 || rank > RANK_COUNT) {
    throw new RangeError(`invalid dual chess square: ${square}`);
  }
  return { file, rank };
}

export function dualChessInBounds(file: number, rank: number): boolean {
  return file >= 0 && file < FILE_COUNT && rank >= 1 && rank <= RANK_COUNT;
}

function dualChessIsOccupied(board: DualChessBoard, file: number, rank: number): boolean {
  return dualChessInBounds(file, rank) && board[dualChessSquareOf(file, rank)] !== undefined;
}

function rankOf(square: DualChessSquare): number {
  return dualChessCoordOf(square).rank;
}

export function oppositeDualChessColor(color: DualChessColor): DualChessColor {
  return color === 'white' ? 'red' : 'white';
}

// White advances toward rank 8, Red toward rank 1.
function forwardDir(color: DualChessColor): number {
  return color === 'white' ? 1 : -1;
}

function pawnStartRank(color: DualChessColor): number {
  return color === 'white' ? 2 : 7;
}

// Pawns promote (to Queen, mandatory) and the King "Tries" (races) on this rank.
function farRank(color: DualChessColor): number {
  return color === 'white' ? RANK_COUNT : 1;
}

// The river runs between ranks 4 and 5. A Soldier gains sideways movement once it
// has crossed into the enemy half.
function soldierCrossedRiver(color: DualChessColor, rank: number): boolean {
  return color === 'white' ? rank >= 5 : rank <= 4;
}

// ── Initial state ───────────────────────────────────────────────────────────

// FEN bknhcv/pppooo/6/6/6/6/OOOPPP/VCHNKB w - - 0 1 (uppercase = White).
export function createInitialDualChessBoard(): DualChessBoard {
  const board: DualChessBoard = {};
  const whiteBack: DualChessPieceRole[] = [
    'chariot',
    'cannon',
    'horse',
    'knight',
    'king',
    'bishop',
  ];
  const whiteFront: DualChessPieceRole[] = [
    'soldier',
    'soldier',
    'soldier',
    'pawn',
    'pawn',
    'pawn',
  ];
  for (let f = 0; f < FILE_COUNT; f += 1) {
    board[dualChessSquareOf(f, 1)] = { color: 'white', role: whiteBack[f] };
    board[dualChessSquareOf(f, 2)] = { color: 'white', role: whiteFront[f] };
    // Red is the 180-degree rotation of White.
    board[dualChessSquareOf(FILE_COUNT - 1 - f, 8)] = { color: 'red', role: whiteBack[f] };
    board[dualChessSquareOf(FILE_COUNT - 1 - f, 7)] = { color: 'red', role: whiteFront[f] };
  }
  return board;
}

export function createInitialDualChessState(gameId: string): DualChessGameState {
  const base: DualChessGameState = {
    id: gameId,
    board: createInitialDualChessBoard(),
    status: { type: 'playing', turn: 'white' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  return {
    ...base,
    positionCounts: { [dualChessPositionRepetitionKey(base)]: 1 },
  };
}

// ── Move generation ─────────────────────────────────────────────────────────

export function getDualChessLegalMoves(state: DualChessGameState): DualChessMove[] {
  if (state.status.type !== 'playing') return [];
  const moves: DualChessMove[] = [];
  for (const [sq, piece] of Object.entries(state.board)) {
    if (!piece || piece.color !== state.status.turn) continue;
    moves.push(...getDualChessLegalMovesFrom(state, sq as DualChessSquare));
  }
  return moves;
}

export function getDualChessLegalMovesFrom(
  state: DualChessGameState,
  from: DualChessSquare,
): DualChessMove[] {
  if (state.status.type !== 'playing') return [];
  const piece = state.board[from];
  if (!piece || piece.color !== state.status.turn) return [];
  return pseudoLegalMovesFrom(state.board, from, piece);
}

function pseudoLegalMovesFrom(
  board: DualChessBoard,
  from: DualChessSquare,
  piece: DualChessPiece,
): DualChessMove[] {
  const { file, rank } = dualChessCoordOf(from);
  const moves: DualChessMove[] = [];
  const addStep = (f: number, r: number): void => {
    if (!dualChessInBounds(f, r)) return;
    const to = dualChessSquareOf(f, r);
    if (board[to]?.color === piece.color) return;
    moves.push({ from, to });
  };

  switch (piece.role) {
    case 'king':
      for (const [df, dr] of ALL_DIRECTIONS) addStep(file + df, rank + dr);
      break;
    case 'knight':
      for (const [df, dr] of KNIGHT_JUMPS) addStep(file + df, rank + dr);
      break;
    case 'horse':
      for (const [df, dr, legDf, legDr] of HORSE_JUMPS) {
        if (dualChessIsOccupied(board, file + legDf, rank + legDr)) continue;
        addStep(file + df, rank + dr);
      }
      break;
    case 'bishop':
      slideMovesInto(moves, board, from, piece.color, file, rank, DIAGONAL);
      break;
    case 'chariot':
      slideMovesInto(moves, board, from, piece.color, file, rank, ORTHOGONAL);
      break;
    case 'queen':
      slideMovesInto(moves, board, from, piece.color, file, rank, ALL_DIRECTIONS);
      break;
    case 'cannon':
      cannonMovesInto(moves, board, from, piece.color, file, rank);
      break;
    case 'pawn':
      pawnMovesInto(moves, board, from, piece.color, file, rank);
      break;
    case 'soldier':
      soldierMovesInto(addStep, piece.color, file, rank);
      break;
  }
  return moves;
}

function slideMovesInto(
  moves: DualChessMove[],
  board: DualChessBoard,
  from: DualChessSquare,
  color: DualChessColor,
  file: number,
  rank: number,
  directions: readonly (readonly [number, number])[],
): void {
  for (const [df, dr] of directions) {
    let f = file + df;
    let r = rank + dr;
    while (dualChessInBounds(f, r)) {
      const to = dualChessSquareOf(f, r);
      const target = board[to];
      if (!target) {
        moves.push({ from, to });
      } else {
        if (target.color !== color) moves.push({ from, to });
        break;
      }
      f += df;
      r += dr;
    }
  }
}

// Cannon moves like a Chariot over empties, but captures by jumping exactly one
// screen (any color) and landing on the enemy beyond it.
function cannonMovesInto(
  moves: DualChessMove[],
  board: DualChessBoard,
  from: DualChessSquare,
  color: DualChessColor,
  file: number,
  rank: number,
): void {
  for (const [df, dr] of ORTHOGONAL) {
    let f = file + df;
    let r = rank + dr;
    while (dualChessInBounds(f, r) && !dualChessIsOccupied(board, f, r)) {
      moves.push({ from, to: dualChessSquareOf(f, r) });
      f += df;
      r += dr;
    }
    if (!dualChessInBounds(f, r)) continue;
    // f,r is the screen. Skip past it and look for the first piece beyond.
    f += df;
    r += dr;
    while (dualChessInBounds(f, r) && !dualChessIsOccupied(board, f, r)) {
      f += df;
      r += dr;
    }
    if (!dualChessInBounds(f, r)) continue;
    const to = dualChessSquareOf(f, r);
    if (board[to]?.color !== color) moves.push({ from, to });
  }
}

function pawnMovesInto(
  moves: DualChessMove[],
  board: DualChessBoard,
  from: DualChessSquare,
  color: DualChessColor,
  file: number,
  rank: number,
): void {
  const dir = forwardDir(color);
  const promote = rank + dir === farRank(color);
  const push = (to: DualChessSquare): void => {
    if (promote) moves.push({ from, to, promotion: 'queen' });
    else moves.push({ from, to });
  };

  // Forward push (and double-step from the start rank), only into empty squares.
  if (dualChessInBounds(file, rank + dir) && !dualChessIsOccupied(board, file, rank + dir)) {
    push(dualChessSquareOf(file, rank + dir));
    if (rank === pawnStartRank(color) && !dualChessIsOccupied(board, file, rank + dir * 2)) {
      moves.push({ from, to: dualChessSquareOf(file, rank + dir * 2) });
    }
  }

  // Diagonal captures (no en passant in this variant).
  for (const df of [-1, 1]) {
    const f = file + df;
    const r = rank + dir;
    if (!dualChessInBounds(f, r)) continue;
    const target = board[dualChessSquareOf(f, r)];
    if (target && target.color !== color) push(dualChessSquareOf(f, r));
  }
}

function soldierMovesInto(
  addStep: (f: number, r: number) => void,
  color: DualChessColor,
  file: number,
  rank: number,
): void {
  addStep(file, rank + forwardDir(color));
  if (soldierCrossedRiver(color, rank)) {
    addStep(file - 1, rank);
    addStep(file + 1, rank);
  }
}

export function isDualChessLegalMove(state: DualChessGameState, move: DualChessMove): boolean {
  return getDualChessLegalMovesFrom(state, move.from).some((m) => m.to === move.to);
}

// ── Apply move ──────────────────────────────────────────────────────────────

export function applyDualChessMove(
  state: DualChessGameState,
  move: DualChessMove,
  opts: DualChessApplyMoveOptions = {},
): DualChessGameState {
  if (state.status.type !== 'playing') return state;
  if (!isDualChessLegalMove(state, move)) return state;

  const placement = placeDualChessMoveOnBoard(state.board, move);
  if (!placement) return state;
  const { board: newBoard, moved: movingPiece, captured: capturedPiece } = placement;
  const nextTurn = oppositeDualChessColor(state.status.turn);

  // Soldiers and Pawns are irreversible; a capture resets the no-progress clock.
  const wasCapture = capturedPiece !== undefined;
  const isProgressMove =
    wasCapture || movingPiece.role === 'pawn' || movingPiece.role === 'soldier';
  const newProgressClock = isProgressMove ? 0 : state.progressClock + 1;
  const newMoveNumber = state.status.turn === 'red' ? state.moveNumber + 1 : state.moveNumber;

  const nextStateForKey: DualChessGameState = {
    ...state,
    board: newBoard,
    status: { type: 'playing', turn: nextTurn },
    moveNumber: newMoveNumber,
    progressClock: newProgressClock,
    lastMove: move,
  };
  const repKey = dualChessPositionRepetitionKey(nextStateForKey);
  const newPositionCounts = { ...state.positionCounts };
  newPositionCounts[repKey] = (newPositionCounts[repKey] ?? 0) + 1;

  let nextStatus: DualChessGameStatus = { type: 'playing', turn: nextTurn };
  if (capturedPiece?.role === 'king') {
    // King capture: the dark-mode win (check is unenforceable under fog).
    nextStatus = { type: 'finished', winner: movingPiece.color, reason: 'king-captured' };
  } else if (movingPiece.role === 'king' && rankOf(move.to) === farRank(movingPiece.color)) {
    // The Race ("Try"): the King reaches the enemy far rank. Under fog this is
    // the "unsafe" reading (reaching wins even if a hidden enemy attacks it).
    nextStatus = { type: 'finished', winner: movingPiece.color, reason: 'race' };
  } else if (!hasDualChessLegalMove(newBoard, nextTurn)) {
    // Stalemate is a LOSS for the side with no legal move (anti-draw design).
    nextStatus = { type: 'finished', winner: movingPiece.color, reason: 'stalemate' };
  } else if ((newPositionCounts[repKey] ?? 0) >= 3) {
    // Threefold repetition is a LOSS (anti-draw). The mover completed the
    // repetition, so the opponent (next to move) is awarded the win.
    // TODO(phase-d): confirm the winning side against Fairy-Stockfish
    // `nFoldValue=loss` semantics used in the meerkat balance sweeps.
    nextStatus = { type: 'finished', winner: nextTurn, reason: 'repetition' };
  } else if (newProgressClock >= (opts.progressClockLimit ?? DEFAULT_PROGRESS_CLOCK_LIMIT)) {
    // The only real draw: 50-move-style no-progress rule.
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

export function dualChessPositionRepetitionKey(state: DualChessGameState): string {
  const turn = state.status.type === 'playing' ? state.status.turn : '-';
  const board = Object.entries(state.board)
    .filter(([, piece]) => piece)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sq, p]) => `${sq}${p!.color[0]}${ROLE_REPETITION_CODES[p!.role]}`)
    .join(',');
  return `${turn}|${board}`;
}

function hasDualChessLegalMove(board: DualChessBoard, color: DualChessColor): boolean {
  for (const [sq, piece] of Object.entries(board)) {
    if (!piece || piece.color !== color) continue;
    if (pseudoLegalMovesFrom(board, sq as DualChessSquare, piece).length > 0) return true;
  }
  return false;
}

type PlacedMove = {
  board: DualChessBoard;
  moved: DualChessPiece;
  captured: DualChessPiece | undefined;
};

// Apply a move to a board (with mandatory Queen promotion derived from the
// destination rank) without any terminal/turn logic. Shared by both referees.
function placeDualChessMoveOnBoard(board: DualChessBoard, move: DualChessMove): PlacedMove | null {
  const moved = board[move.from];
  if (!moved) return null;
  const captured = board[move.to];
  const becomesQueen = moved.role === 'pawn' && rankOf(move.to) === farRank(moved.color);
  const placed: DualChessPiece = becomesQueen ? { color: moved.color, role: 'queen' } : moved;
  const next: DualChessBoard = { ...board };
  delete next[move.from];
  next[move.to] = placed;
  return { board: next, moved, captured };
}

// ── Perfect-information referee ─────────────────────────────────────────────
//
// The perfect-information ("open") mode keeps real chess legality: you may not
// leave your own King attacked, the win is checkmate (King attacked with no
// legal reply) or the Race, and a side with no legal move loses (stalemate is a
// loss, not a draw, by design). The Race here is the "safe Try": a legal King
// move can never end on an attacked square, so reaching the far rank legally
// wins. This layer reuses the shared pseudo-legal generator; the dark referee
// (king-capture, above) is unchanged.

function findDualChessKing(board: DualChessBoard, color: DualChessColor): DualChessSquare | null {
  for (const [sq, piece] of Object.entries(board)) {
    if (piece && piece.color === color && piece.role === 'king') return sq as DualChessSquare;
  }
  return null;
}

// Is `color`'s King attacked? An enemy attacks the King's square iff one of its
// pseudo-legal moves can capture onto it (this naturally covers Cannon
// screen-captures, blockable-Horse legs and Pawn diagonals).
export function isDualChessKingAttacked(board: DualChessBoard, color: DualChessColor): boolean {
  const kingSquare = findDualChessKing(board, color);
  if (!kingSquare) return false;
  for (const [sq, piece] of Object.entries(board)) {
    if (!piece || piece.color === color) continue;
    if (
      pseudoLegalMovesFrom(board, sq as DualChessSquare, piece).some((m) => m.to === kingSquare)
    ) {
      return true;
    }
  }
  return false;
}

function moveLeavesOwnKingAttacked(
  board: DualChessBoard,
  move: DualChessMove,
  color: DualChessColor,
): boolean {
  const placement = placeDualChessMoveOnBoard(board, move);
  if (!placement) return false;
  return isDualChessKingAttacked(placement.board, color);
}

export function getDualChessOpenLegalMovesFrom(
  state: DualChessGameState,
  from: DualChessSquare,
): DualChessMove[] {
  if (state.status.type !== 'playing') return [];
  const piece = state.board[from];
  if (!piece || piece.color !== state.status.turn) return [];
  return pseudoLegalMovesFrom(state.board, from, piece).filter(
    (move) => !moveLeavesOwnKingAttacked(state.board, move, piece.color),
  );
}

export function getDualChessOpenLegalMoves(state: DualChessGameState): DualChessMove[] {
  if (state.status.type !== 'playing') return [];
  const moves: DualChessMove[] = [];
  for (const [sq, piece] of Object.entries(state.board)) {
    if (!piece || piece.color !== state.status.turn) continue;
    moves.push(...getDualChessOpenLegalMovesFrom(state, sq as DualChessSquare));
  }
  return moves;
}

export function isDualChessOpenLegalMove(state: DualChessGameState, move: DualChessMove): boolean {
  return getDualChessOpenLegalMovesFrom(state, move.from).some((m) => m.to === move.to);
}

function hasDualChessOpenLegalMove(board: DualChessBoard, color: DualChessColor): boolean {
  const probe: DualChessGameState = {
    id: 'probe',
    board,
    status: { type: 'playing', turn: color },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  for (const [sq, piece] of Object.entries(board)) {
    if (!piece || piece.color !== color) continue;
    if (getDualChessOpenLegalMovesFrom(probe, sq as DualChessSquare).length > 0) return true;
  }
  return false;
}

export function applyDualChessOpenMove(
  state: DualChessGameState,
  move: DualChessMove,
  opts: DualChessApplyMoveOptions = {},
): DualChessGameState {
  if (state.status.type !== 'playing') return state;
  if (!isDualChessOpenLegalMove(state, move)) return state;

  const placement = placeDualChessMoveOnBoard(state.board, move);
  if (!placement) return state;
  const { board: newBoard, moved, captured } = placement;
  const nextTurn = oppositeDualChessColor(state.status.turn);

  const isProgressMove =
    captured !== undefined || moved.role === 'pawn' || moved.role === 'soldier';
  const newProgressClock = isProgressMove ? 0 : state.progressClock + 1;
  const newMoveNumber = state.status.turn === 'red' ? state.moveNumber + 1 : state.moveNumber;

  const nextStateForKey: DualChessGameState = {
    ...state,
    board: newBoard,
    status: { type: 'playing', turn: nextTurn },
    moveNumber: newMoveNumber,
    progressClock: newProgressClock,
    lastMove: move,
  };
  const repKey = dualChessPositionRepetitionKey(nextStateForKey);
  const newPositionCounts = { ...state.positionCounts };
  newPositionCounts[repKey] = (newPositionCounts[repKey] ?? 0) + 1;

  let nextStatus: DualChessGameStatus = { type: 'playing', turn: nextTurn };
  if (moved.role === 'king' && rankOf(move.to) === farRank(moved.color)) {
    nextStatus = { type: 'finished', winner: moved.color, reason: 'race' };
  } else if (!hasDualChessOpenLegalMove(newBoard, nextTurn)) {
    const reason = isDualChessKingAttacked(newBoard, nextTurn) ? 'checkmate' : 'stalemate';
    nextStatus = { type: 'finished', winner: moved.color, reason };
  } else if ((newPositionCounts[repKey] ?? 0) >= 3) {
    nextStatus = { type: 'finished', winner: nextTurn, reason: 'repetition' };
  } else if (newProgressClock >= (opts.progressClockLimit ?? DEFAULT_PROGRESS_CLOCK_LIMIT)) {
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

// ── Fog visibility ──────────────────────────────────────────────────────────
//
// Vision is "field of fire" (feedback_fow_vision_field_of_fire): a pure function
// of piece placement, defined even for finished states so post-game replay does
// not collapse the loser's view. Chess pieces resolve entirely into
// `directlyVisible`; only the Cannon (screens/targets) and Horse (blocked leg)
// produce shrouded silhouettes, exactly as in Mini Xiangqi.

export function computeDualChessVision(
  state: DualChessGameState,
  color: DualChessColor,
): VisionAccum {
  const accum = emptyVision();
  for (const [sq, piece] of Object.entries(state.board)) {
    if (!piece || piece.color !== color) continue;
    const square = sq as DualChessSquare;
    accum.directlyVisible.add(square);
    const { file, rank } = dualChessCoordOf(square);
    switch (piece.role) {
      case 'king':
        for (const [df, dr] of ALL_DIRECTIONS)
          addIfOnBoard(accum.directlyVisible, file + df, rank + dr);
        break;
      case 'knight':
        for (const [df, dr] of KNIGHT_JUMPS)
          addIfOnBoard(accum.directlyVisible, file + df, rank + dr);
        break;
      case 'horse':
        horseVisionInto(accum, state.board, file, rank);
        break;
      case 'bishop':
        slideVisionInto(accum.directlyVisible, state.board, file, rank, DIAGONAL);
        break;
      case 'chariot':
        slideVisionInto(accum.directlyVisible, state.board, file, rank, ORTHOGONAL);
        break;
      case 'queen':
        slideVisionInto(accum.directlyVisible, state.board, file, rank, ALL_DIRECTIONS);
        break;
      case 'cannon':
        cannonVisionInto(accum, state.board, color, file, rank);
        break;
      case 'pawn':
        pawnVisionInto(accum.directlyVisible, state.board, color, file, rank);
        break;
      case 'soldier':
        soldierVisionInto(accum.directlyVisible, color, file, rank);
        break;
    }
  }
  return accum;
}

export function getDualChessVisibleSquares(
  state: DualChessGameState,
  color: DualChessColor,
): DualChessSquare[] {
  const vision = computeDualChessVision(state, color);
  return [
    ...new Set<DualChessSquare>([
      ...vision.directlyVisible,
      ...vision.shroudedBlockers,
      ...vision.cannonScreens,
      ...vision.cannonTargets,
    ]),
  ].sort();
}

export function getDualChessPlayerView(
  state: DualChessGameState,
  color: DualChessColor,
): DualChessPlayerView {
  const vision = computeDualChessVision(state, color);
  const board: DualChessPlayerBoard = {};

  for (const sq of vision.directlyVisible) {
    const piece = state.board[sq];
    if (piece) mergePlayerBoardEntry(board, sq, { piece, shrouded: false });
  }
  for (const sq of vision.shroudedBlockers) {
    const piece = state.board[sq];
    if (piece) mergePlayerBoardEntry(board, sq, { color: piece.color, shrouded: true });
  }
  for (const sq of vision.cannonScreens) {
    const piece = state.board[sq];
    if (piece) mergePlayerBoardEntry(board, sq, { color: piece.color, shrouded: true });
  }
  for (const sq of vision.cannonTargets) {
    const piece = state.board[sq];
    if (piece) mergePlayerBoardEntry(board, sq, { piece, shrouded: false });
  }

  const legalMoves =
    state.status.type === 'playing' && state.status.turn === color
      ? getDualChessLegalMoves(state)
      : [];

  return {
    id: state.id,
    perspective: color,
    board,
    visibleSquares: getDualChessVisibleSquares(state, color),
    legalMoves,
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

// Perfect-information view: the whole board is visible to both players.
export function getDualChessOpenView(
  state: DualChessGameState,
  color: DualChessColor,
): DualChessPlayerView {
  const board: DualChessPlayerBoard = {};
  const visibleSquares: DualChessSquare[] = [];
  for (const [sq, piece] of Object.entries(state.board)) {
    if (!piece) continue;
    board[sq as DualChessSquare] = { piece, shrouded: false };
    visibleSquares.push(sq as DualChessSquare);
  }
  // Perfect-information legality: self-check-filtered moves (you may not leave
  // your own King attacked).
  const legalMoves =
    state.status.type === 'playing' && state.status.turn === color
      ? getDualChessOpenLegalMoves(state)
      : [];
  return {
    id: state.id,
    perspective: color,
    board,
    visibleSquares: visibleSquares.sort(),
    legalMoves,
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

// ── Per-piece vision ────────────────────────────────────────────────────────

function slideVisionInto(
  set: Set<DualChessSquare>,
  board: DualChessBoard,
  file: number,
  rank: number,
  directions: readonly (readonly [number, number])[],
): void {
  for (const [df, dr] of directions) {
    let f = file + df;
    let r = rank + dr;
    while (dualChessInBounds(f, r)) {
      set.add(dualChessSquareOf(f, r));
      if (dualChessIsOccupied(board, f, r)) break;
      f += df;
      r += dr;
    }
  }
}

function horseVisionInto(
  accum: VisionAccum,
  board: DualChessBoard,
  file: number,
  rank: number,
): void {
  for (const [df, dr, legDf, legDr] of HORSE_JUMPS) {
    const legF = file + legDf;
    const legR = rank + legDr;
    const destF = file + df;
    const destR = rank + dr;
    if (!dualChessInBounds(destF, destR) || !dualChessInBounds(legF, legR)) continue;
    if (dualChessIsOccupied(board, legF, legR)) {
      accum.shroudedBlockers.add(dualChessSquareOf(legF, legR));
    } else {
      accum.directlyVisible.add(dualChessSquareOf(destF, destR));
    }
  }
}

function cannonVisionInto(
  accum: VisionAccum,
  board: DualChessBoard,
  color: DualChessColor,
  file: number,
  rank: number,
): void {
  for (const [df, dr] of ORTHOGONAL) {
    let f = file + df;
    let r = rank + dr;
    while (dualChessInBounds(f, r) && !dualChessIsOccupied(board, f, r)) {
      accum.directlyVisible.add(dualChessSquareOf(f, r));
      f += df;
      r += dr;
    }
    if (!dualChessInBounds(f, r)) continue;
    accum.cannonScreens.add(dualChessSquareOf(f, r));
    f += df;
    r += dr;

    const candidates: DualChessSquare[] = [];
    while (dualChessInBounds(f, r) && !dualChessIsOccupied(board, f, r)) {
      candidates.push(dualChessSquareOf(f, r));
      f += df;
      r += dr;
    }
    if (!dualChessInBounds(f, r)) continue;
    const targetSq = dualChessSquareOf(f, r);
    const target = board[targetSq];
    if (!target || target.color === color) continue;
    for (const sq of candidates) accum.cannonPath.add(sq);
    accum.cannonTargets.add(targetSq);
  }
}

function pawnVisionInto(
  set: Set<DualChessSquare>,
  board: DualChessBoard,
  color: DualChessColor,
  file: number,
  rank: number,
): void {
  const dir = forwardDir(color);
  // Forward push is revealed only into empty squares (matches dark-chess: a pawn
  // does not "see" a piece blocking it head-on, only enemies it can capture).
  if (dualChessInBounds(file, rank + dir) && !dualChessIsOccupied(board, file, rank + dir)) {
    set.add(dualChessSquareOf(file, rank + dir));
    if (rank === pawnStartRank(color) && !dualChessIsOccupied(board, file, rank + dir * 2)) {
      set.add(dualChessSquareOf(file, rank + dir * 2));
    }
  }
  for (const df of [-1, 1]) {
    const f = file + df;
    const r = rank + dir;
    if (!dualChessInBounds(f, r)) continue;
    const target = board[dualChessSquareOf(f, r)];
    if (target && target.color !== color) set.add(dualChessSquareOf(f, r));
  }
}

function soldierVisionInto(
  set: Set<DualChessSquare>,
  color: DualChessColor,
  file: number,
  rank: number,
): void {
  addIfOnBoard(set, file, rank + forwardDir(color));
  if (soldierCrossedRiver(color, rank)) {
    addIfOnBoard(set, file - 1, rank);
    addIfOnBoard(set, file + 1, rank);
  }
}

// ── Small helpers ───────────────────────────────────────────────────────────

function emptyVision(): VisionAccum {
  return {
    directlyVisible: new Set(),
    shroudedBlockers: new Set(),
    cannonScreens: new Set(),
    cannonTargets: new Set(),
    cannonPath: new Set(),
  };
}

function mergePlayerBoardEntry(
  board: DualChessPlayerBoard,
  square: DualChessSquare,
  entry: DualChessVisibleBoardEntry,
): void {
  const existing = board[square];
  if (!existing || (existing.shrouded && !entry.shrouded)) {
    board[square] = entry;
  }
}

function addIfOnBoard(set: Set<DualChessSquare>, file: number, rank: number): void {
  if (dualChessInBounds(file, rank)) set.add(dualChessSquareOf(file, rank));
}
