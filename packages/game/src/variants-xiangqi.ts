// FoW Xiangqi — parallel module, no shared types with chess.
// Wraps the `elephantops` library for rules (chessops-port for xiangqi).
// See docs-private/fog-of-war/library/variants/fow-xiangqi.md for the full design.
//
// Public types use xiangqi vocabulary (general / soldier / etc.) for readability
// in content, UI, and playtest. Translation to elephantops's chess vocabulary
// (king / pawn) happens at the boundary in `eo*` helpers below.
//
// Coordinate system matches elephantops:
//   - 9 files (a..i) × 10 ranks (1..10) — standard xiangqi/WXF notation
//   - Internal numeric square: file + 9 * (rank - 1), range 0..89
//   - Rank 1 = red back rank, rank 10 = black back rank
//   - River sits between ranks 5 and 6

import type { Color as EoColor, Role as EoRole, SquareName as EoSquareName, Square as EoSquare } from 'elephantops';
import { Board as EoBoard } from 'elephantops/board';
import { Xiangqi as EoXiangqi } from 'elephantops/xiangqi';
import { makeSquare as eoMakeSquare, parseSquare as eoParseSquare } from 'elephantops/util';

export type XiangqiColor = EoColor; // 'red' | 'black'

export type XiangqiPieceRole =
  | 'general'
  | 'advisor'
  | 'elephant'
  | 'horse'
  | 'chariot'
  | 'cannon'
  | 'soldier';

export type XiangqiPiece = {
  color: XiangqiColor;
  role: XiangqiPieceRole;
};

// File 0..8, rank 1..10. Stored as plain numbers; constrain via helpers.
export type XiangqiCoord = { file: number; rank: number };

// Algebraic square names, matches elephantops `SquareName`.
export type XiangqiSquare = EoSquareName;

export type XiangqiBoard = Partial<Record<XiangqiSquare, XiangqiPiece>>;

export type XiangqiMove = {
  from: XiangqiSquare;
  to: XiangqiSquare;
};

// Cannon-vision toggle (see docs-private/fog-of-war/library/variants/fow-xiangqi.md §1)
//   A — screen + target both fully revealed
//   B — screen + target both shrouded (occupancy only)
//   C — screen revealed with type, target shrouded
//   D — screen shrouded with ? marker, target revealed (inverse of C —
//       "you see what you can land on, not what enables the line")
export type XiangqiCannonVisionMode = 'A' | 'B' | 'C' | 'D';

export type XiangqiVisibleBoardEntry = {
  piece: XiangqiPiece;
  // true => only "enemy occupancy" should be shown to the perspective player;
  // false => render with full piece type
  shrouded: boolean;
};

export type XiangqiPlayerBoard = Partial<Record<XiangqiSquare, XiangqiVisibleBoardEntry>>;

export type XiangqiPlayerView = {
  id: string;
  perspective: XiangqiColor;
  board: XiangqiPlayerBoard;
  visibleSquares: XiangqiSquare[];
  legalMoves: XiangqiMove[];
  status: XiangqiGameStatus;
  moveNumber: number;
  lastMove?: XiangqiMove;
};

export type XiangqiGameEndReason =
  | 'general-captured'
  | 'stalemate'
  | 'timeout'
  | 'resignation'
  | 'repetition'
  | 'progress-clock';

export type XiangqiGameStatus =
  | { type: 'playing'; turn: XiangqiColor }
  | { type: 'finished'; winner: XiangqiColor | null; reason: XiangqiGameEndReason };

export type XiangqiGameState = {
  id: string;
  board: XiangqiBoard;
  status: XiangqiGameStatus;
  moveNumber: number;
  // Plies since last capture or soldier advance. Powers the progress-clock draw.
  progressClock: number;
  lastMove?: XiangqiMove;
  // True-position repetition counts. Keyed by a canonical position digest.
  positionCounts: Record<string, number>;
};

// ── Role translation ───────────────────────────────────────────────────────
// elephantops uses chess vocabulary; we keep xiangqi names in our types.

const ROLE_TO_EO: Record<XiangqiPieceRole, EoRole> = {
  general: 'king',
  advisor: 'advisor',
  elephant: 'elephant',
  horse: 'horse',
  chariot: 'chariot',
  cannon: 'cannon',
  soldier: 'pawn',
};

const EO_TO_ROLE: Record<EoRole, XiangqiPieceRole> = {
  king: 'general',
  advisor: 'advisor',
  elephant: 'elephant',
  horse: 'horse',
  chariot: 'chariot',
  cannon: 'cannon',
  pawn: 'soldier',
};

export function roleToEo(role: XiangqiPieceRole): EoRole {
  return ROLE_TO_EO[role];
}

export function eoToRole(role: EoRole): XiangqiPieceRole {
  return EO_TO_ROLE[role];
}

// ── Coordinate helpers ─────────────────────────────────────────────────────

const FILE_CHARS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] as const;

export function squareOf(file: number, rank: number): XiangqiSquare {
  if (file < 0 || file > 8 || rank < 1 || rank > 10) {
    throw new RangeError(`xiangqi coord out of range: file=${file} rank=${rank}`);
  }
  return `${FILE_CHARS[file]}${rank}` as XiangqiSquare;
}

export function coordOf(square: XiangqiSquare): XiangqiCoord {
  const file = FILE_CHARS.indexOf(square[0] as (typeof FILE_CHARS)[number]);
  const rank = Number(square.slice(1));
  if (file < 0 || !Number.isInteger(rank) || rank < 1 || rank > 10) {
    throw new RangeError(`invalid xiangqi square: ${square}`);
  }
  return { file, rank };
}

export function inBounds(file: number, rank: number): boolean {
  return file >= 0 && file <= 8 && rank >= 1 && rank <= 10;
}

// Palace = 3×3 box at the back of each side.
//   Red palace: files d..f (3..5), ranks 1..3
//   Black palace: files d..f (3..5), ranks 8..10
export function inPalace(color: XiangqiColor, file: number, rank: number): boolean {
  if (file < 3 || file > 5) return false;
  return color === 'red' ? rank <= 3 : rank >= 8;
}

// "Own half" = side of the river belonging to `color`.
//   Red: ranks 1..5
//   Black: ranks 6..10
export function inOwnHalf(color: XiangqiColor, rank: number): boolean {
  return color === 'red' ? rank <= 5 : rank >= 6;
}

export function hasCrossedRiver(color: XiangqiColor, rank: number): boolean {
  return !inOwnHalf(color, rank);
}

// ── Initial state ──────────────────────────────────────────────────────────

export function createInitialXiangqiBoard(): XiangqiBoard {
  const board: XiangqiBoard = {};
  const backRank: XiangqiPieceRole[] = [
    'chariot', 'horse', 'elephant', 'advisor', 'general', 'advisor', 'elephant', 'horse', 'chariot',
  ];
  for (let f = 0; f < 9; f++) {
    board[squareOf(f, 1)] = { color: 'red', role: backRank[f] };
    board[squareOf(f, 10)] = { color: 'black', role: backRank[f] };
  }
  // Cannons
  board[squareOf(1, 3)] = { color: 'red', role: 'cannon' };
  board[squareOf(7, 3)] = { color: 'red', role: 'cannon' };
  board[squareOf(1, 8)] = { color: 'black', role: 'cannon' };
  board[squareOf(7, 8)] = { color: 'black', role: 'cannon' };
  // Soldiers (a, c, e, g, i files)
  for (const f of [0, 2, 4, 6, 8]) {
    board[squareOf(f, 4)] = { color: 'red', role: 'soldier' };
    board[squareOf(f, 7)] = { color: 'black', role: 'soldier' };
  }
  return board;
}

export function createInitialXiangqiState(gameId: string): XiangqiGameState {
  const base: XiangqiGameState = {
    id: gameId,
    board: createInitialXiangqiBoard(),
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  // Seed the position-count for the starting position so 3-fold detection
  // includes the initial state.
  return {
    ...base,
    positionCounts: { [positionRepetitionKey(base)]: 1 },
  };
}

// ── elephantops boundary ───────────────────────────────────────────────────
// These translate our XiangqiBoard <-> elephantops Board and lift our state
// into an elephantops Xiangqi position so we can reuse its move generator.

function boardToEoBoard(board: XiangqiBoard): EoBoard {
  const eo = EoBoard.empty();
  for (const [sq, piece] of Object.entries(board)) {
    if (!piece) continue;
    const eoSq = eoParseSquare(sq);
    if (eoSq === undefined) throw new Error(`bad square: ${sq}`);
    eo.set(eoSq, { color: piece.color, role: roleToEo(piece.role) });
  }
  return eo;
}

function positionFromState(state: XiangqiGameState): EoXiangqi {
  if (state.status.type !== 'playing') {
    throw new Error('positionFromState requires a playing state');
  }
  const setup = {
    board: boardToEoBoard(state.board),
    turn: state.status.turn,
    halfmoves: state.progressClock,
    fullmoves: state.moveNumber,
  };
  const result = EoXiangqi.fromSetup(setup);
  if (result.isErr) {
    throw new Error(`invalid xiangqi position: ${result.error.message}`);
  }
  return result.unwrap();
}

// ── Move generation ────────────────────────────────────────────────────────

export function getLegalMoves(state: XiangqiGameState): XiangqiMove[] {
  if (state.status.type !== 'playing') return [];
  const position = positionFromState(state);
  const moves: XiangqiMove[] = [];
  for (const [fromEo, dests] of position.allDests()) {
    const from = eoMakeSquare(fromEo as EoSquare);
    for (const toEo of dests) {
      moves.push({ from, to: eoMakeSquare(toEo) });
    }
  }
  return moves;
}

export function getLegalMovesFrom(state: XiangqiGameState, from: XiangqiSquare): XiangqiMove[] {
  if (state.status.type !== 'playing') return [];
  const position = positionFromState(state);
  const fromEo = eoParseSquare(from);
  if (fromEo === undefined) return [];
  const piece = position.board.get(fromEo);
  if (!piece || piece.color !== state.status.turn) return [];
  const dests = position.dests(fromEo);
  const moves: XiangqiMove[] = [];
  for (const toEo of dests) {
    moves.push({ from, to: eoMakeSquare(toEo) });
  }
  return moves;
}

export function isLegalMove(state: XiangqiGameState, move: XiangqiMove): boolean {
  if (state.status.type !== 'playing') return false;
  const position = positionFromState(state);
  const fromEo = eoParseSquare(move.from);
  const toEo = eoParseSquare(move.to);
  if (fromEo === undefined || toEo === undefined) return false;
  return position.isLegal({ from: fromEo, to: toEo });
}

// ── Apply move + end-condition detection ───────────────────────────────────
// progressClock = plies since last capture or soldier advance — the xiangqi
// analog of chess's 50-move rule. elephantops tracks this as `halfmoves` and
// we adopt it directly.
//
// 3-fold true-position repetition is silent and server-adjudicated (see doc
// §4). No indicator is surfaced to players.

const DEFAULT_PROGRESS_CLOCK_LIMIT = 60;

export type XiangqiApplyMoveOptions = {
  progressClockLimit?: number;
};

export function positionRepetitionKey(state: XiangqiGameState): string {
  const turn = state.status.type === 'playing' ? state.status.turn : '-';
  const board = Object.entries(state.board)
    .filter(([, piece]) => piece)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sq, p]) => `${sq}${p!.color[0]}${p!.role[0]}`)
    .join(',');
  return `${turn}|${board}`;
}

export function applyMove(
  state: XiangqiGameState,
  move: XiangqiMove,
  opts: XiangqiApplyMoveOptions = {},
): XiangqiGameState {
  if (state.status.type !== 'playing') return state;

  const position = positionFromState(state);
  const fromEo = eoParseSquare(move.from);
  const toEo = eoParseSquare(move.to);
  if (fromEo === undefined || toEo === undefined) return state;
  if (!position.isLegal({ from: fromEo, to: toEo })) return state;

  // Capture / soldier-advance detection — needed for the progress clock, and
  // must be read BEFORE position.play() mutates the board. (elephantops's
  // own `halfmoves` is just a plain ply counter, not a clock.)
  const movingPiece = state.board[move.from];
  const wasCapture = state.board[move.to] !== undefined;
  const wasSoldierMove = movingPiece?.role === 'soldier';

  position.play({ from: fromEo, to: toEo });

  // Translate new board back to our types.
  const newBoard: XiangqiBoard = {};
  for (const [sqEo, piece] of position.board) {
    newBoard[eoMakeSquare(sqEo as EoSquare)] = {
      color: piece.color,
      role: eoToRole(piece.role),
    };
  }

  const nextTurn = position.turn;
  const newProgressClock = (wasCapture || wasSoldierMove) ? 0 : state.progressClock + 1;
  const newMoveNumber = position.fullmoves;

  // Bookkeep position counts (use intermediate playing state for the digest).
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

  // End-condition detection. Order: standard outcome (checkmate/stalemate)
  // first (decisive); then 3-fold repetition (silent draw); then progress
  // clock (silent draw).
  const limit = opts.progressClockLimit ?? DEFAULT_PROGRESS_CLOCK_LIMIT;
  let nextStatus: XiangqiGameStatus = { type: 'playing', turn: nextTurn };
  const outcome = position.outcome();
  if (outcome !== undefined && outcome.winner !== undefined) {
    nextStatus = {
      type: 'finished',
      winner: outcome.winner,
      reason: position.isStalemate() ? 'stalemate' : 'general-captured',
    };
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

// ── Fog-of-war visibility kernel ───────────────────────────────────────────
// Vision is computed geometrically per the design doc, NOT via elephantops's
// attack functions — vision is broader (e.g. horse sees its leg, elephant
// sees its eye) so that a player can always see why their own piece's moves
// are legal or blocked.

type VisionAccum = {
  directlyVisible: Set<XiangqiSquare>;
  cannonScreens: Set<XiangqiSquare>;
  cannonTargets: Set<XiangqiSquare>;
};

function emptyVision(): VisionAccum {
  return {
    directlyVisible: new Set(),
    cannonScreens: new Set(),
    cannonTargets: new Set(),
  };
}

function addIfOnBoard(set: Set<XiangqiSquare>, file: number, rank: number): void {
  if (inBounds(file, rank)) set.add(squareOf(file, rank));
}

function isOccupied(board: XiangqiBoard, file: number, rank: number): boolean {
  if (!inBounds(file, rank)) return false;
  return board[squareOf(file, rank)] !== undefined;
}

function generalVisionInto(set: Set<XiangqiSquare>, color: XiangqiColor, board: XiangqiBoard, file: number, rank: number): void {
  // 1. The general sees its own square + all 9 palace squares of its side.
  //    (Spec: "Palace squares + enemy general (only when files align ...)".
  //    We include own-side palace; opponent palace is not visible.)
  for (let f = 3; f <= 5; f++) {
    for (let r = color === 'red' ? 1 : 8; r <= (color === 'red' ? 3 : 10); r++) {
      addIfOnBoard(set, f, r);
    }
  }
  // 2. The enemy general, if files align with nothing between.
  for (const [sq, piece] of Object.entries(board)) {
    if (!piece || piece.role !== 'general' || piece.color === color) continue;
    const enemy = coordOf(sq as XiangqiSquare);
    if (enemy.file !== file) continue;
    const minR = Math.min(rank, enemy.rank);
    const maxR = Math.max(rank, enemy.rank);
    let clear = true;
    for (let r = minR + 1; r < maxR; r++) {
      if (isOccupied(board, file, r)) { clear = false; break; }
    }
    if (clear) set.add(sq as XiangqiSquare);
  }
}

function advisorVisionInto(set: Set<XiangqiSquare>, color: XiangqiColor, file: number, rank: number): void {
  // 4 diagonal palace squares.
  for (const [df, dr] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
    const f = file + df, r = rank + dr;
    if (inPalace(color, f, r)) addIfOnBoard(set, f, r);
  }
}

function elephantVisionInto(set: Set<XiangqiSquare>, color: XiangqiColor, file: number, rank: number): void {
  // 4 diagonal-2 destinations in own half + the 4 eye (midpoint) squares.
  // Doc spec: eye and destination both visible regardless of whether the
  // eye is blocked (vision != legality).
  for (const [df, dr] of [[-2, -2], [-2, 2], [2, -2], [2, 2]] as const) {
    const eyeF = file + df / 2, eyeR = rank + dr / 2;
    const destF = file + df, destR = rank + dr;
    if (inBounds(eyeF, eyeR)) set.add(squareOf(eyeF, eyeR));
    if (inBounds(destF, destR) && inOwnHalf(color, destR)) {
      set.add(squareOf(destF, destR));
    }
  }
}

function horseVisionInto(set: Set<XiangqiSquare>, file: number, rank: number): void {
  // 8 L-squares + 4 leg (orthogonal-step) squares.
  for (const [df, dr] of [
    [1, 2], [1, -2], [-1, 2], [-1, -2],
    [2, 1], [2, -1], [-2, 1], [-2, -1],
  ] as const) {
    addIfOnBoard(set, file + df, rank + dr);
  }
  for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    addIfOnBoard(set, file + df, rank + dr);
  }
}

function chariotVisionInto(set: Set<XiangqiSquare>, board: XiangqiBoard, file: number, rank: number): void {
  // Rook-like: walk each ray, include each square, stop after the first piece.
  for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    let f = file + df, r = rank + dr;
    while (inBounds(f, r)) {
      set.add(squareOf(f, r));
      if (isOccupied(board, f, r)) break;
      f += df; r += dr;
    }
  }
}

function cannonVisionInto(
  accum: VisionAccum,
  board: XiangqiBoard,
  color: XiangqiColor,
  file: number,
  rank: number,
): void {
  // Vision = squares the cannon can attack. Along each rook ray:
  //   1. Empty squares up to the first piece → quiet-move targets, visible.
  //   2. First piece encountered = the SCREEN, always visible.
  //   3. If there is an ENEMY piece past the screen, the cannon can capture
  //      it; the empty squares between screen and target are within the
  //      cannon's field of fire, so they become visible too.
  //   4. The enemy target is rendered per A/B/C mode (cannonTargets).
  //   5. If there is no enemy target (only own piece past screen, or off
  //      board), the cannon cannot attack past the screen — vision ends
  //      at the screen.
  for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    let f = file + df, r = rank + dr;
    // Phase 1: empty squares up to screen.
    while (inBounds(f, r) && !isOccupied(board, f, r)) {
      accum.directlyVisible.add(squareOf(f, r));
      f += df; r += dr;
    }
    if (!inBounds(f, r)) continue;
    // Phase 2: screen.
    accum.cannonScreens.add(squareOf(f, r));
    f += df; r += dr;
    // Phase 3: collect empty squares past screen as candidates.
    const candidates: XiangqiSquare[] = [];
    while (inBounds(f, r) && !isOccupied(board, f, r)) {
      candidates.push(squareOf(f, r));
      f += df; r += dr;
    }
    if (!inBounds(f, r)) continue;
    // Phase 4: target — only count it (and promote candidates) if enemy.
    const targetSq = squareOf(f, r);
    const targetPiece = board[targetSq];
    if (!targetPiece || targetPiece.color === color) continue;
    for (const sq of candidates) accum.directlyVisible.add(sq);
    accum.cannonTargets.add(targetSq);
  }
}

function soldierVisionInto(set: Set<XiangqiSquare>, color: XiangqiColor, file: number, rank: number): void {
  // 1 fwd in own half, +2 sideways after crossing the river.
  const forward = color === 'red' ? 1 : -1;
  addIfOnBoard(set, file, rank + forward);
  if (hasCrossedRiver(color, rank)) {
    addIfOnBoard(set, file - 1, rank);
    addIfOnBoard(set, file + 1, rank);
  }
}

export function computeVision(state: XiangqiGameState, color: XiangqiColor): VisionAccum {
  const accum = emptyVision();
  for (const [sq, piece] of Object.entries(state.board)) {
    if (!piece || piece.color !== color) continue;
    // The own square is always directly visible.
    accum.directlyVisible.add(sq as XiangqiSquare);
    const { file, rank } = coordOf(sq as XiangqiSquare);
    switch (piece.role) {
      case 'general': generalVisionInto(accum.directlyVisible, color, state.board, file, rank); break;
      case 'advisor': advisorVisionInto(accum.directlyVisible, color, file, rank); break;
      case 'elephant': elephantVisionInto(accum.directlyVisible, color, file, rank); break;
      case 'horse': horseVisionInto(accum.directlyVisible, file, rank); break;
      case 'chariot': chariotVisionInto(accum.directlyVisible, state.board, file, rank); break;
      case 'cannon': cannonVisionInto(accum, state.board, color, file, rank); break;
      case 'soldier': soldierVisionInto(accum.directlyVisible, color, file, rank); break;
    }
  }
  return accum;
}

export function getVisibleSquares(state: XiangqiGameState, color: XiangqiColor): XiangqiSquare[] {
  const v = computeVision(state, color);
  const all = new Set<XiangqiSquare>([...v.directlyVisible, ...v.cannonScreens, ...v.cannonTargets]);
  return [...all].sort();
}

export function getPlayerView(
  state: XiangqiGameState,
  color: XiangqiColor,
  mode: XiangqiCannonVisionMode = 'C',
): XiangqiPlayerView {
  const vision = computeVision(state, color);
  const playerBoard: XiangqiPlayerBoard = {};

  // Mode rendering rules for cannon-only-visible squares.
  // For a square that is BOTH in directlyVisible AND in cannonScreens/Targets,
  // directlyVisible wins (no shrouding).
  //
  // The shrouded `?` rendering is provided by renderXiangqiPiece — when a screen
  // is shrouded the player sees "something is here, identity unknown," which
  // also serves as the Mode-D "screen has a ? marker" hint that the capture
  // line exists.
  const screenShrouded = mode === 'B' || mode === 'D';
  const targetShrouded = mode === 'B' || mode === 'C';

  for (const sq of vision.directlyVisible) {
    const piece = state.board[sq];
    if (piece) playerBoard[sq] = { piece, shrouded: false };
  }
  for (const sq of vision.cannonScreens) {
    if (playerBoard[sq]) continue;
    const piece = state.board[sq];
    if (piece) playerBoard[sq] = { piece, shrouded: screenShrouded };
  }
  for (const sq of vision.cannonTargets) {
    if (playerBoard[sq]) continue;
    const piece = state.board[sq];
    if (piece) playerBoard[sq] = { piece, shrouded: targetShrouded };
  }

  const visibleSquares = getVisibleSquares(state, color);

  const legalMoves = state.status.type === 'playing' && state.status.turn === color
    ? getLegalMoves(state)
    : [];

  return {
    id: state.id,
    perspective: color,
    board: playerBoard,
    visibleSquares,
    legalMoves,
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}
