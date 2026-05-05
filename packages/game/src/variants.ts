import { Board as ChessopsBoard } from 'chessops/board';
import { Chess } from 'chessops/chess';
import { SquareSet } from 'chessops/squareSet';
import type { Move as ChessopsMove, Role, Square as ChessopsSquare } from 'chessops/types';
import { makeSquare, parseSquare, squareRank } from 'chessops/util';
import type { Setup } from 'chessops/setup';
import type { Board, Color, GameState, Move, PieceRole, PlayerView, Square, Variant } from './types.js';

const initialBoard: Board = {
  a1: { color: 'white', role: 'rook' },
  b1: { color: 'white', role: 'knight' },
  c1: { color: 'white', role: 'bishop' },
  d1: { color: 'white', role: 'queen' },
  e1: { color: 'white', role: 'king' },
  f1: { color: 'white', role: 'bishop' },
  g1: { color: 'white', role: 'knight' },
  h1: { color: 'white', role: 'rook' },
  a2: { color: 'white', role: 'pawn' },
  b2: { color: 'white', role: 'pawn' },
  c2: { color: 'white', role: 'pawn' },
  d2: { color: 'white', role: 'pawn' },
  e2: { color: 'white', role: 'pawn' },
  f2: { color: 'white', role: 'pawn' },
  g2: { color: 'white', role: 'pawn' },
  h2: { color: 'white', role: 'pawn' },
  a7: { color: 'black', role: 'pawn' },
  b7: { color: 'black', role: 'pawn' },
  c7: { color: 'black', role: 'pawn' },
  d7: { color: 'black', role: 'pawn' },
  e7: { color: 'black', role: 'pawn' },
  f7: { color: 'black', role: 'pawn' },
  g7: { color: 'black', role: 'pawn' },
  h7: { color: 'black', role: 'pawn' },
  a8: { color: 'black', role: 'rook' },
  b8: { color: 'black', role: 'knight' },
  c8: { color: 'black', role: 'bishop' },
  d8: { color: 'black', role: 'queen' },
  e8: { color: 'black', role: 'king' },
  f8: { color: 'black', role: 'bishop' },
  g8: { color: 'black', role: 'knight' },
  h8: { color: 'black', role: 'rook' },
};

const standardCastlingRights: Square[] = ['a1', 'h1', 'a8', 'h8'];
const promotionRoles = ['queen', 'rook', 'bishop', 'knight'] satisfies PieceRole[];
const boardFiles = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const boardRanks = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export const draft960Variant: Variant = {
  id: 'draft960',
  createInitialState(gameId: string): GameState {
    return {
      id: gameId,
      variant: 'draft960',
      board: initialBoard,
      status: { type: 'pregame' },
      moveNumber: 1,
      castlingRights: standardCastlingRights,
      halfmoveClock: 0,
    };
  },
  getLegalMoves(state: GameState, player: Color): Move[] {
    return getLegalMoves(state, player);
  },
  applyMove(state: GameState, move: Move): GameState {
    if (state.status.type !== 'playing') return state;

    const position = positionFromState(state);
    const chessopsMove = toChessopsMove(move);
    if (!chessopsMove || !position.isLegal(chessopsMove)) return state;

    position.play(chessopsMove);
    const setup = position.toSetup();
    const outcome = position.outcome();

    return {
      ...state,
      board: boardFromChessops(setup.board),
      status: outcome
        ? {
          type: 'finished',
          winner: outcome.winner ?? null,
          reason: outcome.winner ? 'checkmate' : 'draw',
        }
        : { type: 'playing', turn: setup.turn },
      moveNumber: setup.fullmoves,
      castlingRights: [...setup.castlingRights].map((square) => makeSquare(square) as Square),
      enPassantSquare: setup.epSquare === undefined ? undefined : makeSquare(setup.epSquare) as Square,
      halfmoveClock: setup.halfmoves,
      lastMove: move,
    };
  },
  getPlayerView(state: GameState, player: Color): PlayerView {
    return {
      id: state.id,
      variant: state.variant,
      board: state.board,
      visibleSquares: Object.keys(state.board) as PlayerView['visibleSquares'],
      legalMoves: getLegalMoves(state, player),
      status: state.status,
      perspective: player,
      moveNumber: state.moveNumber,
      lastMove: state.lastMove,
      clock: state.clock,
    };
  },
  isGameOver() {
    return null;
  },
};

export const fogOfWarVariant: Variant = {
  ...draft960Variant,
  id: 'fog-of-war',
  createInitialState(gameId: string): GameState {
    return {
      ...draft960Variant.createInitialState(gameId),
      variant: 'fog-of-war',
      status: { type: 'playing', turn: 'white' },
    };
  },
  getLegalMoves(state: GameState, player: Color): Move[] {
    if (state.status.type !== 'playing' || state.status.turn !== player) return [];
    return getFogMovesForPlayer(state, player);
  },
  applyMove(state: GameState, move: Move): GameState {
    return applyFogMove(state, move);
  },
  getPlayerView(state: GameState, player: Color): PlayerView {
    const ownSquares = ownPieceSquares(state.board, player);
    const visibleSquares = fogVisibleSquares(state, player);
    const board = boardVisibleTo(state.board, visibleSquares);

    return {
      id: state.id,
      variant: state.variant,
      board,
      visibleSquares,
      legalMoves: state.status.type === 'playing' && state.status.turn === player
        ? getFogMovesForPlayer(state, player)
        : [],
      status: state.status,
      perspective: player,
      moveNumber: state.moveNumber,
      lastMove: ownSquares.includes(state.lastMove?.from as Square) ? state.lastMove : undefined,
      clock: state.clock,
    };
  },
};

export const bidForWhiteVariant: Variant = {
  ...draft960Variant,
  id: 'bid-for-white',
  createInitialState(gameId: string): GameState {
    return {
      ...draft960Variant.createInitialState(gameId),
      variant: 'bid-for-white',
    };
  },
};

function fogVisibleSquares(state: GameState, player: Color): Square[] {
  const visible = new Set<Square>(ownPieceSquares(state.board, player));
  for (const move of getVisibilityMoves(state, player)) {
    visible.add(move.to);
    if (isEnPassantMove(state, move, player)) {
      visible.add(enPassantCaptureSquare(move.to, player));
    }
  }
  return [...visible].sort();
}

function ownPieceSquares(board: Board, player: Color): Square[] {
  return Object.entries(board)
      .filter(([, piece]) => piece?.color === player)
      .map(([square]) => square as Square);
}

function boardVisibleTo(board: Board, visibleSquares: Square[]): Board {
  const visible = new Set(visibleSquares);
  const playerBoard: Board = {};
  for (const [square, piece] of Object.entries(board)) {
    if (piece && visible.has(square as Square)) playerBoard[square as Square] = piece;
  }
  return playerBoard;
}

function applyFogMove(state: GameState, move: Move): GameState {
  if (state.status.type !== 'playing') return state;

  const player = state.status.turn;
  const legalMove = getFogMovesForPlayer(state, player)
    .find((candidate) => movesMatch(candidate, move));
  if (!legalMove) return state;

  const piece = state.board[legalMove.from];
  if (!piece || piece.color !== player) return state;

  const board = { ...state.board };
  const capturedPiece = board[legalMove.to];
  const enPassantCapture = piece.role === 'pawn'
    && legalMove.to === state.enPassantSquare
    && capturedPiece === undefined
    && fileOf(legalMove.from) !== fileOf(legalMove.to);
  const castlingMove = isFogCastlingMove(state, legalMove);

  delete board[legalMove.from];
  if (enPassantCapture) delete board[enPassantCaptureSquare(legalMove.to, player)];

  if (castlingMove) {
    applyFogCastling(board, legalMove, piece);
  } else {
    board[legalMove.to] = {
      color: piece.color,
      role: legalMove.promotion ?? piece.role,
    };
  }

  const nextStatus = capturedPiece?.role === 'king'
    ? { type: 'finished', winner: player, reason: 'king-captured' } as const
    : { type: 'playing', turn: oppositeColor(player) } as const;

  return {
    ...state,
    board,
    status: nextStatus,
    moveNumber: state.moveNumber + (player === 'black' ? 1 : 0),
    castlingRights: nextCastlingRights(state, legalMove, piece.role),
    enPassantSquare: nextEnPassantSquare(legalMove, piece.role, player),
    halfmoveClock: piece.role === 'pawn' || capturedPiece || enPassantCapture ? 0 : state.halfmoveClock + 1,
    lastMove: legalMove,
  };
}

function getFogMovesForPlayer(state: GameState, player: Color): Move[] {
  const moves: Move[] = [];
  for (const square of ownPieceSquares(state.board, player)) {
    moves.push(...fogMovesFrom(state, square));
  }
  return moves;
}

function fogMovesFrom(state: GameState, from: Square): Move[] {
  const piece = state.board[from];
  if (!piece) return [];

  if (piece.role === 'pawn') return fogPawnMoves(state, from, piece.color);
  if (piece.role === 'knight') return fogStepMoves(state, from, knightSteps);
  if (piece.role === 'bishop') return fogSlideMoves(state, from, bishopDirections);
  if (piece.role === 'rook') return fogSlideMoves(state, from, rookDirections);
  if (piece.role === 'queen') return fogSlideMoves(state, from, [...rookDirections, ...bishopDirections]);
  return [
    ...fogStepMoves(state, from, kingSteps),
    ...fogCastlingMoves(state, from),
  ];
}

function fogPawnMoves(state: GameState, from: Square, color: Color): Move[] {
  const moves: Move[] = [];
  const direction = color === 'white' ? 1 : -1;
  const startRank = color === 'white' ? 2 : 7;
  const epCaptureFromRank = color === 'white' ? 5 : 4;
  const oneStep = offsetSquare(from, 0, direction);
  if (oneStep && !state.board[oneStep]) {
    addMaybePromotion(moves, from, oneStep);

    const twoStep = offsetSquare(from, 0, direction * 2);
    if (rankOf(from) === startRank && twoStep && !state.board[twoStep]) {
      moves.push({ from, to: twoStep });
    }
  }

  for (const fileOffset of [-1, 1]) {
    const to = offsetSquare(from, fileOffset, direction);
    if (!to) continue;
    const target = state.board[to];
    const isEnPassantCapture = to === state.enPassantSquare && rankOf(from) === epCaptureFromRank;
    if ((target && target.color !== color) || isEnPassantCapture) {
      addMaybePromotion(moves, from, to);
    }
  }

  return moves;
}

function fogStepMoves(state: GameState, from: Square, steps: readonly Direction[]): Move[] {
  return steps.flatMap(([fileOffset, rankOffset]) => {
    const to = offsetSquare(from, fileOffset, rankOffset);
    return to && canOccupy(state, from, to) ? [{ from, to }] : [];
  });
}

function fogSlideMoves(state: GameState, from: Square, directions: readonly Direction[]): Move[] {
  const moves: Move[] = [];
  for (const [fileOffset, rankOffset] of directions) {
    let to = offsetSquare(from, fileOffset, rankOffset);
    while (to) {
      if (!canOccupy(state, from, to)) break;
      moves.push({ from, to });
      if (state.board[to]) break;
      to = offsetSquare(to, fileOffset, rankOffset);
    }
  }
  return moves;
}

function fogCastlingMoves(state: GameState, from: Square): Move[] {
  const piece = state.board[from];
  if (!piece || piece.role !== 'king') return [];

  const moves: Move[] = [];
  for (const rookSquare of state.castlingRights) {
    const rook = state.board[rookSquare];
    if (!rook || rook.color !== piece.color || rook.role !== 'rook') continue;
    if (rankOf(rookSquare) !== rankOf(from)) continue;
    if (!clearBetween(state.board, from, rookSquare)) continue;
    moves.push({ from, to: rookSquare });
  }
  return moves;
}

function getLegalMoves(state: GameState, player: Color): Move[] {
  if (state.status.type !== 'playing' || state.status.turn !== player) return [];
  return getMovesForPlayer(state, player);
}

function getVisibilityMoves(state: GameState, player: Color): Move[] {
  if (state.status.type !== 'playing') return [];
  if (state.variant === 'fog-of-war') return getFogMovesForPlayer(state, player);
  return getMovesForPlayer(state, player);
}

function getMovesForPlayer(state: GameState, player: Color): Move[] {
  const position = positionFromState(state, player);
  const moves: Move[] = [];
  const context = position.ctx();

  for (const [from, destinations] of position.allDests(context)) {
    for (const to of destinations) {
      const piece = position.board.get(from);
      if (piece?.role === 'pawn' && isPromotionDestination(to)) {
        for (const promotion of promotionRoles) {
          moves.push(toMove(from, to, promotion));
        }
      } else {
        moves.push(toMove(from, to));
      }
    }
  }

  return moves;
}

function positionFromState(state: GameState, turnOverride?: Color): Chess {
  return Chess.fromSetup(setupFromState(state, turnOverride)).unwrap();
}

function setupFromState(state: GameState, turnOverride?: Color): Setup {
  let castlingRights = SquareSet.empty();
  for (const square of state.castlingRights) {
    castlingRights = castlingRights.with(parseSquare(square));
  }

  return {
    board: boardToChessops(state.board),
    pockets: undefined,
    turn: turnOverride ?? (state.status.type === 'playing' ? state.status.turn : 'white'),
    castlingRights,
    epSquare: state.enPassantSquare ? parseSquare(state.enPassantSquare) : undefined,
    remainingChecks: undefined,
    halfmoves: state.halfmoveClock,
    fullmoves: state.moveNumber,
  };
}

function boardToChessops(board: Board): ChessopsBoard {
  const chessopsBoard = ChessopsBoard.empty();
  for (const [square, piece] of Object.entries(board)) {
    if (!piece) continue;
    const chessopsSquare = parseSquare(square);
    if (chessopsSquare === undefined) continue;
    chessopsBoard.set(chessopsSquare, {
      color: piece.color,
      role: piece.role,
    });
  }
  return chessopsBoard;
}

function boardFromChessops(board: ChessopsBoard): Board {
  const nextBoard: Board = {};
  for (const [square, piece] of board) {
    nextBoard[makeSquare(square) as Square] = {
      color: piece.color,
      role: piece.role,
    };
  }
  return nextBoard;
}

function toChessopsMove(move: Move): ChessopsMove | null {
  const from = parseSquare(move.from);
  const to = parseSquare(move.to);
  if (from === undefined || to === undefined) return null;
  return {
    from,
    to,
    promotion: move.promotion as Role | undefined,
  };
}

function toMove(from: ChessopsSquare, to: ChessopsSquare, promotion?: PieceRole): Move {
  return {
    from: makeSquare(from) as Square,
    to: makeSquare(to) as Square,
    promotion: promotion === 'king' || promotion === 'pawn' ? undefined : promotion,
  };
}

function isPromotionDestination(square: ChessopsSquare): boolean {
  const rank = squareRank(square);
  return rank === 0 || rank === 7;
}

type Direction = readonly [fileOffset: number, rankOffset: number];

const knightSteps: Direction[] = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1],
];
const kingSteps: Direction[] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];
const rookDirections: Direction[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const bishopDirections: Direction[] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

function addMaybePromotion(moves: Move[], from: Square, to: Square): void {
  if (rankOf(to) === 1 || rankOf(to) === 8) {
    for (const promotion of promotionRoles) moves.push({ from, to, promotion });
    return;
  }
  moves.push({ from, to });
}

function canOccupy(state: GameState, from: Square, to: Square): boolean {
  const piece = state.board[from];
  const target = state.board[to];
  return !!piece && (!target || target.color !== piece.color);
}

function movesMatch(candidate: Move, move: Move): boolean {
  return candidate.from === move.from
    && candidate.to === move.to
    && (candidate.promotion ?? undefined) === (move.promotion ?? undefined);
}

function nextCastlingRights(state: GameState, move: Move, role: PieceRole): Square[] {
  return state.castlingRights.filter((square) => {
    if (square === move.from || square === move.to) return false;
    if (role !== 'king') return true;
    return rankOf(square) !== rankOf(move.from);
  });
}

function nextEnPassantSquare(move: Move, role: PieceRole, color: Color): Square | undefined {
  if (role !== 'pawn') return undefined;
  if (Math.abs(rankOf(move.to) - rankOf(move.from)) !== 2) return undefined;
  return offsetSquare(move.from, 0, color === 'white' ? 1 : -1);
}

function enPassantCaptureSquare(to: Square, color: Color): Square {
  const captured = offsetSquare(to, 0, color === 'white' ? -1 : 1);
  if (!captured) throw new Error('invalid en passant capture square');
  return captured;
}

function isFogCastlingMove(state: GameState, move: Move): boolean {
  const piece = state.board[move.from];
  const target = state.board[move.to];
  return !!piece
    && piece.role === 'king'
    && !!target
    && target.color === piece.color
    && target.role === 'rook'
    && state.castlingRights.includes(move.to);
}

function isEnPassantMove(state: GameState, move: Move, color: Color): boolean {
  const piece = state.board[move.from];
  return piece?.role === 'pawn'
    && piece.color === color
    && move.to === state.enPassantSquare
    && state.board[move.to] === undefined
    && fileOf(move.from) !== fileOf(move.to);
}

function applyFogCastling(board: Board, move: Move, king: NonNullable<Board[Square]>): void {
  const rook = board[move.to];
  if (!rook) return;

  const rank = rankOf(move.from);
  const kingSide = fileIndex(move.to) > fileIndex(move.from);
  const kingTo = `${kingSide ? 'g' : 'c'}${rank}` as Square;
  const rookTo = `${kingSide ? 'f' : 'd'}${rank}` as Square;
  delete board[move.to];
  board[kingTo] = king;
  board[rookTo] = rook;
}

function clearBetween(board: Board, from: Square, to: Square): boolean {
  const step = Math.sign(fileIndex(to) - fileIndex(from));
  for (let file = fileIndex(from) + step; file !== fileIndex(to); file += step) {
    if (board[`${boardFiles[file]}${rankOf(from)}` as Square]) return false;
  }
  return true;
}

function offsetSquare(square: Square, fileOffset: number, rankOffset: number): Square | undefined {
  const file = fileIndex(square) + fileOffset;
  const rank = rankOf(square) + rankOffset;
  if (file < 0 || file >= boardFiles.length) return undefined;
  if (!boardRanks.includes(rank as typeof boardRanks[number])) return undefined;
  return `${boardFiles[file]}${rank}` as Square;
}

function fileOf(square: Square): string {
  return square[0];
}

function fileIndex(square: Square): number {
  return boardFiles.indexOf(fileOf(square) as typeof boardFiles[number]);
}

function rankOf(square: Square): number {
  return Number(square[1]);
}

function oppositeColor(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}

export function variantForId(id: GameState['variant']): Variant {
  if (id === 'bid-for-white') return bidForWhiteVariant;
  if (id === 'fog-of-war') return fogOfWarVariant;
  return draft960Variant;
}
