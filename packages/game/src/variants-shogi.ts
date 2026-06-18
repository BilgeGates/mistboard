// Dark Shogi pure rules scaffold.
//
// This module intentionally does not reuse chess Variant / PlayerView types.
// Shogi has hands, promoted piece identity, and drop actions, so the dark
// runtime needs a separate state family.

export type ShogiColor = 'black' | 'white';
export type ShogiPieceRole = 'K' | 'R' | 'B' | 'G' | 'S' | 'N' | 'L' | 'P';
export type ShogiPromotableRole = Exclude<ShogiPieceRole, 'K' | 'G'>;
export type ShogiHandRole = Exclude<ShogiPieceRole, 'K'>;
export type ShogiRank = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i';
export type ShogiSquare = `${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}${ShogiRank}`;

export type ShogiPiece = {
  color: ShogiColor;
  role: ShogiPieceRole;
  promoted: boolean;
};

export type ShogiBoard = Partial<Record<ShogiSquare, ShogiPiece>>;
export type ShogiHand = Partial<Record<ShogiHandRole, number>>;
export type ShogiHands = Record<ShogiColor, ShogiHand>;

export type ShogiBoardMove = {
  from: ShogiSquare;
  to: ShogiSquare;
  promote?: boolean;
};
// A drop places a piece from hand onto an empty square (always unpromoted).
export type ShogiDropMove = {
  drop: ShogiHandRole;
  to: ShogiSquare;
};
export type ShogiMove = ShogiBoardMove | ShogiDropMove;

export function isShogiDrop(move: ShogiMove): move is ShogiDropMove {
  return 'drop' in move;
}

export type ShogiGameStatus =
  | { type: 'playing'; turn: ShogiColor }
  | { type: 'finished'; winner: ShogiColor | null; reason: 'king-captured' | 'repetition' };

export type ShogiGameState = {
  id: string;
  board: ShogiBoard;
  hands: ShogiHands;
  status: ShogiGameStatus;
  moveNumber: number;
  lastMove?: ShogiMove;
};

// The fog view for one side. Only pieces on visible squares appear on `board`
// (field-of-fire vision, no silhouettes — shogi has no screen mechanic); `hand`
// is the viewer's OWN captured pieces only (each side's reserve is private under
// fog, like the off-vision board). `lastMove` is left for the tenant to strip to
// own-moves-only, matching the other dark variants.
export type ShogiPlayerView = {
  id: string;
  perspective: ShogiColor;
  board: ShogiBoard;
  hand: ShogiHand;
  visibleSquares: ShogiSquare[];
  legalMoves: ShogiMove[];
  status: ShogiGameStatus;
  moveNumber: number;
  lastMove?: ShogiMove;
};

export type ShogiCoord = {
  file: number;
  rank: ShogiRank;
  rankIndex: number;
};

const RANKS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] as const;
const BACK_RANK_BY_FILE: Record<number, ShogiPieceRole> = {
  9: 'L',
  8: 'N',
  7: 'S',
  6: 'G',
  5: 'K',
  4: 'G',
  3: 'S',
  2: 'N',
  1: 'L',
};

export function shogiSquareOf(file: number, rankIndex: number): ShogiSquare {
  if (!shogiInBounds(file, rankIndex)) {
    throw new RangeError(`shogi coord out of range: file=${file} rankIndex=${rankIndex}`);
  }
  return `${file}${RANKS[rankIndex]}` as ShogiSquare;
}

export function shogiCoordOf(square: ShogiSquare): ShogiCoord {
  const file = Number(square.slice(0, -1));
  const rank = square.slice(-1) as ShogiRank;
  const rankIndex = RANKS.indexOf(rank);
  if (!Number.isInteger(file) || file < 1 || file > 9 || rankIndex < 0) {
    throw new RangeError(`invalid shogi square: ${square}`);
  }
  return { file, rank, rankIndex };
}

export function shogiInBounds(file: number, rankIndex: number): boolean {
  return file >= 1 && file <= 9 && rankIndex >= 0 && rankIndex < 9;
}

export function opponentOf(color: ShogiColor): ShogiColor {
  return color === 'black' ? 'white' : 'black';
}

export function forward(color: ShogiColor): number {
  return color === 'black' ? -1 : 1;
}

export function createShogiPiece(
  color: ShogiColor,
  role: ShogiPieceRole,
  promoted = false,
): ShogiPiece {
  return { color, role, promoted: canPromoteRole(role) && promoted };
}

export function canPromoteRole(role: ShogiPieceRole): role is ShogiPromotableRole {
  return role !== 'K' && role !== 'G';
}

export function demotedRole(role: ShogiPieceRole): ShogiPieceRole {
  return role;
}

export function createEmptyShogiHands(): ShogiHands {
  return { black: {}, white: {} };
}

export function createInitialShogiBoard(): ShogiBoard {
  const board: ShogiBoard = {};
  for (let file = 1; file <= 9; file += 1) {
    board[`${file}a` as ShogiSquare] = createShogiPiece('white', BACK_RANK_BY_FILE[file]!);
    board[`${file}c` as ShogiSquare] = createShogiPiece('white', 'P');
    board[`${file}g` as ShogiSquare] = createShogiPiece('black', 'P');
    board[`${file}i` as ShogiSquare] = createShogiPiece('black', BACK_RANK_BY_FILE[file]!);
  }
  board['8b'] = createShogiPiece('white', 'R');
  board['2b'] = createShogiPiece('white', 'B');
  board['8h'] = createShogiPiece('black', 'B');
  board['2h'] = createShogiPiece('black', 'R');
  return board;
}

export function createInitialShogiState(gameId: string): ShogiGameState {
  return {
    id: gameId,
    board: createInitialShogiBoard(),
    hands: createEmptyShogiHands(),
    status: { type: 'playing', turn: 'black' },
    moveNumber: 1,
  };
}

export function getLegalShogiMoves(state: ShogiGameState): ShogiMove[] {
  if (state.status.type !== 'playing') return [];
  const moves: ShogiMove[] = [];
  for (const square of sortedSquares(state.board)) {
    const piece = state.board[square];
    if (piece?.color !== state.status.turn) continue;
    moves.push(...getLegalShogiMovesFrom(state, square));
  }
  moves.push(...getLegalShogiDrops(state));
  return moves;
}

export function getLegalShogiMovesFrom(state: ShogiGameState, from: ShogiSquare): ShogiBoardMove[] {
  if (state.status.type !== 'playing') return [];
  const piece = state.board[from];
  if (!piece || piece.color !== state.status.turn) return [];
  const moves: ShogiBoardMove[] = [];
  for (const to of controlledSquares(state.board, from, piece)) {
    if (state.board[to]?.color === piece.color) continue;
    if (!canMovePromote(piece, from, to)) {
      moves.push({ from, to });
      continue;
    }
    if (mustPromote(piece, to)) {
      moves.push({ from, to, promote: true });
      continue;
    }
    moves.push({ from, to }, { from, to, promote: true });
  }
  return moves;
}

// Every legal drop for the side to move: each hand role onto each empty square
// that satisfies nifu (one unpromoted Pawn per file) and the dead-piece rule
// (P/L on the last rank, N on the last two, have no move).
export function getLegalShogiDrops(state: ShogiGameState): ShogiDropMove[] {
  if (state.status.type !== 'playing') return [];
  const color = state.status.turn;
  const hand = state.hands[color];
  const roles = (Object.keys(hand) as ShogiHandRole[]).filter((role) => (hand[role] ?? 0) > 0);
  if (roles.length === 0) return [];
  const drops: ShogiDropMove[] = [];
  for (const role of roles) {
    for (let file = 1; file <= 9; file += 1) {
      for (let rankIndex = 0; rankIndex < 9; rankIndex += 1) {
        const to = shogiSquareOf(file, rankIndex);
        if (state.board[to]) continue;
        if (canDropShogiPiece(state.board, color, role, to)) drops.push({ drop: role, to });
      }
    }
  }
  return drops;
}

function canDropShogiPiece(
  board: ShogiBoard,
  color: ShogiColor,
  role: ShogiHandRole,
  to: ShogiSquare,
): boolean {
  const piece = createShogiPiece(color, role); // dropped pieces are always unpromoted
  // Dead-piece rule: a piece with no in-bounds reach from its square (P/L on the
  // far rank, N on the far two) may not be dropped there.
  if (controlledSquares(board, to, piece).length === 0) return false;
  // Nifu: no second unpromoted Pawn of this colour in the file.
  if (role === 'P') {
    const { file } = shogiCoordOf(to);
    for (let rankIndex = 0; rankIndex < 9; rankIndex += 1) {
      const existing = board[shogiSquareOf(file, rankIndex)];
      if (existing && existing.color === color && existing.role === 'P' && !existing.promoted) {
        return false;
      }
    }
  }
  return true;
}

export function isLegalShogiMove(state: ShogiGameState, move: ShogiMove): boolean {
  if (state.status.type !== 'playing') return false;
  if (isShogiDrop(move)) {
    const hand = state.hands[state.status.turn];
    if ((hand[move.drop] ?? 0) <= 0) return false;
    if (state.board[move.to]) return false;
    return canDropShogiPiece(state.board, state.status.turn, move.drop, move.to);
  }
  return getLegalShogiMovesFrom(state, move.from).some(
    (candidate) => candidate.to === move.to && Boolean(candidate.promote) === Boolean(move.promote),
  );
}

// ── Fog of War view ──────────────────────────────────────────────────────────
//
// Vision is field of fire: a side sees its own pieces and every square they
// attack/reach. Sliders stop at the first piece (which is therefore visible), so
// there are no shrouded silhouettes — shogi has no screen mechanic. Defined for
// finished states too, so post-game replay does not collapse the loser's view.

export function shogiVisibleSquares(state: ShogiGameState, color: ShogiColor): ShogiSquare[] {
  const visible = new Set<ShogiSquare>();
  for (const [square, piece] of Object.entries(state.board)) {
    if (piece?.color !== color) continue;
    const from = square as ShogiSquare;
    visible.add(from);
    for (const target of controlledSquares(state.board, from, piece)) visible.add(target);
  }
  return [...visible].sort();
}

export function getShogiPlayerView(state: ShogiGameState, color: ShogiColor): ShogiPlayerView {
  const visible = shogiVisibleSquares(state, color);
  const board: ShogiBoard = {};
  for (const square of visible) {
    const piece = state.board[square];
    if (piece) board[square] = piece;
  }
  const legalMoves =
    state.status.type === 'playing' && state.status.turn === color ? getLegalShogiMoves(state) : [];
  return {
    id: state.id,
    perspective: color,
    board,
    hand: { ...state.hands[color] }, // each side sees only its own hand
    visibleSquares: visible,
    legalMoves,
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

export function applyShogiMove(state: ShogiGameState, move: ShogiMove): ShogiGameState {
  if (state.status.type !== 'playing') return state;
  if (!isLegalShogiMove(state, move)) return state;

  if (isShogiDrop(move)) {
    const color = state.status.turn;
    const nextBoard: ShogiBoard = { ...state.board };
    const nextHands = cloneHands(state.hands);
    removeHandPiece(nextHands, color, move.drop);
    nextBoard[move.to] = createShogiPiece(color, move.drop);
    return {
      ...state,
      board: nextBoard,
      hands: nextHands,
      status: { type: 'playing', turn: opponentOf(color) },
      moveNumber: color === 'white' ? state.moveNumber + 1 : state.moveNumber,
      lastMove: move,
    };
  }

  const piece = state.board[move.from];
  if (!piece) return state;

  const captured = state.board[move.to];
  const nextBoard: ShogiBoard = { ...state.board };
  const nextHands = cloneHands(state.hands);
  delete nextBoard[move.from];

  if (captured?.role === 'K') {
    nextBoard[move.to] = {
      ...piece,
      promoted: piece.promoted || Boolean(move.promote),
    };
    return {
      ...state,
      board: nextBoard,
      hands: nextHands,
      status: { type: 'finished', winner: piece.color, reason: 'king-captured' },
      lastMove: move,
    };
  }

  if (captured) addHandPiece(nextHands, piece.color, demotedRole(captured.role) as ShogiHandRole);
  nextBoard[move.to] = {
    ...piece,
    promoted: piece.promoted || Boolean(move.promote),
  };

  return {
    ...state,
    board: nextBoard,
    hands: nextHands,
    status: { type: 'playing', turn: opponentOf(piece.color) },
    moveNumber: piece.color === 'white' ? state.moveNumber + 1 : state.moveNumber,
    lastMove: move,
  };
}

export function controlledSquares(
  board: ShogiBoard,
  from: ShogiSquare,
  piece: ShogiPiece,
): ShogiSquare[] {
  const out: ShogiSquare[] = [];
  const { file, rankIndex } = shogiCoordOf(from);

  for (const [df, dr] of stepDeltas(piece)) {
    const toFile = file + df;
    const toRank = rankIndex + dr;
    if (shogiInBounds(toFile, toRank)) out.push(shogiSquareOf(toFile, toRank));
  }

  for (const [df, dr] of slideDeltas(piece)) {
    let toFile = file + df;
    let toRank = rankIndex + dr;
    while (shogiInBounds(toFile, toRank)) {
      const to = shogiSquareOf(toFile, toRank);
      out.push(to);
      if (board[to]) break;
      toFile += df;
      toRank += dr;
    }
  }

  return out;
}

export function isPromotionZone(color: ShogiColor, square: ShogiSquare): boolean {
  const { rankIndex } = shogiCoordOf(square);
  return color === 'black' ? rankIndex <= 2 : rankIndex >= 6;
}

export function canMovePromote(
  piece: ShogiPiece,
  from: ShogiSquare,
  to: ShogiSquare,
): piece is ShogiPiece & { role: ShogiPromotableRole } {
  return (
    canPromoteRole(piece.role) &&
    !piece.promoted &&
    (isPromotionZone(piece.color, from) || isPromotionZone(piece.color, to))
  );
}

export function mustPromote(piece: ShogiPiece, to: ShogiSquare): boolean {
  if (piece.promoted) return false;
  const { rankIndex } = shogiCoordOf(to);
  if (piece.role === 'P' || piece.role === 'L') {
    return piece.color === 'black' ? rankIndex === 0 : rankIndex === 8;
  }
  if (piece.role === 'N') {
    return piece.color === 'black' ? rankIndex <= 1 : rankIndex >= 7;
  }
  return false;
}

function stepDeltas(piece: ShogiPiece): Array<[number, number]> {
  const f = forward(piece.color);

  if (piece.promoted && ['P', 'L', 'N', 'S'].includes(piece.role)) return goldDeltas(piece.color);
  if (piece.role === 'K') {
    return [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ];
  }
  if (piece.role === 'G') return goldDeltas(piece.color);
  if (piece.role === 'S') {
    return [
      [0, f],
      [-1, f],
      [1, f],
      [-1, -f],
      [1, -f],
    ];
  }
  if (piece.role === 'N') {
    return [
      [-1, 2 * f],
      [1, 2 * f],
    ];
  }
  if (piece.role === 'P') return [[0, f]];
  if (piece.role === 'R' && piece.promoted) {
    return [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ];
  }
  if (piece.role === 'B' && piece.promoted) {
    return [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ];
  }
  return [];
}

function goldDeltas(color: ShogiColor): Array<[number, number]> {
  const f = forward(color);
  return [
    [0, f],
    [-1, f],
    [1, f],
    [-1, 0],
    [1, 0],
    [0, -f],
  ];
}

function slideDeltas(piece: ShogiPiece): Array<[number, number]> {
  const deltas: Array<[number, number]> = [];
  if (piece.role === 'R') {
    deltas.push([0, -1], [-1, 0], [1, 0], [0, 1]);
  }
  if (piece.role === 'B') {
    deltas.push([-1, -1], [1, -1], [-1, 1], [1, 1]);
  }
  if (piece.role === 'L' && !piece.promoted) deltas.push([0, forward(piece.color)]);
  return deltas;
}

function sortedSquares(board: ShogiBoard): ShogiSquare[] {
  return (Object.keys(board) as ShogiSquare[]).sort((a, b) => {
    const ca = shogiCoordOf(a);
    const cb = shogiCoordOf(b);
    return ca.rankIndex - cb.rankIndex || cb.file - ca.file;
  });
}

function cloneHands(hands: ShogiHands): ShogiHands {
  return {
    black: { ...hands.black },
    white: { ...hands.white },
  };
}

function removeHandPiece(hands: ShogiHands, color: ShogiColor, role: ShogiHandRole): void {
  const count = hands[color][role] ?? 0;
  if (count <= 1) delete hands[color][role];
  else hands[color][role] = count - 1;
}

function addHandPiece(hands: ShogiHands, color: ShogiColor, role: ShogiHandRole): void {
  hands[color][role] = (hands[color][role] ?? 0) + 1;
}
