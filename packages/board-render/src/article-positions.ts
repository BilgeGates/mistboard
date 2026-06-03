// Article share-card / thumbnail fixtures, shared between two render paths:
//   • the article-list thumbnails in apps/web (articles-data.ts), and
//   • the per-article OG cards rendered server-side (apps/server/og-image.ts).
//
// Owning the positions here (rather than in the web bundle, which the server
// won't import) keeps the list thumbnail and the share card a single source of
// truth — they can't drift apart. The board fixtures the article *bodies* also
// use (CONE_QUEEN_BOARD, DISCOVERY_BOARD, DRAFT960_OFFER_A) are exported so the
// web file imports them back instead of keeping its own copies.

import { type Board, darkChessVariant, type GameState, type PieceRole } from '@mistboard/game';
import type { Color, Square } from '@mistboard/game';
import type { PieceOnBoard } from './board-svg.js';
import {
  boardToPieces,
  fogSquaresFromVisible,
  piecesToBoard,
  startingPositionFromBackRank,
} from './positions.js';

export type ArticleOgPosition = {
  pieces: PieceOnBoard[];
  fogSquares?: Square[];
  orientation?: Color;
};

function fogFor(state: GameState, player: Color): Square[] {
  return fogSquaresFromVisible(darkChessVariant.getPlayerView(state, player).visibleSquares);
}

// A static board with no clocks/history — enough for visibility + rendering.
// moveNumber is irrelevant to fog (visibility derives only from the board), so
// any playing-turn state yields the same thumbnail.
function demoState(id: string, board: Board): GameState {
  return {
    id,
    variant: 'dark-chess',
    board,
    status: { type: 'playing', turn: 'white' },
    moveNumber: 30,
    castlingRights: [],
    halfmoveClock: 0,
  };
}

// ── Shared board fixtures (also used in the article bodies) ───────────────────
export const DRAFT960_OFFER_A: PieceRole[] = [
  'knight',
  'knight',
  'rook',
  'king',
  'bishop',
  'queen',
  'rook',
  'bishop',
];

export const CONE_QUEEN_BOARD: Board = {
  e4: { color: 'white', role: 'queen' },
};

export const DISCOVERY_BOARD: Board = {
  g1: { color: 'white', role: 'king' },
  d1: { color: 'white', role: 'rook' },
  d3: { color: 'white', role: 'rook' },
  h7: { color: 'black', role: 'king' },
  b7: { color: 'black', role: 'queen' },
};

const DARK_CHESS_CONCEPTS_BOARD: Board = {
  g1: { color: 'white', role: 'king' },
  d5: { color: 'white', role: 'pawn' },
  h3: { color: 'white', role: 'bishop' },
  g8: { color: 'black', role: 'king' },
  c6: { color: 'black', role: 'pawn' },
  e6: { color: 'black', role: 'pawn' },
  c7: { color: 'black', role: 'knight' },
  d7: { color: 'black', role: 'rook' },
};

// ── Per-slug OG / thumbnail positions ─────────────────────────────────────────
const DARK_CHESS_START = darkChessVariant.createInitialState('dark-chess-rules-start');
const CONE_QUEEN = demoState('cone-queen', CONE_QUEEN_BOARD);
const DARK_CHESS_CONCEPTS = demoState('dark-chess-concepts-deduction', DARK_CHESS_CONCEPTS_BOARD);
const DRAFT960_START = demoState(
  'dark-draft960-start',
  piecesToBoard(startingPositionFromBackRank(DRAFT960_OFFER_A)),
);

export const ARTICLE_OG_POSITIONS: Record<string, ArticleOgPosition> = {
  'dark-chess': {
    pieces: boardToPieces(DARK_CHESS_START.board),
    fogSquares: fogFor(DARK_CHESS_START, 'white'),
    orientation: 'white',
  },
  'dark-chess-concepts': {
    pieces: boardToPieces(DARK_CHESS_CONCEPTS.board),
    fogSquares: fogFor(DARK_CHESS_CONCEPTS, 'white'),
    orientation: 'white',
  },
  'dark-draft960': {
    pieces: startingPositionFromBackRank(DRAFT960_OFFER_A),
    fogSquares: fogFor(DRAFT960_START, 'white'),
    orientation: 'white',
  },
  'server-enforced-fog': {
    pieces: boardToPieces(CONE_QUEEN_BOARD),
    fogSquares: fogFor(CONE_QUEEN, 'white'),
    orientation: 'white',
  },
};
