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

export type ShogiMove = {
  from: ShogiSquare;
  to: ShogiSquare;
  promote?: boolean;
};

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
  return moves;
}

export function getLegalShogiMovesFrom(state: ShogiGameState, from: ShogiSquare): ShogiMove[] {
  if (state.status.type !== 'playing') return [];
  const piece = state.board[from];
  if (!piece || piece.color !== state.status.turn) return [];
  const moves: ShogiMove[] = [];
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

export function isLegalShogiMove(state: ShogiGameState, move: ShogiMove): boolean {
  return getLegalShogiMovesFrom(state, move.from).some(
    (candidate) => candidate.to === move.to && Boolean(candidate.promote) === Boolean(move.promote),
  );
}

export function applyShogiMove(state: ShogiGameState, move: ShogiMove): ShogiGameState {
  if (state.status.type !== 'playing') return state;
  if (!isLegalShogiMove(state, move)) return state;

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

function addHandPiece(hands: ShogiHands, color: ShogiColor, role: ShogiHandRole): void {
  hands[color][role] = (hands[color][role] ?? 0) + 1;
}
