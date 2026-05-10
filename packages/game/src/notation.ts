import type { Board, GameState, Move, PieceRole, Square } from './types.js';

type PromotionRole = Exclude<PieceRole, 'king' | 'pawn'>;

const pieceLetters: Record<Exclude<PieceRole, 'pawn'>, string> = {
  bishop: 'B',
  king: 'K',
  knight: 'N',
  queen: 'Q',
  rook: 'R',
};

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export function moveToAlgebraic(state: GameState, move: Move): string {
  const piece = state.board[move.from];
  if (!piece) return moveToCoordinate(move);

  const castlingSide = castlingMoveSide(state, move);
  if (castlingSide) return castlingSide === 'king' ? 'O-O' : 'O-O-O';

  const capture = isCapture(state, move);
  const promotion = move.promotion ? `=${promotionLetter(move.promotion)}` : '';

  if (piece.role === 'pawn') {
    return `${capture ? `${fileOf(move.from)}x` : ''}${move.to}${promotion}`;
  }

  return [
    pieceLetters[piece.role],
    disambiguation(state, move),
    capture ? 'x' : '',
    move.to,
    promotion,
  ].join('');
}

function moveToCoordinate(move: Move): string {
  return `${move.from}${move.to}${move.promotion ? `=${promotionLetter(move.promotion)}` : ''}`;
}

function promotionLetter(role: PromotionRole): string {
  return pieceLetters[role];
}

function castlingMoveSide(state: GameState, move: Move): 'king' | 'queen' | null {
  const piece = state.board[move.from];
  if (!piece || piece.role !== 'king' || rankOf(move.from) !== rankOf(move.to)) return null;

  const target = state.board[move.to];
  if (target?.color === piece.color && target.role === 'rook' && state.castlingRights.includes(move.to)) {
    return fileIndex(move.to) > fileIndex(move.from) ? 'king' : 'queen';
  }

  const kingSide = fileOf(move.to) === 'g';
  const queenSide = fileOf(move.to) === 'c';
  if (!kingSide && !queenSide) return null;

  const fromFile = fileIndex(move.from);
  const rookSquare = state.castlingRights.find((square) => {
    const rook = state.board[square];
    if (!rook || rook.color !== piece.color || rook.role !== 'rook') return false;
    if (rankOf(square) !== rankOf(move.from)) return false;
    return kingSide ? fileIndex(square) > fromFile : fileIndex(square) < fromFile;
  });
  if (!rookSquare) return null;
  return kingSide ? 'king' : 'queen';
}

function disambiguation(state: GameState, move: Move): string {
  const piece = state.board[move.from];
  if (!piece || piece.role === 'pawn') return '';

  const alternatives = Object.entries(state.board)
    .filter(([from, candidate]) => (
      from !== move.from
      && candidate?.color === piece.color
      && candidate.role === piece.role
      && canPieceReach(state.board, from as Square, move.to)
    ))
    .map(([from]) => from as Square);

  if (alternatives.length === 0) return '';

  const sharesRank = alternatives.some((from) => rankOf(from) === rankOf(move.from));
  const sharesFile = alternatives.some((from) => fileOf(from) === fileOf(move.from));
  return `${sharesRank ? fileOf(move.from) : ''}${sharesFile ? rankOf(move.from) : ''}`;
}

function canPieceReach(board: Board, from: Square, to: Square): boolean {
  const piece = board[from];
  const target = board[to];
  if (!piece || target?.color === piece.color) return false;

  const fileDelta = fileIndex(to) - fileIndex(from);
  const rankDelta = rankOf(to) - rankOf(from);
  const absFile = Math.abs(fileDelta);
  const absRank = Math.abs(rankDelta);

  if (piece.role === 'knight') return (absFile === 1 && absRank === 2) || (absFile === 2 && absRank === 1);
  if (piece.role === 'king') return Math.max(absFile, absRank) === 1;
  if (piece.role === 'bishop') return absFile === absRank && isClearPath(board, from, to);
  if (piece.role === 'rook') return (fileDelta === 0 || rankDelta === 0) && isClearPath(board, from, to);
  if (piece.role === 'queen') return (fileDelta === 0 || rankDelta === 0 || absFile === absRank) && isClearPath(board, from, to);
  if (piece.role === 'pawn') {
    const direction = piece.color === 'white' ? 1 : -1;
    return rankDelta === direction && absFile === 1;
  }
  return false;
}

function isClearPath(board: Board, from: Square, to: Square): boolean {
  const fileStep = Math.sign(fileIndex(to) - fileIndex(from));
  const rankStep = Math.sign(rankOf(to) - rankOf(from));
  let file = fileIndex(from) + fileStep;
  let rank = rankOf(from) + rankStep;

  while (file !== fileIndex(to) || rank !== rankOf(to)) {
    if (board[`${files[file]}${rank}` as Square]) return false;
    file += fileStep;
    rank += rankStep;
  }
  return true;
}

function isCapture(state: GameState, move: Move): boolean {
  const piece = state.board[move.from];
  if (!piece) return false;
  const target = state.board[move.to];
  if (target && target.color !== piece.color) return true;
  return piece.role === 'pawn'
    && move.to === state.enPassantSquare
    && fileOf(move.from) !== fileOf(move.to);
}

function fileOf(square: Square): string {
  return square[0];
}

function fileIndex(square: Square): number {
  return files.indexOf(square[0] as typeof files[number]);
}

function rankOf(square: Square): number {
  return Number(square[1]);
}
