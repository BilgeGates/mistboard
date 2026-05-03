import type { Board, Color, GameState, Move, PlayerView, Variant } from './types.js';

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

export const draft960Variant: Variant = {
  id: 'draft960',
  createInitialState(gameId: string): GameState {
    return {
      id: gameId,
      variant: 'draft960',
      board: initialBoard,
      status: { type: 'pregame' },
      moveNumber: 1,
    };
  },
  getLegalMoves(): Move[] {
    return [];
  },
  applyMove(state: GameState): GameState {
    return state;
  },
  getPlayerView(state: GameState, player: Color): PlayerView {
    return {
      id: state.id,
      variant: state.variant,
      board: state.board,
      visibleSquares: Object.keys(state.board) as PlayerView['visibleSquares'],
      status: state.status,
      perspective: player,
      moveNumber: state.moveNumber,
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
    };
  },
  getPlayerView(state: GameState, player: Color): PlayerView {
    const ownSquares = Object.entries(state.board)
      .filter(([, piece]) => piece?.color === player)
      .map(([square]) => square as keyof Board);
    const board: Board = {};
    for (const square of ownSquares) {
      board[square] = state.board[square];
    }
    return {
      id: state.id,
      variant: state.variant,
      board,
      visibleSquares: ownSquares as PlayerView['visibleSquares'],
      status: state.status,
      perspective: player,
      moveNumber: state.moveNumber,
    };
  },
};

