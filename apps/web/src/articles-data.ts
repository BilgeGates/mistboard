// Scaffolding for the three canonical articles. Each section's body is a
// placeholder pending the full draft per docs-private/articles-plan.md.
// Visual specs live in [VISUAL: ...] notes that should be replaced with
// rendered assets when sections are written.

import {
  type BoardSpec,
  type CompositionLayout,
  ARTICLE_OG_POSITIONS,
  boardToPieces,
  CONE_QUEEN_BOARD,
  DISCOVERY_BOARD,
  DRAFT960_OFFER_A,
  fogSquaresFromVisible,
  piecesToBoard,
  startingPositionFromBackRank,
} from '@mistboard/board-render';
import type { LiveBoardsOptions, SteppedBoardsOptions } from '@mistboard/board-render/interactive';
import {
  applyMove as applyXiangqiMove,
  createChess960CastlingRightsForSides,
  createChess960InitialBoardForSides,
  createInitialXiangqiState,
  computeVision as computeXiangqiVision,
  getPlayerView as getXiangqiPlayerView,
  darkChessVariant,
  squareOf as xiangqiSquareOf,
  type BackRankRole,
  type Board,
  type Chess960Start,
  type GameState,
  type PieceRole,
  type Square,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiPiece,
  type XiangqiPlayerView,
  type XiangqiSquare,
} from '@mistboard/game';
import articleSnapshotFog from './article-snapshot-fog.json' with { type: 'json' };
import articleSnapshotFogBlack from './article-snapshot-fog-black.json' with { type: 'json' };
import { renderXiangqiPiece } from './xiangqi-pieces.js';

export type ParagraphBlock = { kind: 'paragraph'; text: string };

export type SubHeadingBlock = { kind: 'sub-heading'; text: string };

// Inline SVG composition of 1, 2, or 3 boards. Renderer wraps the composer
// output in an <svg> with the given canvas dimensions and background.
export type StaticBoardsBlock = {
  kind: 'static-boards';
  layout: CompositionLayout;
  boards: BoardSpec[];
  canvasWidth: number;
  canvasHeight: number;
  boardSize: number;
  boardY: number;
  gap?: number;
  labelY?: number;
  labelFill?: string;
  labelFontSize?: number;
  labelLetterSpacing?: number;
  background?: string;
  caption?: string;
};

// Mount-point for a registered interactive widget. The renderer creates a
// container, applies the widget's mount function, and tracks the teardown.
// Widget kinds are added as their implementations land.
export type InteractiveBlock = {
  kind: 'interactive';
  widget: 'stepper';
  spec: SteppedBoardsOptions;
  caption?: string;
};

// Static chessground figure — one or more themed boards in a fixed layout,
// no stepping UI. Picks up the user's board palette and fog style from the
// live theme, same as the stepper widget. Use for snapshot illustrations.
export type LiveBoardsBlock = {
  kind: 'live-boards';
  spec: LiveBoardsOptions;
  caption?: string;
};

export type CtaButton = {
  label: string;
  href: string;
  emphasis?: 'primary' | 'secondary';
  external?: boolean;
};

export type CtaBlock = {
  kind: 'cta';
  buttons: CtaButton[];
};

// Raw inline SVG — for hand-coded diagrams (timelines, axis plots, family
// trees, etc.) that don't fit the board renderer. Author provides the
// complete <svg>...</svg> string; the renderer wraps it in a <figure>
// with an optional caption.
export type RawSvgBlock = {
  kind: 'raw-svg';
  svg: string;
  caption?: string;
};

export type RawSvgStepperStep = {
  svg: string;
  narrative?: string;
};

export type RawSvgStepperBlock = {
  kind: 'raw-svg-stepper';
  steps: RawSvgStepperStep[];
  caption?: string;
};

// Code/data block — for inline source snippets, captured payloads, or any
// monospace content. `text` is rendered verbatim inside <pre><code>; the
// renderer escapes it. Use `language` for syntax-highlighting hints (the
// current renderer just sets a data attribute; styling does the rest).
// `maxHeight` caps the visible region so very long payloads scroll
// instead of dominating the page.
export type CodeBlock = {
  kind: 'code';
  text: string;
  language?: string;
  caption?: string;
  maxHeight?: number;
};

export type ArticleBlock =
  | ParagraphBlock
  | SubHeadingBlock
  | StaticBoardsBlock
  | InteractiveBlock
  | LiveBoardsBlock
  | CtaBlock
  | RawSvgBlock
  | RawSvgStepperBlock
  | CodeBlock;

// `blocks` is the structured body. `paragraphs` is the legacy outline body
// that still carries `[VISUAL: ...]` markers — sections are migrated to
// `blocks` as they get their real visuals.
export type ArticleSection = {
  heading: string;
  paragraphs?: string[];
  blocks?: ArticleBlock[];
};

// Single-board art rendered on the articles index card. No labels, no
// caption — the card itself supplies title and summary. Use a position
// that reads at a glance: a clear fog pattern, a recognisable setup, or
// a moment from the article.
export type BoardArticleThumbnail = {
  kind?: 'board';
  pieces: BoardSpec['pieces'];
  fogSquares?: BoardSpec['fogSquares'];
  orientation?: BoardSpec['orientation'];
};

export type SvgArticleThumbnail = {
  kind: 'svg';
  svg: string;
};

export type ArticleThumbnail = BoardArticleThumbnail | SvgArticleThumbnail;

export type Article = {
  slug: string;
  kind: 'rules' | 'article';
  title: string;
  summary: string;
  showSummaryOnPage?: boolean;
  showInIndex?: boolean;
  status: 'outline' | 'draft' | 'published';
  audience: string;
  // ISO-8601 dates (YYYY-MM-DD). When present, rendered in the article meta.
  publishedAt?: string;
  updatedAt?: string;
  tldr?: string[];
  intro?: ArticleBlock[];
  thumbnail?: ArticleThumbnail;
  sections: ArticleSection[];
};

// Three distinct Chess960 back ranks per side for the Draft960 draft section.
// Each is valid (bishops on opposite-colored squares, king between rooks) and
// visually distinct. OFFER_A for both sides matches the actual D960 sample
// game's starting position (NNRKBQRB / RNQKBBRN) so the offer the reader sees
// in "The draft" is the same one that hits the board in "The starting
// position".
// DRAFT960_OFFER_A is shared with the article OG card (article-positions.ts).
const DRAFT960_OFFER_B: PieceRole[] = ['rook', 'knight', 'bishop', 'bishop', 'king', 'queen', 'knight', 'rook'];
const DRAFT960_OFFER_C: PieceRole[] = ['queen', 'rook', 'bishop', 'knight', 'knight', 'bishop', 'king', 'rook'];

const DRAFT960_BLACK_OFFER_A: PieceRole[] = ['rook', 'knight', 'queen', 'king', 'bishop', 'bishop', 'rook', 'knight'];
const DRAFT960_BLACK_OFFER_B: PieceRole[] = ['bishop', 'bishop', 'queen', 'knight', 'knight', 'rook', 'king', 'rook'];
const DRAFT960_BLACK_OFFER_C: PieceRole[] = ['knight', 'bishop', 'bishop', 'queen', 'rook', 'king', 'knight', 'rook'];

// Starting-position triptych for the Fog of War rules article. Visibility is
// derived from the canonical fog-of-war variant kernel so the diagram exactly
// matches what players see in a live game.
const DARK_CHESS_START_STATE = darkChessVariant.createInitialState('dark-chess-rules-start');
const DARK_CHESS_START_VIEW_W = darkChessVariant.getPlayerView(DARK_CHESS_START_STATE, 'white');
const DARK_CHESS_START_VIEW_B = darkChessVariant.getPlayerView(DARK_CHESS_START_STATE, 'black');
const DARK_CHESS_START_FOG_W = fogSquaresFromVisible(DARK_CHESS_START_VIEW_W.visibleSquares);
const DARK_CHESS_START_FOG_B = fogSquaresFromVisible(DARK_CHESS_START_VIEW_B.visibleSquares);

// Helper: derive the visibility complement for a player on a state.
function fogFor(state: GameState, player: 'white' | 'black'): Square[] {
  return fogSquaresFromVisible(darkChessVariant.getPlayerView(state, player).visibleSquares);
}

// Helper: apply a sequence of moves from a start state; returns all states
// including the start. states[0] = start, states[N] = after N-th move.
function replayMoves(
  start: GameState,
  moves: Array<{ from: Square; to: Square; promotion?: Exclude<PieceRole, 'king' | 'pawn'> }>,
): GameState[] {
  const states: GameState[] = [start];
  for (const move of moves) {
    states.push(darkChessVariant.applyMove(states[states.length - 1]!, move));
  }
  return states;
}

// ── Section 1: per-piece visibility cones ─────────────────────────────────
// Each demo is a near-empty board with only white pieces (the variant's
// visibility kernel doesn't require kings of either color for static
// rendering). Bishop demo uses two white bishops — one on a light square
// (e4) and one on a dark square (c3) — so the combined cones cover both
// colors and the color-locked nature of the piece is visible. Pawn demo
// uses five pawns on different files and ranks to show how vision differs
// by start-square: a rank-2 pawn sees two squares forward (single + double
// push), a moved pawn sees only one.
function coneState(id: string, board: Board): GameState {
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
const CONE_KNIGHT = coneState('cone-knight', {
  e4: { color: 'white', role: 'knight' },
  c5: { color: 'white', role: 'knight' },
});
const CONE_BISHOP = coneState('cone-bishop', {
  e4: { color: 'white', role: 'bishop' },
  c3: { color: 'white', role: 'bishop' },
});
const CONE_ROOK = coneState('cone-rook', {
  e4: { color: 'white', role: 'rook' },
  c6: { color: 'white', role: 'rook' },
});
const CONE_QUEEN = coneState('cone-queen', CONE_QUEEN_BOARD);
const CONE_PAWN = coneState('cone-pawn', {
  a2: { color: 'white', role: 'pawn' },
  b3: { color: 'white', role: 'pawn' },
  c2: { color: 'white', role: 'pawn' },
  d2: { color: 'white', role: 'pawn' },
  e4: { color: 'white', role: 'pawn' },
  f3: { color: 'white', role: 'pawn' },
  g3: { color: 'white', role: 'pawn' },
  h5: { color: 'white', role: 'pawn' },
});
const CONE_KING = coneState('cone-king', {
  e4: { color: 'white', role: 'king' },
});
const CONE_KNIGHT_FOG = fogFor(CONE_KNIGHT, 'white');
const CONE_BISHOP_FOG = fogFor(CONE_BISHOP, 'white');
const CONE_ROOK_FOG = fogFor(CONE_ROOK, 'white');
const CONE_QUEEN_FOG = fogFor(CONE_QUEEN, 'white');
const CONE_PAWN_FOG = fogFor(CONE_PAWN, 'white');
const CONE_KING_FOG = fogFor(CONE_KING, 'white');

// Basic movement diagrams for the chess primer.
const BASIC_KING = coneState('basic-chess-king', {
  e4: { color: 'white', role: 'king' },
});
const BASIC_QUEEN = coneState('basic-chess-queen', {
  e4: { color: 'white', role: 'queen' },
});
const BASIC_ROOK = coneState('basic-chess-rook', {
  e4: { color: 'white', role: 'rook' },
});
const BASIC_BISHOP = coneState('basic-chess-bishop', {
  e4: { color: 'white', role: 'bishop' },
});
const BASIC_KNIGHT = coneState('basic-chess-knight', {
  e4: { color: 'white', role: 'knight' },
});
const BASIC_PAWN = coneState('basic-chess-pawn', {
  e2: { color: 'white', role: 'pawn' },
  d3: { color: 'black', role: 'knight' },
  f3: { color: 'black', role: 'bishop' },
});
const BASIC_KING_TARGETS: Square[] = ['d3', 'e3', 'f3', 'd4', 'f4', 'd5', 'e5', 'f5'];
const BASIC_ROOK_TARGETS: Square[] = [
  'e1',
  'e2',
  'e3',
  'e5',
  'e6',
  'e7',
  'e8',
  'a4',
  'b4',
  'c4',
  'd4',
  'f4',
  'g4',
  'h4',
];
const BASIC_BISHOP_TARGETS: Square[] = [
  'b1',
  'c2',
  'd3',
  'f3',
  'g2',
  'h1',
  'a8',
  'b7',
  'c6',
  'd5',
  'f5',
  'g6',
  'h7',
];
const BASIC_QUEEN_TARGETS: Square[] = [...BASIC_ROOK_TARGETS, ...BASIC_BISHOP_TARGETS];
const BASIC_KNIGHT_TARGETS: Square[] = ['c3', 'c5', 'd2', 'd6', 'f2', 'f6', 'g3', 'g5'];
const BASIC_PAWN_TARGETS: Square[] = ['d3', 'e3', 'e4', 'f3'];

const BASIC_BLOCKERS = coneState('basic-chess-blockers', {
  e4: { color: 'white', role: 'rook' },
  e6: { color: 'white', role: 'pawn' },
  b4: { color: 'black', role: 'knight' },
  g4: { color: 'black', role: 'bishop' },
});
const BASIC_BLOCKER_TARGETS: Square[] = ['e1', 'e2', 'e3', 'a4', 'b4', 'c4', 'd4', 'f4', 'g4'];

const BASIC_CASTLE_BEFORE: Board = {
  e1: { color: 'white', role: 'king' },
  h1: { color: 'white', role: 'rook' },
};
const BASIC_CASTLE_AFTER: Board = {
  g1: { color: 'white', role: 'king' },
  f1: { color: 'white', role: 'rook' },
};
const BASIC_PROMOTION_BEFORE: Board = {
  e7: { color: 'white', role: 'pawn' },
  h8: { color: 'black', role: 'king' },
};
const BASIC_PROMOTION_AFTER: Board = {
  e8: { color: 'white', role: 'queen' },
  h8: { color: 'black', role: 'king' },
};
const BASIC_EN_PASSANT_BEFORE: Board = {
  e5: { color: 'white', role: 'pawn' },
  d5: { color: 'black', role: 'pawn' },
  h8: { color: 'black', role: 'king' },
};
const BASIC_EN_PASSANT_AFTER: Board = {
  d6: { color: 'white', role: 'pawn' },
  h8: { color: 'black', role: 'king' },
};

// ── Pawn capture visibility demo ─────────────────────────────────────────
// Pawns are the one piece whose "reach" differs between empty movement and
// capture. Empty diagonals stay fogged; occupied enemy diagonals appear.
const PAWN_CAPTURE_EXAMPLES = coneState('pawn-capture-examples', {
  a2: { color: 'white', role: 'pawn' },
  b2: { color: 'white', role: 'pawn' },
  c2: { color: 'white', role: 'pawn' },
  d3: { color: 'white', role: 'pawn' },
  e4: { color: 'white', role: 'pawn' },
  f5: { color: 'white', role: 'pawn' },
  g4: { color: 'white', role: 'pawn' },
  h2: { color: 'white', role: 'pawn' },
  a4: { color: 'black', role: 'pawn' },
  b4: { color: 'black', role: 'pawn' },
  c6: { color: 'black', role: 'pawn' },
  d5: { color: 'black', role: 'pawn' },
  e7: { color: 'black', role: 'pawn' },
  f7: { color: 'black', role: 'pawn' },
  g7: { color: 'black', role: 'pawn' },
  h5: { color: 'black', role: 'pawn' },
});
const PAWN_CAPTURE_EXAMPLES_FOG = fogFor(PAWN_CAPTURE_EXAMPLES, 'white');

// ── En passant demo ───────────────────────────────────────────────────────
// Four white pawns on the 5th rank, full black 7th rank. Black pushes
// b/d/f/h pawn two squares; white captures e.p. on three of them. The
// second push (after d7-d5) white passes with Kh1 — the e.p. window
// closes and the pushed pawn re-enters fog. The tail (a5/b7) shows white
// declining e.p. with a quiet push instead — legal, and lets the e.p.
// window close the same way Kh1 did.
const ENPASSANT_INITIAL_BOARD: Board = {
  g1: { color: 'white', role: 'king' },
  a5: { color: 'white', role: 'pawn' },
  c5: { color: 'white', role: 'pawn' },
  e5: { color: 'white', role: 'pawn' },
  g5: { color: 'white', role: 'pawn' },
  g8: { color: 'black', role: 'king' },
  a7: { color: 'black', role: 'pawn' },
  b7: { color: 'black', role: 'pawn' },
  c7: { color: 'black', role: 'pawn' },
  d7: { color: 'black', role: 'pawn' },
  e7: { color: 'black', role: 'pawn' },
  f7: { color: 'black', role: 'pawn' },
  g7: { color: 'black', role: 'pawn' },
  h7: { color: 'black', role: 'pawn' },
};
const ENPASSANT_INITIAL: GameState = {
  id: 'dark-chess-rules-enpassant',
  variant: 'dark-chess',
  board: ENPASSANT_INITIAL_BOARD,
  status: { type: 'playing', turn: 'black' },
  moveNumber: 30,
  castlingRights: [],
  halfmoveClock: 0,
};
const ENPASSANT_MOVES = [
  { from: 'b7' as Square, to: 'b5' as Square },  // 1...b5
  { from: 'a5' as Square, to: 'b6' as Square },  // 2. axb6 e.p.
  { from: 'd7' as Square, to: 'd5' as Square },  // 2...d5
  { from: 'g1' as Square, to: 'h1' as Square },  // 3. Kh1 — pass; e.p. window closes
  { from: 'f7' as Square, to: 'f5' as Square },  // 3...f5
  { from: 'e5' as Square, to: 'f6' as Square },  // 4. exf6 e.p.
  { from: 'h7' as Square, to: 'h5' as Square },  // 4...h5
  { from: 'g5' as Square, to: 'h6' as Square },  // 5. gxh6 e.p.
  { from: 'a7' as Square, to: 'a5' as Square },  // 5...a5
  { from: 'b6' as Square, to: 'b7' as Square },  // 6. b7 — quiet push, declines bxa6 e.p.
];
const ENPASSANT_STATES = replayMoves(ENPASSANT_INITIAL, ENPASSANT_MOVES);
const ENPASSANT_POSITIONS = ENPASSANT_STATES.map((state, i) => {
  // Frame 0 = initial (no prior move). Otherwise the move that produced
  // this state is at ENPASSANT_MOVES[i - 1].
  const lastMove = i === 0 ? undefined : ENPASSANT_MOVES[i - 1];
  const arrows = lastMove ? [{ orig: lastMove.from, dest: lastMove.to }] : undefined;
  // Per-frame call-outs: frame 2/11 (after 1...b5) names the b5/b6 e.p.
  // window; frame 5/11 (after 3.Kh1 passes) names the d5/d6 window that
  // just closed.
  const highlightSquares: Square[] =
    i === 1 ? ['b5', 'b6'] : i === 4 ? ['d5', 'd6'] : [];
  return {
    boards: [
      {
        board: state.board,
        fogSquares: fogFor(state, 'white'),
        orientation: 'white' as const,
        label: "WHITE'S VIEW",
        ...(highlightSquares.length ? { highlightSquares } : {}),
      },
      {
        board: state.board,
        orientation: 'white' as const,
        label: 'SERVER TRUTH',
        arrows,
      },
      {
        board: state.board,
        fogSquares: fogFor(state, 'black'),
        orientation: 'white' as const,
        label: "BLACK'S VIEW",
      },
    ],
  };
});

// ── Discovered visibility demo ────────────────────────────────────────────
// White rooks doubled on the d-file (d1 supports d3). White's d3 rook sees
// up the d-file but not across rank 7, so Black's king (h7) and queen (b7)
// sit in fog. White slides Rd3-d7 — the rook's new square reveals rank 7,
// and both black pieces appear in white's view at once. The d1 rook keeps
// the d-file in sight throughout. Demonstrates "moving a piece moves its
// sight": new squares enter visibility on the next half-move.
// DISCOVERY_BOARD is shared with the article OG card (article-positions.ts).
const DISCOVERY_BEFORE: GameState = {
  id: 'dark-chess-rules-discovery',
  variant: 'dark-chess',
  board: DISCOVERY_BOARD,
  status: { type: 'playing', turn: 'white' },
  moveNumber: 15,
  castlingRights: [],
  halfmoveClock: 0,
};
const DISCOVERY_FINAL = darkChessVariant.applyMove(DISCOVERY_BEFORE, { from: 'd3', to: 'd7' });
const DISCOVERY_BEFORE_FOG_W = fogFor(DISCOVERY_BEFORE, 'white');
const DISCOVERY_FINAL_FOG_W = fogFor(DISCOVERY_FINAL, 'white');

// ── Homepage engine sample: engine-v2-g0000 ───────────────────────────────
// One of the static replay samples used by the homepage hero loop. Mistboard
// Engine v2.0 plays White against v0.9.5; White wins by king capture on ply 89.
const ENGINE_SAMPLE_START = darkChessVariant.createInitialState('engine-v2-g0000');
const ENGINE_SAMPLE_STATES = replayMoves(ENGINE_SAMPLE_START, [
  { from: 'e2', to: 'e4' },  // 1.
  { from: 'e7', to: 'e6' },  // 1...
  { from: 'd2', to: 'd4' },  // 2.
  { from: 'f8', to: 'e7' },  // 2...
  { from: 'c1', to: 'f4' },  // 3.
  { from: 'd7', to: 'd6' },  // 3...
  { from: 'b1', to: 'c3' },  // 4.
  { from: 'c8', to: 'd7' },  // 4...
  { from: 'd4', to: 'd5' },  // 5.
  { from: 'e7', to: 'f6' },  // 5...
  { from: 'g1', to: 'h3' },  // 6.
  { from: 'g8', to: 'e7' },  // 6...
  { from: 'f4', to: 'e3' },  // 7.
  { from: 'e8', to: 'h8' },  // 7...
  { from: 'd1', to: 'd2' },  // 8.
  { from: 'c7', to: 'c5' },  // 8...
  { from: 'e1', to: 'a1' },  // 9.
  { from: 'd8', to: 'a5' },  // 9...
  { from: 'd5', to: 'e6' },  // 10.
  { from: 'f7', to: 'e6' },  // 10...
  { from: 'a2', to: 'a3' },  // 11.
  { from: 'd7', to: 'c6' },  // 11...
  { from: 'e3', to: 'f4' },  // 12.
  { from: 'f6', to: 'd4' },  // 12...
  { from: 'f4', to: 'g3' },  // 13.
  { from: 'b8', to: 'd7' },  // 13...
  { from: 'c1', to: 'b1' },  // 14.
  { from: 'a5', to: 'a6' },  // 14...
  { from: 'f1', to: 'a6' },  // 15.
  { from: 'b7', to: 'a6' },  // 15...
  { from: 'd2', to: 'd3' },  // 16.
  { from: 'a8', to: 'b8' },  // 16...
  { from: 'g3', to: 'd6' },  // 17.
  { from: 'b8', to: 'e8' },  // 17...
  { from: 'd6', to: 'f4' },  // 18.
  { from: 'e7', to: 'g6' },  // 18...
  { from: 'h1', to: 'g1' },  // 19.
  { from: 'g6', to: 'h4' },  // 19...
  { from: 'g1', to: 'e1' },  // 20.
  { from: 'g7', to: 'g5' },  // 20...
  { from: 'f4', to: 'g5' },  // 21.
  { from: 'h4', to: 'g6' },  // 21...
  { from: 'b1', to: 'c1' },  // 22.
  { from: 'e8', to: 'b8' },  // 22...
  { from: 'g5', to: 'e3' },  // 23.
  { from: 'd4', to: 'e5' },  // 23...
  { from: 'h3', to: 'g5' },  // 24.
  { from: 'g6', to: 'h4' },  // 24...
  { from: 'c1', to: 'b1' },  // 25.
  { from: 'f8', to: 'f7' },  // 25...
  { from: 'g5', to: 'f7' },  // 26.
  { from: 'g8', to: 'f7' },  // 26...
  { from: 'e1', to: 'g1' },  // 27.
  { from: 'b8', to: 'g8' },  // 27...
  { from: 'b1', to: 'a1' },  // 28.
  { from: 'f7', to: 'e7' },  // 28...
  { from: 'h2', to: 'h3' },  // 29.
  { from: 'h7', to: 'h6' },  // 29...
  { from: 'e3', to: 'c1' },  // 30.
  { from: 'a6', to: 'a5' },  // 30...
  { from: 'g2', to: 'g3' },  // 31.
  { from: 'h4', to: 'g6' },  // 31...
  { from: 'g1', to: 'e1' },  // 32.
  { from: 'e5', to: 'd4' },  // 32...
  { from: 'a3', to: 'a4' },  // 33.
  { from: 'g6', to: 'e5' },  // 33...
  { from: 'd3', to: 'd2' },  // 34.
  { from: 'g8', to: 'f8' },  // 34...
  { from: 'e1', to: 'f1' },  // 35.
  { from: 'd7', to: 'f6' },  // 35...
  { from: 'g3', to: 'g4' },  // 36.
  { from: 'f8', to: 'b8' },  // 36...
  { from: 'd2', to: 'e1' },  // 37.
  { from: 'h6', to: 'h5' },  // 37...
  { from: 'f2', to: 'f4' },  // 38.
  { from: 'e5', to: 'g6' },  // 38...
  { from: 'e4', to: 'e5' },  // 39.
  { from: 'f6', to: 'd7' },  // 39...
  { from: 'f4', to: 'f5' },  // 40.
  { from: 'g6', to: 'f8' },  // 40...
  { from: 'f5', to: 'e6' },  // 41.
  { from: 'b8', to: 'b3' },  // 41...
  { from: 'c1', to: 'g5' },  // 42.
  { from: 'e7', to: 'e8' },  // 42...
  { from: 'd1', to: 'd4' },  // 43.
  { from: 'd7', to: 'b6' },  // 43...
  { from: 'd4', to: 'd8' },  // 44.
  { from: 'e8', to: 'e7' },  // 44...
  { from: 'g5', to: 'e7' },  // 45.
]);

const ENGINE_SAMPLE_POSITIONS = ENGINE_SAMPLE_STATES.map((state) => {
  const arrows = state.lastMove ? [{ orig: state.lastMove.from, dest: state.lastMove.to }] : undefined;
  return {
    boards: [
      { board: state.board, fogSquares: fogFor(state, 'white'), orientation: 'white' as const, label: "WHITE'S VIEW" },
      { board: state.board, orientation: 'white' as const, label: 'SERVER TRUTH', arrows },
      { board: state.board, fogSquares: fogFor(state, 'black'), orientation: 'white' as const, label: "BLACK'S VIEW" },
    ],
  };
});

// ── Draft960 full game: room db07069c ────────────────────────────────────────
// White #700 nnrkbqrb: a1=N b1=N c1=R d1=K e1=B f1=Q g1=R h1=B
// Black #626 rnqkbbrn: a8=R b8=N c8=Q d8=K e8=B f8=B g8=R h8=N
const D960_W: Chess960Start = {
  id: 700,
  backRank: ['knight', 'knight', 'rook', 'king', 'bishop', 'queen', 'rook', 'bishop'] as BackRankRole[],
  fenPlacement: 'nnrkbqrb',
};
const D960_B: Chess960Start = {
  id: 626,
  backRank: ['rook', 'knight', 'queen', 'king', 'bishop', 'bishop', 'rook', 'knight'] as BackRankRole[],
  fenPlacement: 'rnqkbbrn',
};
const D960_REVEAL_S0: GameState = {
  id: 'draft960-reveal',
  variant: 'dark-chess',
  board: createChess960InitialBoardForSides(D960_W, D960_B),
  status: { type: 'playing', turn: 'white' },
  moveNumber: 1,
  castlingRights: createChess960CastlingRightsForSides(D960_W, D960_B),
  halfmoveClock: 0,
};

const D960_FULL_STATES = replayMoves(D960_REVEAL_S0, [
  { from: 'e2', to: 'e4' },                        // 1. e4
  { from: 'h8', to: 'g6' },                        // 1...Nhg6 ← h8 KNIGHT reveal
  { from: 'f2', to: 'f3' },                        // 2. f3
  { from: 'a7', to: 'a5' },                        // 2...a5
  { from: 'e1', to: 'f2' },                        // 3. Be1f2 ← e1 BISHOP reveal
  { from: 'a5', to: 'a4' },                        // 3...a4
  { from: 'b1', to: 'c3' },                        // 4. Nc3
  { from: 'f7', to: 'f6' },                        // 4...f6
  { from: 'd2', to: 'd4' },                        // 5. d4
  { from: 'e8', to: 'f7' },                        // 5...Bef7 ← e8 BISHOP reveal
  { from: 'd1', to: 'c1' },                        // 6. O-O-O ← d1 KING reveals via castling
  { from: 'e7', to: 'e5' },                        // 6...e5
  { from: 'd4', to: 'd5' },                        // 7. d5
  { from: 'f8', to: 'd6' },                        // 7...Bfd6 ← f8 BISHOP reveal
  { from: 'g2', to: 'g4' },                        // 8. g4
  { from: 'd8', to: 'g8' },                        // 8...O-O ← d8 KING reveals via castling
  { from: 'c3', to: 'e2' },                        // 9. Ne2
  { from: 'c7', to: 'c6' },                        // 9...c6
  { from: 'd5', to: 'c6' },                        // 10. dxc6
  { from: 'd7', to: 'c6' },                        // 10...dxc6
  { from: 'e2', to: 'g3' },                        // 11. Ng3
  { from: 'd6', to: 'c7' },                        // 11...Bc7
  { from: 'h2', to: 'h4' },                        // 12. h4
  { from: 'g6', to: 'e7' },                        // 12...Ne7
  { from: 'f3', to: 'f4' },                        // 13. f4
  { from: 'e5', to: 'f4' },                        // 13...exf4
  { from: 'g3', to: 'e2' },                        // 14. Ne2
  { from: 'g7', to: 'g5' },                        // 14...g5
  { from: 'h4', to: 'g5' },                        // 15. hxg5
  { from: 'f6', to: 'g5' },                        // 15...fxg5
  { from: 'h1', to: 'f3' },                        // 16. Bhf3 ← h1 BISHOP reveal
  { from: 'f7', to: 'g6' },                        // 16...Bg6
  { from: 'c2', to: 'c3' },                        // 17. c3
  { from: 'b8', to: 'd7' },                        // 17...Nbd7 ← b8 KNIGHT reveal
  { from: 'a1', to: 'c2' },                        // 18. Na1c2 ← a1 KNIGHT reveal
  { from: 'd7', to: 'e5' },                        // 18...Ne5
  { from: 'c1', to: 'b1' },                        // 19. Kb1
  { from: 'e5', to: 'f3' },                        // 19...Nxf3
  { from: 'g1', to: 'h1' },                        // 20. Rh1
  { from: 'f3', to: 'e5' },                        // 20...Ne5
  { from: 'f2', to: 'c5' },                        // 21. Bc5
  { from: 'c8', to: 'e6' },                        // 21...Qe6 ← c8 QUEEN reveal
  { from: 'c5', to: 'e7' },                        // 22. Bxe7
  { from: 'e6', to: 'e7' },                        // 22...Qxe7
  { from: 'e2', to: 'd4' },                        // 23. Nd4
  { from: 'f4', to: 'f3' },                        // 23...f3
  { from: 'c2', to: 'b4' },                        // 24. Nb4
  { from: 'e7', to: 'b4' },                        // 24...Qxb4
  { from: 'c3', to: 'b4' },                        // 25. cxb4
  { from: 'f3', to: 'f2' },                        // 25...f2
  { from: 'h1', to: 'h2' },                        // 26. Rh2
  { from: 'e5', to: 'g4' },                        // 26...Ng4
  { from: 'h2', to: 'g2' },                        // 27. Rg2
  { from: 'g4', to: 'e3' },                        // 27...Ne3
  { from: 'd1', to: 'd2' },                        // 28. Rd2
  { from: 'e3', to: 'g2' },                        // 28...Nxg2
  { from: 'f1', to: 'g2' },                        // 29. Qxg2
  { from: 'f2', to: 'f1', promotion: 'queen' },    // 29...f1=Q ← PROMOTION
  { from: 'g2', to: 'f1' },                        // 30. Qxf1
  { from: 'f8', to: 'f1' },                        // 30...Rxf1 (castled rook)
  { from: 'b1', to: 'c2' },                        // 31. Kc2
  { from: 'a8', to: 'e8' },                        // 31...Re8
  { from: 'd4', to: 'c6' },                        // 32. Nc6
  { from: 'b7', to: 'c6' },                        // 32...bxc6
  { from: 'd2', to: 'd8' },                        // 33. Rd8+
  { from: 'e8', to: 'd8' },                        // 33...Rxd8
  { from: 'c2', to: 'd3' },                        // 34. Kd3
  { from: 'd8', to: 'd3' },                        // 34...Rxd3# ← KING CAPTURED
]);

// Narratives: empty strings use auto-label; notable moments get annotations.
const D960_NARRATIVES: string[] = [
  "Both players have picked. White chose NNRKBQRB — knights on a1 and b1, king on d1, bishop on e1. Black chose RNQKBBRN — queen on c8, king on d8, knight on h8. Neither player can see the other's back rank.",
  "1.e4. Standard-looking first move. Nothing unusual yet.",
  "1...h8–g6. Something on h8 jumps to g6. Only a knight moves in an L-shape. In standard chess, h8 is a rook — rooks can't jump. Black's h8 has a knight.",
  "2.f3. White's f-pawn advances, clearing f2.",
  "2...a5. Black pushes the a-pawn.",
  "3.Be1–f2. A piece slides from e1 to f2. In standard chess, e1 is the king — kings don't go to f2 on move 3. This is a bishop. White has a bishop on e1.",
  "3...a4. Black's a-pawn keeps advancing.",
  "4.Nc3. White's b1 knight develops — same square as standard chess.",
  "4...f6. Black pushes the f-pawn.",
  "5.d4. White plays d4.",
  "5...Be8–f7. Black's e8 piece slides to f7 diagonally. Standard chess puts a king on e8 — Black has a bishop there.",
  "6.O-O-O. White castles queenside. The king was on d1; it ends on c1, the rook moves to d1. Non-standard king square revealed through castling.",
  "6...e5. Black's e-pawn advances.",
  "7.d5. White pushes the d-pawn.",
  "7...Bf8–d6. Black's f8 piece goes to d6 diagonally — a bishop. Standard chess also has a bishop on f8, so no surprise here.",
  "8.g4. White's g-pawn advances.",
  "8...O-O. Black castles kingside. The king was on d8; it ends on g8, the rook moves to f8. Non-standard king square revealed.",
  "9.Ne2. White's knight retreats.",
  "9...c6. Black challenges White's pawn chain.",
  "10.dxc6. White captures.",
  "10...dxc6. Black recaptures with the d-pawn.",
  "11.Ng3. Knight moves to g3.",
  "11...Bc7. Black's bishop retreats.",
  "12.h4. White pushes the h-pawn.",
  "12...Ne7. Black's knight repositions.",
  "13.f4. White's f-pawn advances.",
  "13...exf4. Black captures.",
  "14.Ne2. Knight retreats.",
  "14...g5. Black's g-pawn advances.",
  "15.hxg5. White captures on g5.",
  "15...fxg5. Black recaptures.",
  "16.Bh1–f3. White's h1 piece goes to f3 diagonally. Standard chess also has a bishop on h1 in some openings — but White's h1 was definitely a bishop in this setup.",
  "16...Bg6. Black's bishop moves.",
  "17.c3. White's c-pawn advances.",
  "17...Nb8–d7. Black's b8 piece jumps to d7 — a knight. Standard chess also has a knight on b8.",
  "18.Na1–c2. White's a1 piece jumps to c2 — a knight. Standard chess has a rook on a1. White's a1 has a knight.",
  "18...Ne5. Black's knight centralizes.",
  "19.Kb1. White's king steps to b1.",
  "19...Nxf3. Black's knight captures.",
  "20.Rh1. White's rook moves.",
  "20...Ne5. Black's knight returns.",
  "21.Bc5. White's bishop moves to c5.",
  "21...Qc8–e6. Black's c8 piece moves to e6 along a diagonal — a queen. Standard chess has a bishop on c8. Black has a queen there.",
  "22.Bxe7. White captures.",
  "22...Qxe7. Black recaptures with the queen.",
  "23.Nd4. White's knight goes to d4.",
  "23...f3. Black's pawn advances.",
  "24.Nb4. White's knight jumps.",
  "24...Qxb4. Black's queen captures.",
  "25.cxb4. White's pawn recaptures.",
  "25...f2. Black's pawn reaches f2.",
  "26.Rh2. White's rook moves.",
  "26...Ng4. Black's knight goes to g4.",
  "27.Rg2. White's rook slides.",
  "27...Ne3. Black's knight forks.",
  "28.Rd2. White's rook moves.",
  "28...Nxg2. Black's knight captures the rook.",
  "29.Qxg2. White's queen recaptures.",
  "29...f1=Q. Black's pawn promotes to queen.",
  "30.Qxf1. White captures the new queen.",
  "30...Rxf1. Black's rook recaptures.",
  "31.Kc2. White's king steps forward.",
  "31...Re8. Black's rook activates.",
  "32.Nc6. White's knight attacks.",
  "32...bxc6. Black's pawn captures.",
  "33.Rd8+. White's rook checks.",
  "33...Rxd8. Black's rook captures.",
  "34.Kd3. White's king walks into the open.",
  "34...Rxd3. Black's rook captures the king. Game over.",
];

const D960_FULL_POSITIONS = D960_FULL_STATES.map((state, i) => {
  const isLast = i === D960_FULL_STATES.length - 1;
  return {
    ...(isLast ? { outcome: { headline: 'Black wins', reason: 'king captured', tone: 'win' as const } } : {}),
    boards: [
      { board: state.board, fogSquares: fogFor(state, 'white'), orientation: 'white' as const, label: "WHITE'S VIEW" },
      { board: state.board, orientation: 'white' as const, label: 'SERVER TRUTH' },
      { board: state.board, fogSquares: fogFor(state, 'black'), orientation: 'white' as const, label: "BLACK'S VIEW" },
    ],
  };
});

// Fog for the draft-section offer boards. White's offers fog the top half;
// black's offers fog the bottom half so each side's view mirrors the other.
const PICK_SCREEN_FOG: Square[] = [
  'a5', 'b5', 'c5', 'd5', 'e5', 'f5', 'g5', 'h5',
  'a6', 'b6', 'c6', 'd6', 'e6', 'f6', 'g6', 'h6',
  'a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7',
  'a8', 'b8', 'c8', 'd8', 'e8', 'f8', 'g8', 'h8',
];

const BLACK_PICK_SCREEN_FOG: Square[] = [
  'a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1',
  'a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2',
  'a3', 'b3', 'c3', 'd3', 'e3', 'f3', 'g3', 'h3',
  'a4', 'b4', 'c4', 'd4', 'e4', 'f4', 'g4', 'h4',
];

// ── Win-condition demo: vs-brian-game-3 final plies ──────────────────────────
// Brian (Black) vs production tier-1 engine (White), bakeoff PvE match. The
// engine's king walks Kf1→Ke1 with a black queen lurking unseen on e5 (it
// captured there four moves earlier); Qxe1 ends the game. Real game
// illustrating the canonical FoW failure mode: a king walking onto a file
// occupied by an opposing slider that sat outside the king's vision.
const VS_BRIAN_3_START = darkChessVariant.createInitialState('vs-brian-game-3');
const VS_BRIAN_3_STATES = replayMoves(VS_BRIAN_3_START, [
  { from: 'e2', to: 'e3' },
  { from: 'e7', to: 'e6' },
  { from: 'f1', to: 'e2' },
  { from: 'g8', to: 'f6' },
  { from: 'd2', to: 'd3' },
  { from: 'f8', to: 'e7' },
  { from: 'c1', to: 'd2' },
  { from: 'c7', to: 'c6' },
  { from: 'd3', to: 'd4' },
  { from: 'd7', to: 'd5' },
  { from: 'e2', to: 'd3' },
  { from: 'b8', to: 'd7' },
  { from: 'g1', to: 'e2' },
  { from: 'd7', to: 'b6' },
  { from: 'e1', to: 'h1' },  // 15. O-O (king e1 → h1 notation)
  { from: 'e7', to: 'd6' },
  { from: 'e2', to: 'g3' },
  { from: 'h7', to: 'h5' },
  { from: 'e3', to: 'e4' },
  { from: 'h5', to: 'h4' },
  { from: 'g3', to: 'e2' },
  { from: 'd5', to: 'e4' },
  { from: 'd3', to: 'e4' },
  { from: 'f6', to: 'e4' },
  { from: 'e2', to: 'f4' },
  { from: 'g7', to: 'g5' },
  { from: 'f1', to: 'e1' },
  { from: 'g5', to: 'f4' },
  { from: 'e1', to: 'e4' },
  { from: 'd8', to: 'f6' },
  { from: 'd1', to: 'e2' },
  { from: 'c8', to: 'd7' },
  { from: 'd4', to: 'd5' },
  { from: 'c6', to: 'd5' },
  { from: 'e4', to: 'b4' },
  { from: 'd6', to: 'b4' },
  { from: 'd2', to: 'b4' },
  { from: 'a8', to: 'c8' },
  { from: 'e2', to: 'f3' },
  { from: 'a7', to: 'a6' },
  { from: 'b1', to: 'd2' },
  { from: 'd7', to: 'b5' },
  { from: 'a1', to: 'e1' },
  { from: 'e8', to: 'd7' },
  { from: 'b4', to: 'c5' },
  { from: 'c8', to: 'c6' },
  { from: 'c2', to: 'c4' },
  { from: 'b6', to: 'c4' },
  { from: 'd2', to: 'c4' },
  { from: 'b5', to: 'c4' },
  { from: 'e1', to: 'e6' },
  { from: 'f7', to: 'e6' },
  { from: 'f3', to: 'd5' },
  { from: 'c4', to: 'd5' },
  { from: 'c5', to: 'd4' },
  { from: 'e6', to: 'e5' },
  { from: 'd4', to: 'e5' },
  { from: 'f6', to: 'e5' },
  { from: 'g1', to: 'f1' },
  { from: 'h8', to: 'g8' },
  { from: 'f1', to: 'e1' },  // 61. Ke1 — the fatal step onto the open e-file
  { from: 'e5', to: 'e1' },  // 62. Rxe1 — king captured
]);

// ── Win-condition demo: 13-ply game where white wins via bishop ────────────
// Production tier1 (White) plays Bf1-b5, eyeing the long diagonal to e8.
// Black, drawn to a material capture, plays dxe4 — that move persists into
// the final frame (the e4 pawn is gone). White ignores the captured pawn
// and plays Bxe8, taking the king on its starting square. Rendered as a
// triptych stepper (BLACK + SERVER + WHITE) so the reader can compare what
// each side saw at each of the three key moves.
const WHITE_BISHOP_WIN_START = darkChessVariant.createInitialState('white-bishop-win');
const WHITE_BISHOP_WIN_STATES = replayMoves(WHITE_BISHOP_WIN_START, [
  { from: 'e2', to: 'e4' },
  { from: 'b7', to: 'b6' },
  { from: 'b1', to: 'c3' },
  { from: 'c7', to: 'c5' },
  { from: 'd2', to: 'd4' },
  { from: 'e7', to: 'e6' },
  { from: 'd4', to: 'c5' },
  { from: 'b6', to: 'c5' },
  { from: 'g1', to: 'f3' },
  { from: 'd7', to: 'd5' },
  { from: 'f1', to: 'b5' },  // 11. Bb5 — bishop on the long diagonal
  { from: 'd5', to: 'e4' },  // 12. ...dxe4 — black grabs the e4 pawn
  { from: 'b5', to: 'e8' },  // 13. Bxe8 — king captured on its starting square
]);
// Frame 2 (after 11. Bb5) gets a red circle on e8 to call out that the bishop
// is now eyeing the king's starting square through a clear diagonal.
type WinShape = { orig: Square; dest?: Square; brush?: 'red' | 'green' };
const WHITE_BISHOP_WIN_POSITIONS = [
  { stateIdx: 10, shapes: [] as WinShape[] },
  {
    stateIdx: 11,
    shapes: [
      { orig: 'f1' as Square, dest: 'b5' as Square },
      { orig: 'e8' as Square, brush: 'red' as const },
    ] as WinShape[],
  },
  { stateIdx: 12, shapes: [{ orig: 'd5' as Square, dest: 'e4' as Square }] as WinShape[] },
  { stateIdx: 13, shapes: [{ orig: 'b5' as Square, dest: 'e8' as Square }] as WinShape[] },
].map(({ stateIdx, shapes }) => {
  const state = WHITE_BISHOP_WIN_STATES[stateIdx]!;
  return {
    boards: [
      {
        board: state.board,
        fogSquares: fogFor(state, 'white'),
        orientation: 'white' as const,
        label: "WHITE'S VIEW",
      },
      {
        board: state.board,
        orientation: 'white' as const,
        label: 'SERVER TRUTH',
        arrows: shapes.length ? shapes : undefined,
      },
      {
        board: state.board,
        fogSquares: fogFor(state, 'black'),
        orientation: 'white' as const,
        label: "BLACK'S VIEW",
      },
    ],
  };
});

// ── Castling triple-threat ──────────────────────────────────────────────────
// Kingside castling that is simultaneously out of, through, and into check.
// Black's knight on f3 covers e1 (out of) and g1 (into); black's bishop on a6
// covers f1 (through) along the a6-f1 diagonal. In FoW none of these matter —
// castling has no check restrictions. White castles, the king lands on g1,
// and Black's knight captures it on the next move.
//
// White visibility is set up so neither attacker is in sight: no e2/f2/g2
// pawns means no diagonal-capture vision onto f3, and a6 is far outside
// white's rank-1 line.
// PRE state: White knight is still on e4, about to jump to f6. Frame 1 of
// the stepper. After White plays Ne4-f6, the position becomes
// CASTLE_TRIPLE_BEFORE. Mirrored from the symmetric setup so that the
// reader views from White's perspective and Black is the side castling
// into the threat.
const CASTLE_TRIPLE_PRE_BOARD: Board = {
  // Black: castling side
  e8: { color: 'black', role: 'king' },
  h8: { color: 'black', role: 'rook' },
  // White: attacking side
  a3: { color: 'white', role: 'bishop' },
  b1: { color: 'white', role: 'king' },
  e4: { color: 'white', role: 'knight' },
};
const CASTLE_TRIPLE_PRE: GameState = {
  id: 'dark-chess-rules-castle-triple',
  variant: 'dark-chess',
  board: CASTLE_TRIPLE_PRE_BOARD,
  status: { type: 'playing', turn: 'white' },
  moveNumber: 20,
  castlingRights: ['a8', 'h8'],
  halfmoveClock: 0,
};
// White plays Ne4-f6, landing the threat on e8/f8/g8. Then Black castles
// kingside; then White's knight captures the king on g8.
const CASTLE_TRIPLE_BEFORE = darkChessVariant.applyMove(CASTLE_TRIPLE_PRE, { from: 'e4', to: 'f6' });
const CASTLE_TRIPLE_AFTER = darkChessVariant.applyMove(CASTLE_TRIPLE_BEFORE, { from: 'e8', to: 'h8' });
const CASTLE_TRIPLE_FINAL = darkChessVariant.applyMove(CASTLE_TRIPLE_AFTER, { from: 'f6', to: 'g8' });
const CASTLE_TRIPLE_PRE_FOG_W = fogFor(CASTLE_TRIPLE_PRE, 'white');
const CASTLE_TRIPLE_PRE_FOG_B = fogFor(CASTLE_TRIPLE_PRE, 'black');
const CASTLE_TRIPLE_BEFORE_FOG_W = fogFor(CASTLE_TRIPLE_BEFORE, 'white');
const CASTLE_TRIPLE_AFTER_FOG_W = fogFor(CASTLE_TRIPLE_AFTER, 'white');
const CASTLE_TRIPLE_FINAL_FOG_W = fogFor(CASTLE_TRIPLE_FINAL, 'white');
const CASTLE_TRIPLE_BEFORE_FOG_B = fogFor(CASTLE_TRIPLE_BEFORE, 'black');
const CASTLE_TRIPLE_AFTER_FOG_B = fogFor(CASTLE_TRIPLE_AFTER, 'black');
const CASTLE_TRIPLE_FINAL_FOG_B = fogFor(CASTLE_TRIPLE_FINAL, 'black');

// ── Deduction: pawn that can't push ─────────────────────────────────────────
// Two single-board comparisons. A pawn always sees the square in front of it
// — unless something occupies that square. Fog directly ahead of a pawn is
// the simplest deduction available.
const DEDUCE_PAWN_OPEN = coneState('deduction-pawn-open', {
  e4: { color: 'white', role: 'pawn' },
});
const DEDUCE_PAWN_BLOCKED = coneState('deduction-pawn-blocked', {
  e4: { color: 'white', role: 'pawn' },
  e5: { color: 'black', role: 'knight' },
});
const DEDUCE_PAWN_OPEN_FOG = fogFor(DEDUCE_PAWN_OPEN, 'white');
const DEDUCE_PAWN_BLOCKED_FOG = fogFor(DEDUCE_PAWN_BLOCKED, 'white');

// ── Deduction: a square that flips to fog (1.d4 e6 2.Nf3 Bb4) ──────────────
// After 2...Bb4, square b4 — previously visible to White via b2's two-square
// push — falls to fog. With c3 and d2 both visible empty, the b4-e1 diagonal
// is open and the king is one move from capture.
const DEDUCE_BB4_START = darkChessVariant.createInitialState('deduction-bb4');
const DEDUCE_BB4_STATES = replayMoves(DEDUCE_BB4_START, [
  { from: 'd2', to: 'd4' },
  { from: 'e7', to: 'e6' },
  { from: 'g1', to: 'f3' },
  { from: 'f8', to: 'b4' },
]);
const DEDUCE_BB4_POSITIONS = DEDUCE_BB4_STATES.map((state, i) => {
  const arrows = state.lastMove ? [{ orig: state.lastMove.from, dest: state.lastMove.to }] : undefined;
  const isFinal = i === DEDUCE_BB4_STATES.length - 1;
  const whiteView = {
    board: state.board,
    fogSquares: fogFor(state, 'white'),
    orientation: 'white' as const,
    label: "WHITE'S VIEW",
    ...(isFinal ? { highlightSquares: ['b4' as Square] } : {}),
  };
  return {
    boards: [
      whiteView,
      { board: state.board, orientation: 'white' as const, label: 'SERVER TRUTH', arrows },
      { board: state.board, fogSquares: fogFor(state, 'black'), orientation: 'white' as const, label: "BLACK'S VIEW" },
    ],
  };
});

// ── Deduction: a sight line names the capturer ────────────────────────────
// White pawn on d5; Black pawns on c6 and e6 both attack it. White's bishop
// on h3 keeps e6 in view via the h3-c8 diagonal. After 1...exd5, White's
// pawn vanishes AND the bishop sees e6 fall empty — the e-pawn moved, so
// White can name the capturer. Without the bishop, the capture square goes
// to fog and either candidate could have taken.
const DEDUCE_RECAP_BEFORE: GameState = {
  id: 'deduction-capturer',
  variant: 'dark-chess',
  board: {
    g1: { color: 'white', role: 'king' },
    d5: { color: 'white', role: 'pawn' },
    h3: { color: 'white', role: 'bishop' },
    g8: { color: 'black', role: 'king' },
    c6: { color: 'black', role: 'pawn' },
    e6: { color: 'black', role: 'pawn' },
    c7: { color: 'black', role: 'knight' },
    d7: { color: 'black', role: 'rook' },
  },
  status: { type: 'playing', turn: 'black' },
  moveNumber: 20,
  castlingRights: [],
  halfmoveClock: 0,
};
const DEDUCE_RECAP_AFTER = darkChessVariant.applyMove(DEDUCE_RECAP_BEFORE, { from: 'e6', to: 'd5' });
const DEDUCE_RECAP_POSITIONS = [DEDUCE_RECAP_BEFORE, DEDUCE_RECAP_AFTER].map((state) => {
  const arrows = state.lastMove ? [{ orig: state.lastMove.from, dest: state.lastMove.to }] : undefined;
  return {
    boards: [
      { board: state.board, fogSquares: fogFor(state, 'white'), orientation: 'white' as const, label: "WHITE'S VIEW" },
      { board: state.board, orientation: 'white' as const, label: 'SERVER TRUTH', arrows },
      { board: state.board, fogSquares: fogFor(state, 'black'), orientation: 'white' as const, label: "BLACK'S VIEW" },
    ],
  };
});

// Companion to DEDUCE_RECAP_*: same position minus the bishop on h3. Used
// to show the "without a sight line" case — White sees the d5 pawn vanish
// but can't tell which Black pawn took.
const DEDUCE_RECAP_NB_BEFORE: GameState = {
  id: 'deduction-capturer-no-bishop',
  variant: 'dark-chess',
  board: {
    g1: { color: 'white', role: 'king' },
    d5: { color: 'white', role: 'pawn' },
    g8: { color: 'black', role: 'king' },
    c6: { color: 'black', role: 'pawn' },
    e6: { color: 'black', role: 'pawn' },
    c7: { color: 'black', role: 'knight' },
    d7: { color: 'black', role: 'rook' },
  },
  status: { type: 'playing', turn: 'black' },
  moveNumber: 20,
  castlingRights: [],
  halfmoveClock: 0,
};
const DEDUCE_RECAP_NB_AFTER = darkChessVariant.applyMove(DEDUCE_RECAP_NB_BEFORE, { from: 'e6', to: 'd5' });
const DEDUCE_RECAP_NB_POSITIONS = [DEDUCE_RECAP_NB_BEFORE, DEDUCE_RECAP_NB_AFTER].map((state) => {
  const arrows = state.lastMove ? [{ orig: state.lastMove.from, dest: state.lastMove.to }] : undefined;
  return {
    boards: [
      { board: state.board, fogSquares: fogFor(state, 'white'), orientation: 'white' as const, label: "WHITE'S VIEW" },
      { board: state.board, orientation: 'white' as const, label: 'SERVER TRUTH', arrows },
      { board: state.board, fogSquares: fogFor(state, 'black'), orientation: 'white' as const, label: "BLACK'S VIEW" },
    ],
  };
});

// A second capture-deduction pattern: a pawn behind the captured pawn can later
// prove what did not capture. If the black e6-pawn took on d5, d5 would stay
// blocked in front of White's d4 pawn. When the hidden piece leaves and d5
// becomes visible empty, White can rule out the pawn capture and identify the
// mobile knight as the capturer.
const DEDUCE_BACK_PAWN_START: GameState = {
  id: 'deduction-back-pawn-capturer',
  variant: 'dark-chess',
  board: {
    g1: { color: 'white', role: 'king' },
    d5: { color: 'white', role: 'pawn' },
    d4: { color: 'white', role: 'pawn' },
    g8: { color: 'black', role: 'king' },
    e6: { color: 'black', role: 'pawn' },
    f6: { color: 'black', role: 'knight' },
  },
  status: { type: 'playing', turn: 'black' },
  moveNumber: 24,
  castlingRights: [],
  halfmoveClock: 0,
};
const DEDUCE_BACK_PAWN_STATES = replayMoves(DEDUCE_BACK_PAWN_START, [
  { from: 'f6', to: 'd5' },
  { from: 'g1', to: 'h1' },
  { from: 'd5', to: 'f4' },
]);
const DEDUCE_BACK_PAWN_POSITIONS = DEDUCE_BACK_PAWN_STATES.map((state, i) => {
  const arrows = state.lastMove ? [{ orig: state.lastMove.from, dest: state.lastMove.to }] : undefined;
  const highlightSquares = i === DEDUCE_BACK_PAWN_STATES.length - 1 ? ['d5' as Square] : undefined;
  return {
    boards: [
      { board: state.board, fogSquares: fogFor(state, 'white'), orientation: 'white' as const, label: "WHITE'S VIEW", highlightSquares },
      { board: state.board, orientation: 'white' as const, label: 'SERVER TRUTH', arrows },
      { board: state.board, fogSquares: fogFor(state, 'black'), orientation: 'white' as const, label: "BLACK'S VIEW" },
    ],
  };
});

// Pre-stringified captured WS frame for the server-enforced-fog article.
// The full snapshot artifact is retained for board data and export/debug
// purposes. The article itself shows a smaller steady-state payload sample
// because snapshots intentionally include filtered replay events.
// Compact a pretty-printed JSON string so the wire-payload blocks stay
// verbatim but take far less vertical space: collapse two-field leaf objects
// ({color,role}, {from,to}, {black,white}) onto one line, and fold the long
// square list and move list into a single line each.
function compactJsonLeaves(json: string): string {
  return json
    .replace(/\{\s*"color": ("[^"]*"),\s*"role": ("[^"]*")\s*\}/g, '{ "color": $1, "role": $2 }')
    .replace(/\{\s*"from": ("[^"]*"),\s*"to": ("[^"]*")\s*\}/g, '{ "from": $1, "to": $2 }')
    .replace(/\{\s*"black": (\d+),\s*"white": (\d+)\s*\}/g, '{ "black": $1, "white": $2 }')
    .replace(/\[\s*(?:"[^"]*",?\s*)+\]/g, (m) => m.replace(/\s+/g, ' ').replace(/\[ /, '[').replace(/ \]/, ']'))
    .replace(/\[\s*(?:\{ "from":[^\n]*\},?\s*)+\]/g, (m) => m.replace(/\s*\n\s*/g, ' '));
}
const SERVER_FOG_SNAPSHOT_JSON_TEXT = compactJsonLeaves(JSON.stringify(articleSnapshotFog, null, 2));

const SERVER_FOG_DELTA_PAYLOAD = `{
  "type": "event-appended",
  "roomId": "mb-demo-room-001",
  "seat": "white",
  "seq": 6,
  "state": {
    "board": {
      "a1": { "color": "white", "role": "rook" },
      "e4": { "color": "white", "role": "pawn" },
      "e5": { "color": "black", "role": "pawn" },
      "f7": { "color": "black", "role": "pawn" }
    },
    "visibleSquares": ["a1", "a2", "a3", "..."],
    "legalMoves": [{ "from": "b1", "to": "a3" }, "..."],
    "status": { "type": "playing", "turn": "white" },
    "perspective": "white",
    "clock": { "...": "current clock state" }
  }
}`;

// Board + fog projections for the server-enforced-fog article. Player views
// are sourced from captured snapshots; server truth is the same opening
// replayed through the game kernel.
type CapturedFrame = { state: { board: Board; visibleSquares: Square[] } };
const SERVER_FOG_FRAME_W = articleSnapshotFog as unknown as CapturedFrame;
const SERVER_FOG_FRAME_B = articleSnapshotFogBlack as unknown as CapturedFrame;
const SERVER_FOG_FOG_W = fogSquaresFromVisible(SERVER_FOG_FRAME_W.state.visibleSquares);
const SERVER_FOG_FOG_B = fogSquaresFromVisible(SERVER_FOG_FRAME_B.state.visibleSquares);
const SERVER_FOG_TRUTH_STATE = replayMoves(darkChessVariant.createInitialState('server-fog-model'), [
  { from: 'e2', to: 'e4' },
  { from: 'e7', to: 'e5' },
  { from: 'g1', to: 'f3' },
  { from: 'b8', to: 'c6' },
  { from: 'f1', to: 'c4' },
  { from: 'g8', to: 'f6' },
]).at(-1)!;

// Anatomy of the move-submission wire (client → server). One small payload;
// the loop closes here.
const SERVER_FOG_MOVE_PAYLOAD = `// client → server, sent on player's move
{ type: 'move', from: 'e2', to: 'e4' }`;

// The view computation, condensed from packages/game/src/variants.ts for the
// walkthrough. Real names kept; inline conditions named (yourTurn) for reading.
const SERVER_FOG_VIEW_KERNEL = `// packages/game/src/variants.ts (condensed)

// 1. Which squares can this player see?
function fogVisibleSquares(state, player) {
  // every square one of your own pieces stands on...
  const visible = new Set(ownPieceSquares(state.board, player));
  // ...plus every square one of your pieces could move to or capture on
  for (const move of getVisibilityMoves(state, player)) visible.add(move.to);
  return [...visible].sort();
}

// 2. Keep only the pieces standing on those squares.
function boardVisibleTo(board, visibleSquares) {
  const visible = new Set(visibleSquares);
  const playerBoard = {};
  for (const [square, piece] of Object.entries(board))
    if (piece && visible.has(square)) playerBoard[square] = piece;
  return playerBoard;
}

// 3. Assemble the view that gets sent.
getPlayerView(state, player) {
  const visibleSquares = fogVisibleSquares(state, player);
  const board = boardVisibleTo(state.board, visibleSquares);
  return {
    board,            // only the pieces kept by step 2
    visibleSquares,   // step 1: which squares render clear vs. fogged
    legalMoves: yourTurn(state, player) ? getFogMovesForPlayer(state, player) : [],
    status, perspective: player, moveNumber, clock,
    lastMove,         // your own last move; the opponent's is stripped
  };
}`;

// ---------------------------------------------------------------------------
// server-enforced-fog article: diagrams + small code excerpts.
// All diagrams are minimal hand-rolled SVGs (one shared style) so the article
// stays diagram-heavy without depending on the board renderer pipeline. Boxes
// + arrows + short labels. Width 720; height varies per diagram.
// ---------------------------------------------------------------------------

const SF_DIAGRAM_WIDTH = 720;
const SF_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const SF_INK = '#1f2937';
const SF_MUTED = '#6b7280';
const SF_BG = '#f9fafb';
const SF_LINE = '#9ca3af';
const SF_ACCENT = '#b91c1c';
const SF_OK = '#15803d';

function sfBox(x: number, y: number, w: number, h: number, label: string, opts: { sub?: string; tone?: 'ink' | 'accent' | 'ok' | 'muted' } = {}): string {
  const stroke = opts.tone === 'accent' ? SF_ACCENT : opts.tone === 'ok' ? SF_OK : SF_LINE;
  const titleColor = opts.tone === 'accent' ? SF_ACCENT : opts.tone === 'ok' ? SF_OK : SF_INK;
  const sub = opts.sub
    ? `<text x="${x + w / 2}" y="${y + h - 14}" font-family="${SF_FONT}" font-size="12" fill="${SF_MUTED}" text-anchor="middle">${opts.sub}</text>`
    : '';
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" ry="6" fill="${SF_BG}" stroke="${stroke}" stroke-width="1.5"/>
    <text x="${x + w / 2}" y="${y + (opts.sub ? h / 2 - 2 : h / 2 + 5)}" font-family="${SF_FONT}" font-size="14" font-weight="600" fill="${titleColor}" text-anchor="middle">${label}</text>
    ${sub}
  `;
}

function sfArrow(x1: number, y1: number, x2: number, y2: number, label?: string, opts: { tone?: 'ink' | 'accent' | 'ok' | 'muted' } = {}): string {
  const stroke = opts.tone === 'accent' ? SF_ACCENT : opts.tone === 'ok' ? SF_OK : opts.tone === 'muted' ? SF_MUTED : SF_INK;
  const id = `sfHead-${Math.round(x1 + y1 + x2 + y2)}-${opts.tone ?? 'ink'}`;
  const labelNode = label
    ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}" font-family="${SF_FONT}" font-size="12" fill="${SF_MUTED}" text-anchor="middle">${label}</text>`
    : '';
  return `
    <defs>
      <marker id="${id}" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L9,3 z" fill="${stroke}"/>
      </marker>
    </defs>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="1.5" marker-end="url(#${id})"/>
    ${labelNode}
  `;
}

function sfWrap(height: number, body: string, title?: string): string {
  const heading = title
    ? `<text x="${SF_DIAGRAM_WIDTH / 2}" y="22" font-family="${SF_FONT}" font-size="13" fill="${SF_MUTED}" text-anchor="middle" font-weight="500">${title}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SF_DIAGRAM_WIDTH} ${height}" role="img">${heading}${body}</svg>`;
}

function serverFogReceiptsDiagram(): string {
  // Two columns. Left: canonical (32 / 6 / yes). Right: white's frame (18 / 3 / no).
  const cells: Array<{ label: string; left: string; right: string }> = [
    { label: 'pieces on the board', left: '32', right: '18' },
    { label: 'move-played events', left: '6 (3 white + 3 black)', right: '3 (all white)' },
    { label: 'lastMove field', left: 'present', right: 'absent' },
    { label: 'visibleSquares', left: 'n/a', right: '37 of 64' },
  ];
  const rowY = (i: number) => 80 + i * 56;
  const rows = cells.map((c, i) => `
    <text x="40" y="${rowY(i) + 22}" font-family="${SF_FONT}" font-size="13" fill="${SF_INK}">${c.label}</text>
    ${sfBox(260, rowY(i), 200, 40, c.left, { tone: 'muted' })}
    ${sfBox(490, rowY(i), 200, 40, c.right, { tone: 'ok' })}
  `).join('');
  const headers = `
    <text x="360" y="58" font-family="${SF_FONT}" font-size="13" fill="${SF_MUTED}" text-anchor="middle" font-weight="600">canonical (server only)</text>
    <text x="590" y="58" font-family="${SF_FONT}" font-size="13" fill="${SF_INK}" text-anchor="middle" font-weight="600">white's frame (the bytes above)</text>
  `;
  return sfWrap(rowY(cells.length) + 24, headers + rows);
}

function serverFogTwoArchitecturesDiagram(): string {
  // Two side-by-side flows.
  const leftX = 24;
  const rightX = 384;
  const colW = 312;
  const body = `
    <text x="${leftX + colW / 2}" y="22" font-family="${SF_FONT}" font-size="13" fill="${SF_ACCENT}" text-anchor="middle" font-weight="600">client-side fog (others)</text>
    <text x="${rightX + colW / 2}" y="22" font-family="${SF_FONT}" font-size="13" fill="${SF_OK}" text-anchor="middle" font-weight="600">server-side fog (Mistboard)</text>

    ${sfBox(leftX + 70, 44, 172, 44, 'server', { sub: 'canonical state' })}
    ${sfArrow(leftX + 156, 92, leftX + 80, 152, 'full state', { tone: 'accent' })}
    ${sfArrow(leftX + 156, 92, leftX + 232, 152, 'full state', { tone: 'accent' })}
    ${sfBox(leftX + 8, 156, 144, 56, 'white\'s browser', { sub: 'fog applied in CSS', tone: 'accent' })}
    ${sfBox(leftX + 160, 156, 144, 56, 'black\'s browser', { sub: 'fog applied in CSS', tone: 'accent' })}
    <text x="${leftX + colW / 2}" y="240" font-family="${SF_FONT}" font-size="12" fill="${SF_ACCENT}" text-anchor="middle">opponent pieces sit in browser memory — extension can strip the fog</text>

    ${sfBox(rightX + 70, 44, 172, 44, 'server', { sub: 'canonical state' })}
    ${sfArrow(rightX + 156, 92, rightX + 80, 152, 'white\'s view', { tone: 'ok' })}
    ${sfArrow(rightX + 156, 92, rightX + 232, 152, 'black\'s view', { tone: 'ok' })}
    ${sfBox(rightX + 8, 156, 144, 56, 'white\'s browser', { sub: 'only what white can see', tone: 'ok' })}
    ${sfBox(rightX + 160, 156, 144, 56, 'black\'s browser', { sub: 'only what black can see', tone: 'ok' })}
    <text x="${rightX + colW / 2}" y="240" font-family="${SF_FONT}" font-size="12" fill="${SF_OK}" text-anchor="middle">opponent pieces never reach the browser — nothing to strip</text>
  `;
  return sfWrap(264, body);
}

function serverFogSeatTokenDiagram(): string {
  const body = `
    ${sfBox(40, 40, 180, 80, 'browser', { sub: 'claims a seat' })}
    ${sfBox(270, 40, 180, 80, 'server', { sub: 'mints token, stores hash' })}
    ${sfBox(500, 40, 180, 80, 'database', { sub: 'token_hash per seat' })}
    ${sfArrow(220, 80, 270, 80, 'join', { tone: 'muted' })}
    ${sfArrow(450, 80, 500, 80, '', { tone: 'muted' })}
    ${sfArrow(450, 100, 270, 100, '', { tone: 'muted' })}

    ${sfBox(40, 156, 180, 80, 'browser', { sub: 'reconnects with token' })}
    ${sfBox(270, 156, 180, 80, 'server', { sub: 'verifies against hash' })}
    ${sfArrow(220, 196, 270, 196, 'token in WS header', { tone: 'ok' })}
    ${sfArrow(450, 196, 580, 196, 'seat = white', { tone: 'ok' })}
    ${sfBox(580, 156, 100, 80, 'view\nfor white', { tone: 'ok' })}
  `;
  return sfWrap(272, body);
}

function serverFogThreeStepDiagram(): string {
  const body = `
    ${sfBox(40, 50, 184, 92, 'visibility set', { sub: 'squares this seat can see' })}
    ${sfBox(268, 50, 184, 92, 'masked board', { sub: 'pieces standing on those squares' })}
    ${sfBox(496, 50, 184, 92, 'no opponent lastMove', { sub: 'stripped during play' })}
    ${sfArrow(224, 96, 268, 96)}
    ${sfArrow(452, 96, 496, 96)}
    <text x="${SF_DIAGRAM_WIDTH / 2}" y="180" font-family="${SF_FONT}" font-size="13" fill="${SF_INK}" text-anchor="middle">player view = board + visibility set + your legal moves + clock + status</text>
  `;
  return sfWrap(204, body);
}

function serverFogFanOutDiagram(): string {
  const body = `
    ${sfBox(280, 40, 160, 56, 'move applied', { sub: 'canonical state' })}
    ${sfArrow(360, 96, 180, 156, 'view for white', { tone: 'ok' })}
    ${sfArrow(360, 96, 540, 156, 'view for black', { tone: 'ok' })}
    ${sfBox(80, 160, 200, 64, 'frame for white\'s socket', { sub: 'white\'s bytes only', tone: 'ok' })}
    ${sfBox(440, 160, 200, 64, 'frame for black\'s socket', { sub: 'black\'s bytes only', tone: 'ok' })}
    <text x="${SF_DIAGRAM_WIDTH / 2}" y="252" font-family="${SF_FONT}" font-size="12" fill="${SF_MUTED}" text-anchor="middle">no shared "broadcast" with masking later — two distinct messages from the start</text>
  `;
  return sfWrap(276, body);
}

function serverFogConnectionRuleDiagram(): string {
  const body = `
    ${sfBox(40, 40, 180, 64, 'incoming socket', { sub: 'WS connect to /room/...' })}
    ${sfBox(280, 40, 200, 64, 'is the game finished?', { sub: 'or do you hold a seat token?' })}
    ${sfArrow(220, 72, 280, 72)}
    ${sfBox(540, 8, 140, 56, 'yes → accept', { tone: 'ok' })}
    ${sfBox(540, 96, 140, 56, 'no → 1008 close', { sub: '"private room"', tone: 'accent' })}
    ${sfArrow(480, 60, 540, 36, '', { tone: 'ok' })}
    ${sfArrow(480, 84, 540, 124, '', { tone: 'accent' })}
    <text x="${SF_DIAGRAM_WIDTH / 2}" y="200" font-family="${SF_FONT}" font-size="12" fill="${SF_MUTED}" text-anchor="middle">same rule gates HTTP replay — live games return 403, finished games return the event log</text>
  `;
  return sfWrap(224, body);
}

// ── Dark Xiangqi article diagrams ─────────────────────────────────────────
// The board-render package is chess-only today, so the Dark Xiangqi draft uses
// small raw SVG diagrams generated from the Xiangqi rules kernel.
const XQ_CELL = 31;
const XQ_MARGIN = 18;
const XQ_BOARD_W = XQ_MARGIN * 2 + 8 * XQ_CELL;
const XQ_BOARD_H = XQ_MARGIN * 2 + 9 * XQ_CELL;
const XQ_PIECE_SIZE = 28;
const XQ_FOG_OVERLAP = 0.5;
const XQ_VIEWBOX_PAD = 4;
const XQ_BOARD_RADIUS = 8;
const XQ_BOARD_STROKE = '#8b5a24';
const XQ_BOARD_STROKE_WIDTH = 1.5;

const XQ_START = createInitialXiangqiState('article-xiangqi-start');

function xqPoint(
  file: number,
  rank: number,
  perspective: XiangqiColor,
  x0: number,
  y0: number,
): { x: number; y: number } {
  const row = perspective === 'red' ? 10 - rank : rank - 1;
  return {
    x: x0 + XQ_MARGIN + file * XQ_CELL,
    y: y0 + XQ_MARGIN + row * XQ_CELL,
  };
}

function xqCoord(square: XiangqiSquare): { file: number; rank: number } {
  return { file: 'abcdefghi'.indexOf(square[0]!), rank: Number(square.slice(1)) };
}

function xqSvgIdPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
}

function xqVisualRow(rank: number, perspective: XiangqiColor): number {
  return perspective === 'red' ? 10 - rank : rank - 1;
}

function xqBoardGrid(x0: number, y0: number, perspective: XiangqiColor): string {
  const parts: string[] = [
    `<rect x="${x0}" y="${y0}" width="${XQ_BOARD_W}" height="${XQ_BOARD_H}" rx="${XQ_BOARD_RADIUS}" fill="#f5dca8"/>`,
  ];
  const left = x0 + XQ_MARGIN;
  const right = left + 8 * XQ_CELL;
  const top = y0 + XQ_MARGIN;
  const bottom = top + 9 * XQ_CELL;
  const riverTop = top + 4 * XQ_CELL;
  const riverBottom = top + 5 * XQ_CELL;
  for (let r = 0; r < 10; r += 1) {
    const y = top + r * XQ_CELL;
    parts.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#5a3a14" stroke-width="1"/>`);
  }
  for (let f = 0; f < 9; f += 1) {
    const x = left + f * XQ_CELL;
    if (f === 0 || f === 8) {
      parts.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="#5a3a14" stroke-width="1"/>`);
    } else {
      parts.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${riverTop}" stroke="#5a3a14" stroke-width="1"/>`);
      parts.push(`<line x1="${x}" y1="${riverBottom}" x2="${x}" y2="${bottom}" stroke="#5a3a14" stroke-width="1"/>`);
    }
  }
  for (const palace of [
    { fileMin: 3, fileMax: 5, rankBack: 1 },
    { fileMin: 3, fileMax: 5, rankBack: 8 },
  ]) {
    const topRank = palace.rankBack === 1 ? 3 : 10;
    const bottomRank = palace.rankBack;
    const a = xqPoint(palace.fileMin, topRank, perspective, x0, y0);
    const b = xqPoint(palace.fileMax, bottomRank, perspective, x0, y0);
    const c = xqPoint(palace.fileMax, topRank, perspective, x0, y0);
    const d = xqPoint(palace.fileMin, bottomRank, perspective, x0, y0);
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#5a3a14" stroke-width="1"/>`);
    parts.push(`<line x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}" stroke="#5a3a14" stroke-width="1"/>`);
  }
  parts.push(
    `<text x="${left + 4 * XQ_CELL}" y="${(riverTop + riverBottom) / 2 + 1}" font-family="serif" font-size="16" fill="#5a3a14" text-anchor="middle" dominant-baseline="central">楚 河   漢 界</text>`,
  );
  return parts.join('');
}

function xqBoardBorder(x0: number, y0: number): string {
  return `<rect x="${x0}" y="${y0}" width="${XQ_BOARD_W}" height="${XQ_BOARD_H}" rx="${XQ_BOARD_RADIUS}" fill="none" stroke="${XQ_BOARD_STROKE}" stroke-width="${XQ_BOARD_STROKE_WIDTH}"/>`;
}

function xqFogLayer(
  view: XiangqiPlayerView | null,
  x0: number,
  y0: number,
  perspective: XiangqiColor,
  clipId: string,
): string {
  if (!view) return '';
  const visible = new Set(view.visibleSquares);
  const parts: string[] = [];
  for (let file = 0; file < 9; file += 1) {
    for (let rank = 1; rank <= 10; rank += 1) {
      const sq = xiangqiSquareOf(file, rank);
      if (visible.has(sq)) continue;
      const { x, y } = xqPoint(file, rank, perspective, x0, y0);
      const visualRow = xqVisualRow(rank, perspective);
      const left = file === 0 ? x0 : x - XQ_CELL / 2 - XQ_FOG_OVERLAP;
      const right = file === 8 ? x0 + XQ_BOARD_W : x + XQ_CELL / 2 + XQ_FOG_OVERLAP;
      const top = visualRow === 0 ? y0 : y - XQ_CELL / 2 - XQ_FOG_OVERLAP;
      const bottom = visualRow === 9 ? y0 + XQ_BOARD_H : y + XQ_CELL / 2 + XQ_FOG_OVERLAP;
      parts.push(`M ${left} ${top} H ${right} V ${bottom} H ${left} Z`);
    }
  }
  if (parts.length === 0) return '';
  return [
    `<defs><clipPath id="${clipId}"><rect x="${x0}" y="${y0}" width="${XQ_BOARD_W}" height="${XQ_BOARD_H}" rx="${XQ_BOARD_RADIUS}"/></clipPath></defs>`,
    `<path d="${parts.join(' ')}" fill="#24190f" opacity="0.55" clip-path="url(#${clipId})"/>`,
  ].join('');
}

function xqCannonTargets(
  state: XiangqiGameState,
  view: XiangqiPlayerView | null,
  x0: number,
  y0: number,
  perspective: XiangqiColor,
): string {
  if (!view) return '';
  const visible = new Set(view.visibleSquares);
  const targets = [...computeXiangqiVision(state, view.perspective).cannonTargets].filter((sq) =>
    visible.has(sq),
  );
  return targets
    .map((sq) => {
      const { file, rank } = xqCoord(sq);
      const { x, y } = xqPoint(file, rank, perspective, x0, y0);
      const outer = 16;
      const inner = 10;
      return [
        `<path d="M ${x - outer} ${y - inner} L ${x - outer} ${y - outer} L ${x - inner} ${y - outer}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round"/>`,
        `<path d="M ${x + inner} ${y - outer} L ${x + outer} ${y - outer} L ${x + outer} ${y - inner}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round"/>`,
        `<path d="M ${x - outer} ${y + inner} L ${x - outer} ${y + outer} L ${x - inner} ${y + outer}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round"/>`,
        `<path d="M ${x + inner} ${y + outer} L ${x + outer} ${y + outer} L ${x + outer} ${y + inner}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round"/>`,
      ].join('');
    })
    .join('');
}

function xqPiecesLayer(
  state: XiangqiGameState,
  view: XiangqiPlayerView | null,
  x0: number,
  y0: number,
  perspective: XiangqiColor,
): string {
  const entries = view
    ? Object.entries(view.board).map(([sq, entry]) => [sq, entry?.piece, entry?.shrouded] as const)
    : Object.entries(state.board).map(([sq, piece]) => [sq, piece, false] as const);
  return entries
    .map(([sq, piece, shrouded]) => {
      if (!piece) return '';
      const { file, rank } = xqCoord(sq as XiangqiSquare);
      const { x, y } = xqPoint(file, rank, perspective, x0, y0);
      return renderXiangqiPiece(piece as XiangqiPiece, {
        x: x - XQ_PIECE_SIZE / 2,
        y: y - XQ_PIECE_SIZE / 2,
        size: XQ_PIECE_SIZE,
        shrouded,
      });
    })
    .join('');
}

function xqArrowLayer(
  arrows: Array<{ from: XiangqiSquare; to: XiangqiSquare }> | undefined,
  x0: number,
  y0: number,
  perspective: XiangqiColor,
): string {
  if (!arrows || arrows.length === 0) return '';
  return arrows
    .map(({ from, to }, index) => {
      const fromCoord = xqCoord(from);
      const toCoord = xqCoord(to);
      const start = xqPoint(fromCoord.file, fromCoord.rank, perspective, x0, y0);
      const end = xqPoint(toCoord.file, toCoord.rank, perspective, x0, y0);
      const id = `xq-arrow-${from}-${to}-${index}`;
      return [
        `<defs><marker id="${id}" markerWidth="4" markerHeight="4" refX="2.05" refY="2" orient="auto" overflow="visible" markerUnits="strokeWidth"><path d="M0,0 V4 L3,2 Z" fill="#15781B"/></marker></defs>`,
        `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="#15781B" stroke-width="5.25" stroke-linecap="round" opacity="0.38" marker-end="url(#${id})"/>`,
      ].join('');
    })
    .join('');
}

function xqBoardSvg(opts: {
  state: XiangqiGameState;
  view?: XiangqiPlayerView;
  x: number;
  y: number;
  label: string;
  perspective?: XiangqiColor;
  arrows?: Array<{ from: XiangqiSquare; to: XiangqiSquare }>;
}): string {
  const perspective = opts.perspective ?? opts.view?.perspective ?? 'red';
  const view = opts.view ?? null;
  const boardY = opts.y + 28;
  const clipId = `xq-fog-${xqSvgIdPart(opts.state.id)}-${xqSvgIdPart(opts.label)}-${Math.round(opts.x)}-${Math.round(boardY)}-${perspective}`;
  return [
    `<text x="${opts.x + XQ_BOARD_W / 2}" y="${opts.y + 14}" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#5f4a2c" text-anchor="middle">${opts.label}</text>`,
    xqBoardGrid(opts.x, boardY, perspective),
    xqFogLayer(view, opts.x, boardY, perspective, clipId),
    xqCannonTargets(opts.state, view, opts.x, boardY, perspective),
    xqPiecesLayer(opts.state, view, opts.x, boardY, perspective),
    xqArrowLayer(opts.arrows, opts.x, boardY, perspective),
    xqBoardBorder(opts.x, boardY),
  ].join('');
}

function xqSvg(width: number, height: number, body: string): string {
  const paddedWidth = width + XQ_VIEWBOX_PAD * 2;
  const paddedHeight = height + XQ_VIEWBOX_PAD * 2;
  const layout = width <= XQ_BOARD_W ? 'single' : width <= XQ_BOARD_W * 2 + 28 ? 'pair' : 'wide';
  return `<svg class="xq-article-svg" data-xq-layout="${layout}" style="--xq-svg-width: ${paddedWidth}px" viewBox="0 0 ${paddedWidth} ${paddedHeight}" role="img" xmlns="http://www.w3.org/2000/svg"><g transform="translate(${XQ_VIEWBOX_PAD} ${XQ_VIEWBOX_PAD})">${body}</g></svg>`;
}

function xqViewWithExtraVisibleSquares(
  view: XiangqiPlayerView,
  squares: XiangqiSquare[],
): XiangqiPlayerView {
  return {
    ...view,
    visibleSquares: [...new Set([...view.visibleSquares, ...squares])].sort(),
  };
}

const XQ_START_RED = getXiangqiPlayerView(XQ_START, 'red', 'D');
const XQ_START_BLACK = getXiangqiPlayerView(XQ_START, 'black', 'D');
const XQ_START_TRIPTYCH = xqSvg(
  XQ_BOARD_W * 3 + 56,
  XQ_BOARD_H + 52,
  [
    xqBoardSvg({ state: XQ_START, view: XQ_START_RED, x: 0, y: 0, label: "RED'S VIEW", perspective: 'red' }),
    xqBoardSvg({ state: XQ_START, x: XQ_BOARD_W + 28, y: 0, label: 'SERVER TRUTH', perspective: 'red' }),
    xqBoardSvg({
      state: XQ_START,
      view: XQ_START_BLACK,
      x: (XQ_BOARD_W + 28) * 2,
      y: 0,
      label: "BLACK'S VIEW",
      perspective: 'red',
    }),
  ].join(''),
);
const XQ_RULES_PRIMER_START_BOARD = xqSvg(
  XQ_BOARD_W,
  XQ_BOARD_H + 52,
  xqBoardSvg({ state: XQ_START, x: 0, y: 0, label: 'STARTING POSITION', perspective: 'red' }),
);
const XQ_RULES_PRIMER_THUMBNAIL = xqSvg(
  XQ_BOARD_W,
  XQ_BOARD_H,
  [xqBoardGrid(0, 0, 'red'), xqPiecesLayer(XQ_START, null, 0, 0, 'red')].join(''),
);

function xqVisionDemoState(id: string, board: Partial<Record<XiangqiSquare, XiangqiPiece>>): XiangqiGameState {
  return {
    id,
    board,
    status: { type: 'playing', turn: 'black' },
    moveNumber: 12,
    progressClock: 0,
    positionCounts: {},
  };
}

const XQ_VISION_STATES = [
  {
    label: 'SOLDIER',
    state: xqVisionDemoState('xq-vision-soldier', {
      a4: { color: 'red', role: 'soldier' },
      c6: { color: 'red', role: 'soldier' },
      e8: { color: 'red', role: 'soldier' },
      f7: { color: 'red', role: 'soldier' },
      i5: { color: 'red', role: 'soldier' },
    }),
  },
  {
    label: 'ADVISOR',
    state: xqVisionDemoState('xq-vision-advisor', {
      d1: { color: 'red', role: 'advisor' },
      e2: { color: 'red', role: 'advisor' },
    }),
  },
  {
    label: 'ELEPHANT',
    state: xqVisionDemoState('xq-vision-elephant', {
      c1: { color: 'red', role: 'elephant' },
      g5: { color: 'red', role: 'elephant' },
    }),
  },
  {
    label: 'HORSE',
    state: xqVisionDemoState('xq-vision-horse', {
      d7: { color: 'red', role: 'horse' },
      f6: { color: 'red', role: 'horse' },
    }),
  },
  {
    label: 'CANNON',
    state: xqVisionDemoState('xq-vision-cannon', {
      b7: { color: 'red', role: 'cannon' },
      f3: { color: 'red', role: 'cannon' },
    }),
  },
  {
    label: 'CHARIOT',
    state: xqVisionDemoState('xq-vision-chariot', {
      d2: { color: 'red', role: 'chariot' },
      f7: { color: 'red', role: 'chariot' },
    }),
  },
  {
    label: 'GENERAL',
    state: xqVisionDemoState('xq-vision-general', {
      e1: { color: 'red', role: 'general' },
    }),
  },
];

const XQ_VISIBILITY_GRID_COLUMNS = 3;
const XQ_VISIBILITY_GRID_GAP = 28;
const XQ_VISIBILITY_GRID_ROW_H = XQ_BOARD_H + 52;
const XQ_VISIBILITY_GRID = xqSvg(
  XQ_BOARD_W * XQ_VISIBILITY_GRID_COLUMNS + XQ_VISIBILITY_GRID_GAP * (XQ_VISIBILITY_GRID_COLUMNS - 1),
  XQ_VISIBILITY_GRID_ROW_H * Math.ceil(XQ_VISION_STATES.length / XQ_VISIBILITY_GRID_COLUMNS),
  XQ_VISION_STATES.map(({ state, label }, index) => {
    const row = Math.floor(index / XQ_VISIBILITY_GRID_COLUMNS);
    const col = index % XQ_VISIBILITY_GRID_COLUMNS;
    const rowCount = Math.min(XQ_VISIBILITY_GRID_COLUMNS, XQ_VISION_STATES.length - row * XQ_VISIBILITY_GRID_COLUMNS);
    const centeredRowOffset = ((XQ_VISIBILITY_GRID_COLUMNS - rowCount) * (XQ_BOARD_W + XQ_VISIBILITY_GRID_GAP)) / 2;
    return xqBoardSvg({
      state,
      view: getXiangqiPlayerView(state, 'red', 'D'),
      x: centeredRowOffset + col * (XQ_BOARD_W + XQ_VISIBILITY_GRID_GAP),
      y: row * XQ_VISIBILITY_GRID_ROW_H,
      label,
      perspective: 'red',
    });
  }).join(''),
);

const XQ_VISION_MOVE_BEFORE = xqVisionDemoState('xq-vision-move-before', {
  b1: { color: 'red', role: 'chariot' },
  b2: { color: 'red', role: 'chariot' },
  a9: { color: 'black', role: 'chariot' },
  e9: { color: 'black', role: 'general' },
});
const XQ_VISION_MOVE_AFTER: XiangqiGameState = {
  ...XQ_VISION_MOVE_BEFORE,
  id: 'xq-vision-move-after',
  board: {
    b1: { color: 'red', role: 'chariot' },
    b9: { color: 'red', role: 'chariot' },
    a9: { color: 'black', role: 'chariot' },
    e9: { color: 'black', role: 'general' },
  },
  lastMove: { from: 'b2' as XiangqiSquare, to: 'b9' as XiangqiSquare },
};
const XQ_VISION_MOVE_PAIR = xqSvg(
  XQ_BOARD_W * 2 + 28,
  XQ_BOARD_H + 52,
  [
    xqBoardSvg({
      state: XQ_VISION_MOVE_BEFORE,
      view: getXiangqiPlayerView(XQ_VISION_MOVE_BEFORE, 'red', 'D'),
      x: 0,
      y: 0,
      label: 'BEFORE',
      perspective: 'red',
    }),
    xqBoardSvg({
      state: XQ_VISION_MOVE_AFTER,
      view: getXiangqiPlayerView(XQ_VISION_MOVE_AFTER, 'red', 'D'),
      x: XQ_BOARD_W + 28,
      y: 0,
      label: 'AFTER',
      perspective: 'red',
      arrows: [{ from: 'b2' as XiangqiSquare, to: 'b9' as XiangqiSquare }],
    }),
  ].join(''),
);

const XQ_CANNON_RULE_STATE: XiangqiGameState = {
  id: 'xq-cannon-rule',
  board: {
    e7: { color: 'red', role: 'cannon' },
    c7: { color: 'black', role: 'soldier' },
    e10: { color: 'black', role: 'general' },
    g7: { color: 'black', role: 'soldier' },
    i7: { color: 'black', role: 'soldier' },
  },
  status: { type: 'playing', turn: 'red' },
  moveNumber: 12,
  progressClock: 0,
  positionCounts: {},
};
const XQ_CANNON_RULE_RED = getXiangqiPlayerView(XQ_CANNON_RULE_STATE, 'red', 'D');
const XQ_CANNON_RULE_PAIR = xqSvg(
  XQ_BOARD_W * 2 + 28,
  XQ_BOARD_H + 52,
  [
    xqBoardSvg({
      state: XQ_CANNON_RULE_STATE,
      view: XQ_CANNON_RULE_RED,
      x: 0,
      y: 0,
      label: "RED'S VIEW",
      perspective: 'red',
    }),
    xqBoardSvg({
      state: XQ_CANNON_RULE_STATE,
      x: XQ_BOARD_W + 28,
      y: 0,
      label: 'SERVER TRUTH',
      perspective: 'red',
    }),
  ].join(''),
);
const XQ_DARK_XIANGQI_THUMBNAIL = xqSvg(
  XQ_BOARD_W,
  XQ_BOARD_H,
  [
    xqBoardGrid(0, 0, 'red'),
    xqFogLayer(XQ_START_RED, 0, 0, 'red', 'xq-fog-dark-xiangqi-thumbnail'),
    xqPiecesLayer(XQ_START, XQ_START_RED, 0, 0, 'red'),
    xqBoardBorder(0, 0),
  ].join(''),
);

const DARK_MINI_XIANGQI_THUMBNAIL = `<svg class="xq-article-svg" data-xq-layout="single" style="--xq-svg-width: 276px" viewBox="0 0 276 276" role="img" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="8" width="260" height="260" rx="10" fill="#f5dca8" stroke="#8b5a24" stroke-width="1.5"/>
  ${Array.from({ length: 7 }, (_, i) => {
    const p = 36 + i * 34;
    return `<line x1="36" y1="${p}" x2="240" y2="${p}" stroke="#5a3a14" stroke-width="1"/><line x1="${p}" y1="36" x2="${p}" y2="240" stroke="#5a3a14" stroke-width="1"/>`;
  }).join('')}
  <rect x="88" y="36" width="102" height="68" fill="#fff7df" opacity="0.45"/>
  <rect x="88" y="172" width="102" height="68" fill="#fff7df" opacity="0.45"/>
  <path d="M88 36 L190 104 M190 36 L88 104 M88 172 L190 240 M190 172 L88 240" stroke="#5a3a14" stroke-width="1"/>
  <g font-family="system-ui, sans-serif" font-size="16" font-weight="800" text-anchor="middle" dominant-baseline="central">
    <text x="36" y="240" fill="#a12721">R</text><text x="70" y="240" fill="#a12721">C</text><text x="104" y="240" fill="#a12721">H</text><text x="138" y="240" fill="#a12721">G</text><text x="172" y="240" fill="#a12721">H</text><text x="206" y="240" fill="#a12721">C</text><text x="240" y="240" fill="#a12721">R</text>
    <text x="36" y="206" fill="#a12721">S</text><text x="104" y="206" fill="#a12721">S</text><text x="138" y="206" fill="#a12721">S</text><text x="172" y="206" fill="#a12721">S</text><text x="240" y="206" fill="#a12721">S</text>
    <text x="36" y="36" fill="#111827">R</text><text x="70" y="36" fill="#111827">C</text><text x="104" y="36" fill="#111827">H</text><text x="138" y="36" fill="#111827">G</text><text x="172" y="36" fill="#111827">H</text><text x="206" y="36" fill="#111827">C</text><text x="240" y="36" fill="#111827">R</text>
    <text x="36" y="70" fill="#111827">S</text><text x="104" y="70" fill="#111827">S</text><text x="138" y="70" fill="#111827">S</text><text x="172" y="70" fill="#111827">S</text><text x="240" y="70" fill="#111827">S</text>
  </g>
  <path d="M8 8 H268 V132 H8 Z M8 178 H268 V268 H8 Z" fill="#24190f" opacity="0.26"/>
</svg>`;

const XQ_FACING_GENERAL_BEFORE: XiangqiGameState = {
  id: 'xq-facing-general-before',
  board: {
    e1: { color: 'red', role: 'general' },
    d10: { color: 'black', role: 'general' },
  },
  status: { type: 'playing', turn: 'black' },
  moveNumber: 12,
  progressClock: 0,
  positionCounts: {},
};
const XQ_FACING_GENERAL_EXPOSED = applyXiangqiMove(XQ_FACING_GENERAL_BEFORE, {
  from: 'd10' as XiangqiSquare,
  to: 'e10' as XiangqiSquare,
});
const XQ_FACING_GENERAL_CAPTURED = applyXiangqiMove(XQ_FACING_GENERAL_EXPOSED, {
  from: 'e1' as XiangqiSquare,
  to: 'e10' as XiangqiSquare,
});
const XQ_FACING_GENERAL_CAPTURED_RED = xqViewWithExtraVisibleSquares(
  getXiangqiPlayerView(XQ_FACING_GENERAL_CAPTURED, 'red', 'D'),
  ['d10', 'e9', 'f10'] as XiangqiSquare[],
);
const XQ_FACING_GENERAL_STEPS = [
  {
    svg: xqSvg(
      XQ_BOARD_W * 2 + 28,
      XQ_BOARD_H + 52,
      [
        xqBoardSvg({
          state: XQ_FACING_GENERAL_BEFORE,
          view: getXiangqiPlayerView(XQ_FACING_GENERAL_BEFORE, 'red', 'D'),
          x: 0,
          y: 0,
          label: "RED'S VIEW",
          perspective: 'red',
        }),
        xqBoardSvg({
          state: XQ_FACING_GENERAL_BEFORE,
          x: XQ_BOARD_W + 28,
          y: 0,
          label: 'SERVER TRUTH',
          perspective: 'red',
        }),
      ].join(''),
    ),
  },
  {
    svg: xqSvg(
      XQ_BOARD_W * 2 + 28,
      XQ_BOARD_H + 52,
      [
        xqBoardSvg({
          state: XQ_FACING_GENERAL_EXPOSED,
          view: getXiangqiPlayerView(XQ_FACING_GENERAL_EXPOSED, 'red', 'D'),
          x: 0,
          y: 0,
          label: "RED'S VIEW",
          perspective: 'red',
        }),
        xqBoardSvg({
          state: XQ_FACING_GENERAL_EXPOSED,
          x: XQ_BOARD_W + 28,
          y: 0,
          label: 'SERVER TRUTH',
          perspective: 'red',
          arrows: [{ from: 'd10' as XiangqiSquare, to: 'e10' as XiangqiSquare }],
        }),
      ].join(''),
    ),
  },
  {
    svg: xqSvg(
      XQ_BOARD_W * 2 + 28,
      XQ_BOARD_H + 52,
      [
        xqBoardSvg({
          state: XQ_FACING_GENERAL_CAPTURED,
          view: XQ_FACING_GENERAL_CAPTURED_RED,
          x: 0,
          y: 0,
          label: "RED'S VIEW",
          perspective: 'red',
        }),
        xqBoardSvg({
          state: XQ_FACING_GENERAL_CAPTURED,
          x: XQ_BOARD_W + 28,
          y: 0,
          label: 'SERVER TRUTH',
          perspective: 'red',
          arrows: [{ from: 'e1' as XiangqiSquare, to: 'e10' as XiangqiSquare }],
        }),
      ].join(''),
    ),
  },
];

const XQ_BLOCKED_HORSE_LEGS_STATE = xqVisionDemoState('xq-blocked-horse-legs', {
  c8: { color: 'red', role: 'horse' },
  g9: { color: 'red', role: 'horse' },
  c7: { color: 'black', role: 'soldier' },
  d8: { color: 'black', role: 'advisor' },
  f9: { color: 'black', role: 'general' },
  g8: { color: 'black', role: 'horse' },
});
const XQ_BLOCKED_HORSE_LEGS_PAIR = xqSvg(
  XQ_BOARD_W * 2 + 28,
  XQ_BOARD_H + 52,
  [
    xqBoardSvg({
      state: XQ_BLOCKED_HORSE_LEGS_STATE,
      view: getXiangqiPlayerView(XQ_BLOCKED_HORSE_LEGS_STATE, 'red', 'D'),
      x: 0,
      y: 0,
      label: "RED'S VIEW",
      perspective: 'red',
    }),
    xqBoardSvg({
      state: XQ_BLOCKED_HORSE_LEGS_STATE,
      x: XQ_BOARD_W + 28,
      y: 0,
      label: 'SERVER TRUTH',
      perspective: 'red',
    }),
  ].join(''),
);

const XQ_BLOCKED_ELEPHANT_EYES_STATE = xqVisionDemoState('xq-blocked-elephant-eyes', {
  c5: { color: 'red', role: 'elephant' },
  e3: { color: 'red', role: 'elephant' },
  b4: { color: 'black', role: 'soldier' },
  f4: { color: 'black', role: 'soldier' },
});
const XQ_BLOCKED_ELEPHANT_EYES_PAIR = xqSvg(
  XQ_BOARD_W * 2 + 28,
  XQ_BOARD_H + 52,
  [
    xqBoardSvg({
      state: XQ_BLOCKED_ELEPHANT_EYES_STATE,
      view: getXiangqiPlayerView(XQ_BLOCKED_ELEPHANT_EYES_STATE, 'red', 'D'),
      x: 0,
      y: 0,
      label: "RED'S VIEW",
      perspective: 'red',
    }),
    xqBoardSvg({
      state: XQ_BLOCKED_ELEPHANT_EYES_STATE,
      x: XQ_BOARD_W + 28,
      y: 0,
      label: 'SERVER TRUTH',
      perspective: 'red',
    }),
  ].join(''),
);

const XQ_GENERAL_CAPTURE_BEFORE: XiangqiGameState = {
  id: 'xq-general-capture-before',
  board: {
    c1: { color: 'red', role: 'elephant' },
    d1: { color: 'red', role: 'advisor' },
    e1: { color: 'red', role: 'general' },
    f1: { color: 'red', role: 'advisor' },
    g1: { color: 'red', role: 'elephant' },
    h1: { color: 'red', role: 'horse' },
    b3: { color: 'red', role: 'cannon' },
    c4: { color: 'red', role: 'soldier' },
    g4: { color: 'red', role: 'soldier' },
    e7: { color: 'red', role: 'chariot' },
    c7: { color: 'black', role: 'soldier' },
    g7: { color: 'black', role: 'soldier' },
    b8: { color: 'black', role: 'cannon' },
    h8: { color: 'black', role: 'cannon' },
    b10: { color: 'black', role: 'horse' },
    d10: { color: 'black', role: 'advisor' },
    e10: { color: 'black', role: 'general' },
    f10: { color: 'black', role: 'advisor' },
    g10: { color: 'black', role: 'elephant' },
    h10: { color: 'black', role: 'horse' },
  },
  status: { type: 'playing', turn: 'red' },
  moveNumber: 34,
  progressClock: 5,
  positionCounts: {},
};
const XQ_GENERAL_CAPTURE_AFTER = applyXiangqiMove(XQ_GENERAL_CAPTURE_BEFORE, {
  from: 'e7' as XiangqiSquare,
  to: 'e10' as XiangqiSquare,
});
const XQ_GENERAL_CAPTURE_BEFORE_RED = getXiangqiPlayerView(XQ_GENERAL_CAPTURE_BEFORE, 'red', 'D');
const XQ_GENERAL_CAPTURE_AFTER_RED = getXiangqiPlayerView(XQ_GENERAL_CAPTURE_AFTER, 'red', 'D');
const XQ_GENERAL_CAPTURE_PAIR = xqSvg(
  XQ_BOARD_W * 2 + 28,
  XQ_BOARD_H + 52,
  [
    xqBoardSvg({
      state: XQ_GENERAL_CAPTURE_BEFORE,
      view: XQ_GENERAL_CAPTURE_BEFORE_RED,
      x: 0,
      y: 0,
      label: "RED'S VIEW BEFORE",
      perspective: 'red',
    }),
    xqBoardSvg({
      state: XQ_GENERAL_CAPTURE_AFTER,
      view: XQ_GENERAL_CAPTURE_AFTER_RED,
      x: XQ_BOARD_W + 28,
      y: 0,
      label: "RED'S VIEW AFTER",
      perspective: 'red',
      arrows: [{ from: 'e7' as XiangqiSquare, to: 'e10' as XiangqiSquare }],
    }),
  ].join(''),
);

export const articles: Article[] = [
  {
    slug: 'chess-rules-primer',
    kind: 'rules',
    title: 'Chess Rules',
    summary:
      'The regular chess baseline for Mistboard: setup, turns, legal moves, captures, check, checkmate, castling, promotion, en passant, and common draws.',
    status: 'published',
    publishedAt: '2026-05-30',
    audience: 'Mistboard visitors who want the regular chess baseline before reading Fog of War rules.',
    thumbnail: {
      pieces: boardToPieces(DARK_CHESS_START_STATE.board),
      orientation: 'white',
    },
    intro: [
      {
        kind: 'paragraph',
        text:
          'Mistboard starts from regular chess. If you already know orthodox chess, you can skip straight to the [Dark Chess rules](/articles/dark-chess-rules). If the basics are rusty, this page is the reference baseline.',
      },
      {
        kind: 'paragraph',
        text:
          'The handoff is simple: regular chess defines the board, pieces, captures, special moves, and draw rules. Fog of War then changes information: enemy pieces can be hidden, check warnings disappear, and the king is actually captured.',
      },
    ],
    sections: [
      {
        heading: 'Board setup',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Chess is played on an 8 by 8 board. White moves first, then players alternate one move at a time. Each side starts with one king, one queen, two rooks, two bishops, two knights, and eight pawns.',
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'single',
              boards: [
                { board: DARK_CHESS_START_STATE.board, orientation: 'white', label: 'STARTING POSITION' },
              ],
            },
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              'White begins on ranks 1 and 2; Black begins on ranks 8 and 7. Queens start on their own color: White queen on d1, Black queen on d8. On your turn, choose one of your pieces and move it to a legal square. You cannot land on your own piece. If you land on an enemy piece, you capture it and remove it from the board.',
          },
        ],
      },
      {
        heading: 'Pieces, captures, and blockers',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Each piece has its own movement shape. Highlighted squares below are legal destinations or captures from the pictured position.',
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'grid',
              boards: [
                { board: BASIC_KING.board, highlightSquares: BASIC_KING_TARGETS, orientation: 'white', label: 'KING' },
                {
                  board: BASIC_QUEEN.board,
                  highlightSquares: BASIC_QUEEN_TARGETS,
                  orientation: 'white',
                  label: 'QUEEN',
                  arrows: [
                    { orig: 'e4' as Square, dest: 'e8' as Square },
                    { orig: 'e4' as Square, dest: 'h7' as Square },
                    { orig: 'e4' as Square, dest: 'a4' as Square },
                  ],
                },
                {
                  board: BASIC_ROOK.board,
                  highlightSquares: BASIC_ROOK_TARGETS,
                  orientation: 'white',
                  label: 'ROOK',
                  arrows: [
                    { orig: 'e4' as Square, dest: 'e8' as Square },
                    { orig: 'e4' as Square, dest: 'h4' as Square },
                  ],
                },
                {
                  board: BASIC_BISHOP.board,
                  highlightSquares: BASIC_BISHOP_TARGETS,
                  orientation: 'white',
                  label: 'BISHOP',
                  arrows: [
                    { orig: 'e4' as Square, dest: 'a8' as Square },
                    { orig: 'e4' as Square, dest: 'h1' as Square },
                  ],
                },
                { board: BASIC_KNIGHT.board, highlightSquares: BASIC_KNIGHT_TARGETS, orientation: 'white', label: 'KNIGHT' },
                {
                  board: BASIC_PAWN.board,
                  highlightSquares: BASIC_PAWN_TARGETS,
                  orientation: 'white',
                  label: 'PAWN',
                  arrows: [
                    { orig: 'e2' as Square, dest: 'e4' as Square },
                    { orig: 'e2' as Square, dest: 'd3' as Square },
                    { orig: 'e2' as Square, dest: 'f3' as Square },
                  ],
                },
              ],
            },
            caption: 'Movement and capture shapes for the six chess pieces.',
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**King:** moves one square in any direction. In regular chess, a king may not move onto a square attacked by the opponent.',
          },
          {
            kind: 'paragraph',
            text:
              '**Queen:** moves any number of squares horizontally, vertically, or diagonally. Other pieces block her path.',
          },
          {
            kind: 'paragraph',
            text:
              '**Rook:** moves any number of squares horizontally or vertically. It cannot jump, so the first occupied square in a line stops it.',
          },
          {
            kind: 'paragraph',
            text:
              '**Bishop:** moves any number of squares diagonally. Because diagonals stay on one color, each bishop stays on light squares or dark squares for the whole game.',
          },
          {
            kind: 'paragraph',
            text:
              '**Knight:** moves in an L shape: two squares one way and one square sideways. The knight is the only piece that jumps over other pieces.',
          },
          {
            kind: 'paragraph',
            text:
              '**Pawn:** moves forward toward the opponent side of the board into empty squares. From its starting rank, it may move one or two squares if the path is empty. Pawns capture one square diagonally forward, not straight ahead.',
          },
          {
            kind: 'paragraph',
            text:
              'A capture happens when your piece moves to a square occupied by an enemy piece. Your piece stays on that square, and the captured piece leaves the board.',
          },
          {
            kind: 'paragraph',
            text:
              'Kings, queens, rooks, bishops, and pawns cannot move through occupied squares. Queens, rooks, and bishops are called sliding pieces because they move along lines until the line is blocked. Knights are the exception: a knight jumps directly to its destination.',
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'single',
              boards: [
                {
                  board: BASIC_BLOCKERS.board,
                  highlightSquares: BASIC_BLOCKER_TARGETS,
                  orientation: 'white',
                  label: 'BLOCKERS AND CAPTURES',
                  arrows: [
                    { orig: 'e4' as Square, dest: 'b4' as Square, brush: 'red' as const },
                    { orig: 'e4' as Square, dest: 'g4' as Square, brush: 'red' as const },
                    { orig: 'e4' as Square, dest: 'e6' as Square, brush: 'yellow' as const },
                  ],
                },
              ],
            },
            caption: 'The rook can capture the black pieces on b4 or g4, but it cannot move past them. The white pawn on e6 blocks the rook upward.',
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Check and checkmate',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'In regular chess, the king is protected by check and checkmate. A king is **in check** when an enemy piece attacks it. The checked player must make a legal move that leaves the king safe.',
          },
          {
            kind: 'paragraph',
            text:
              'Most checks are answered in one of three ways: move the king, block the line of attack, or capture the attacking piece. If none of those legal answers works, the game ends by **checkmate**.',
          },
          {
            kind: 'paragraph',
            text:
              'In regular chess, the king is never actually captured. This is one of the biggest changes in Fog of War chess: there is no check or checkmate warning, and the game ends only when a king is captured on the board.',
          },
        ],
      },
      {
        heading: 'Special moves',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'You do not need to memorize every special case before your first game. These rules are here so the board makes sense when they appear.',
          },
          { kind: 'sub-heading', text: 'Castling' },
          {
            kind: 'paragraph',
            text:
              'Castling is a one-move king-and-rook move. The king moves two squares toward a rook, and that rook moves to the square the king crossed. In regular chess, the pieces must be unmoved, the path must be empty, and the king cannot castle out of, through, or into check.',
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'pair',
              boards: [
                {
                  board: BASIC_CASTLE_BEFORE,
                  highlightSquares: ['f1' as Square, 'g1' as Square],
                  orientation: 'white',
                  label: 'BEFORE',
                  arrows: [
                    { orig: 'e1' as Square, dest: 'g1' as Square },
                    { orig: 'h1' as Square, dest: 'f1' as Square },
                  ],
                },
                { board: BASIC_CASTLE_AFTER, orientation: 'white', label: 'AFTER' },
              ],
            },
            caption: 'Kingside castling: the king goes to g1 and the rook lands on f1.',
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              'Queenside castling works the same way on the other side: the king moves two squares toward the rook, and the rook lands next to it.',
          },
          { kind: 'sub-heading', text: 'Promotion' },
          {
            kind: 'paragraph',
            text:
              'When a pawn reaches the farthest rank, it promotes into a queen, rook, bishop, or knight. Most players choose a queen because it is usually strongest.',
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'pair',
              boards: [
                {
                  board: BASIC_PROMOTION_BEFORE,
                  highlightSquares: ['e8' as Square],
                  orientation: 'white',
                  label: 'BEFORE',
                  arrows: [{ orig: 'e7' as Square, dest: 'e8' as Square }],
                },
                { board: BASIC_PROMOTION_AFTER, orientation: 'white', label: 'AFTER' },
              ],
            },
            caption: 'A pawn that reaches the last rank promotes. This example shows the usual choice: a queen.',
          } as ArticleBlock,
          { kind: 'sub-heading', text: 'En passant' },
          {
            kind: 'paragraph',
            text:
              'En passant is the unusual pawn capture. If an enemy pawn moves two squares from its starting rank and lands beside your pawn, your pawn may capture it diagonally as if it had moved only one square. This chance exists only on the very next move.',
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'pair',
              boards: [
                {
                  board: BASIC_EN_PASSANT_BEFORE,
                  highlightSquares: ['d6' as Square],
                  orientation: 'white',
                  label: 'BEFORE',
                  arrows: [
                    { orig: 'd7' as Square, dest: 'd5' as Square, brush: 'yellow' as const },
                    { orig: 'e5' as Square, dest: 'd6' as Square },
                  ],
                },
                { board: BASIC_EN_PASSANT_AFTER, orientation: 'white', label: 'AFTER' },
              ],
            },
            caption: 'After Black moves d7-d5 beside the white pawn, White may answer e5xd6 en passant and remove the pawn from d5.',
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Draws and other endings',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Some chess games end without a winner. Common regular-chess draws include stalemate, threefold repetition, the 50-move rule, agreement, and positions where checkmate is impossible.',
          },
          {
            kind: 'paragraph',
            text:
              'Mistboard Fog of War keeps the automatic draw ideas that matter for live play: repeated true positions and a no-progress clock. Checkmate-based endings change because Fog of War is decided by king capture.',
          },
        ],
      },
      {
        heading: 'Next: Fog of War chess',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'This page covers regular chess. Fog of War chess uses the same piece movement, then hides enemy pieces outside your vision and replaces checkmate with direct king capture.',
          },
          {
            kind: 'paragraph',
            text:
              'If the movement rules above feel familiar enough, the Dark Chess rules article is the next step.',
          },
          {
            kind: 'cta',
            buttons: [
              { label: 'Read Dark Chess Rules', href: '/articles/dark-chess-rules', emphasis: 'primary' },
              { label: 'Back to all rules', href: '/rules', emphasis: 'secondary' },
            ],
          } as ArticleBlock,
        ],
      },
    ],
  },
  {
    slug: 'dark-chess-rules',
    kind: 'rules',
    title: 'Dark Chess Rules',
    summary:
      'A side sees only what its pieces can legally see. King capture ends the game, not checkmate. Everything else is regular chess.',
    status: 'published',
    publishedAt: '2026-05-22',
    updatedAt: '2026-05-25',
    audience:
      'Any chess player who has heard of dark chess (or Fog of War) and wants to understand it from scratch.',
    thumbnail: ARTICLE_OG_POSITIONS['dark-chess-rules'],
    intro: [
      {
        kind: 'paragraph',
        text:
          "[Dark chess](https://en.wikipedia.org/wiki/Dark_chess) (also called Fog of War) was invented by Jens Bæk Nielsen and Torben Osted in 1989. It is the implicit-fog version of the idea: no umpire, no scan action. Each side's visibility is derived from where its pieces can legally move.",
      },
    ],
    sections: [
      {
        heading: 'The starting position',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Each side sees the squares its own pieces could legally move to (under [regular chess rules](https://en.wikipedia.org/wiki/Rules_of_chess)), plus the squares they stand on. Everything else is fog.",
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'triptych',
              boards: [
                { board: DARK_CHESS_START_STATE.board, fogSquares: DARK_CHESS_START_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                { board: DARK_CHESS_START_STATE.board, orientation: 'white', label: 'SERVER TRUTH' },
                { board: DARK_CHESS_START_STATE.board, fogSquares: DARK_CHESS_START_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
              ],
            },
          } as ArticleBlock,
        ],
      },
      {
        heading: 'What you see',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Here's the same rule, piece by piece.",
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'grid',
              boards: [
                { board: CONE_PAWN.board, fogSquares: CONE_PAWN_FOG, orientation: 'white', label: 'PAWN' },
                { board: CONE_KNIGHT.board, fogSquares: CONE_KNIGHT_FOG, orientation: 'white', label: 'KNIGHT' },
                { board: CONE_BISHOP.board, fogSquares: CONE_BISHOP_FOG, orientation: 'white', label: 'BISHOP' },
                { board: CONE_ROOK.board, fogSquares: CONE_ROOK_FOG, orientation: 'white', label: 'ROOK' },
                { board: CONE_QUEEN.board, fogSquares: CONE_QUEEN_FOG, orientation: 'white', label: 'QUEEN' },
                { board: CONE_KING.board, fogSquares: CONE_KING_FOG, orientation: 'white', label: 'KING' },
              ],
            },
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              "Vision moves with pieces. When a piece moves, the squares it used to cover go dark (unless another piece still sees them), and the squares it now reaches light up.",
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'pair',
              boards: [
                { board: DISCOVERY_BEFORE.board, fogSquares: DISCOVERY_BEFORE_FOG_W, orientation: 'white', label: 'BEFORE' },
                { board: DISCOVERY_FINAL.board, fogSquares: DISCOVERY_FINAL_FOG_W, orientation: 'white', label: 'AFTER', arrows: [{ orig: 'd3', dest: 'd7' }] },
              ],
            },
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              "Notice the rook on d7 sees the queen on b7 and the king on h7, but not a7. A piece's vision ends where its movement ends.",
          },
        ],
      },
      {
        heading: 'Win condition: king capture',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "The game ends when a king is captured. No check, no checkmate, no warning.",
          },
          {
            kind: 'interactive',
            widget: 'stepper',
            spec: {
              layout: 'triptych',
              positions: WHITE_BISHOP_WIN_POSITIONS,
            },
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Draws',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Mistboard auto-draws games on threefold repetition (same true position three times, same side to move, same castling and en-passant rights) and the 50-move rule (fifty full moves with no pawn move or capture). Both apply to the true position, not either player's view. There is no stalemate draw and no insufficient-material draw.",
          },
        ],
      },
      {
        heading: 'Edge cases',
        blocks: [
          { kind: 'sub-heading', text: 'Castling' },
          {
            kind: 'paragraph',
            text:
              "A king may castle out of, through, or into check.",
          },
          {
            kind: 'interactive',
            widget: 'stepper',
            spec: {
              layout: 'triptych',
              positions: [
                {
                  boards: [
                    { board: CASTLE_TRIPLE_PRE.board, fogSquares: CASTLE_TRIPLE_PRE_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    { board: CASTLE_TRIPLE_PRE.board, orientation: 'white', label: 'SERVER TRUTH' },
                    { board: CASTLE_TRIPLE_PRE.board, fogSquares: CASTLE_TRIPLE_PRE_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
                {
                  boards: [
                    { board: CASTLE_TRIPLE_BEFORE.board, fogSquares: CASTLE_TRIPLE_BEFORE_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    {
                      board: CASTLE_TRIPLE_BEFORE.board,
                      orientation: 'white',
                      label: 'SERVER TRUTH',
                      arrows: [
                        { orig: 'e4' as Square, dest: 'f6' as Square },
                        { orig: 'e8' as Square, brush: 'red' as const },
                        { orig: 'f8' as Square, brush: 'red' as const },
                        { orig: 'g8' as Square, brush: 'red' as const },
                      ],
                    },
                    { board: CASTLE_TRIPLE_BEFORE.board, fogSquares: CASTLE_TRIPLE_BEFORE_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
                {
                  boards: [
                    { board: CASTLE_TRIPLE_AFTER.board, fogSquares: CASTLE_TRIPLE_AFTER_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    { board: CASTLE_TRIPLE_AFTER.board, orientation: 'white', label: 'SERVER TRUTH', arrows: [{ orig: 'e8' as Square, dest: 'g8' as Square }] },
                    { board: CASTLE_TRIPLE_AFTER.board, fogSquares: CASTLE_TRIPLE_AFTER_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
                {
                  boards: [
                    { board: CASTLE_TRIPLE_FINAL.board, fogSquares: CASTLE_TRIPLE_FINAL_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    { board: CASTLE_TRIPLE_FINAL.board, orientation: 'white', label: 'SERVER TRUTH', arrows: [{ orig: 'f6' as Square, dest: 'g8' as Square }] },
                    { board: CASTLE_TRIPLE_FINAL.board, fogSquares: CASTLE_TRIPLE_FINAL_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
              ],
            },
          } as ArticleBlock,
          { kind: 'sub-heading', text: 'Pawn vision' },
          {
            kind: 'paragraph',
            text:
              "Pawns see forward push squares when those squares are empty. They see diagonal squares only when an enemy piece is actually there to capture.",
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'pair',
              boards: [
                { board: PAWN_CAPTURE_EXAMPLES.board, fogSquares: PAWN_CAPTURE_EXAMPLES_FOG, orientation: 'white', label: "WHITE'S VIEW" },
                { board: PAWN_CAPTURE_EXAMPLES.board, orientation: 'white', label: 'SERVER TRUTH' },
              ],
            },
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              "White does not see a4 or b4: black pawns block those pushes, so they are not legal moves. Some rulesets reveal blocked pawn squares; Mistboard does not.",
          },
          { kind: 'sub-heading', text: 'En passant' },
          {
            kind: 'paragraph',
            text:
              "En passant is chess's strangest move, so our vision rule bends for it: the capturing pawn sees the captured pawn on its adjacent square. The window is one move only. Pass on the capture and the chance is gone.",
          },
          {
            kind: 'interactive',
            widget: 'stepper',
            spec: {
              layout: 'triptych',
              positions: ENPASSANT_POSITIONS,
            },
          } as ArticleBlock,
        ],
      },
      {
        heading: 'A sample game',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Here is a complete engine game, shown from both player views and the server's full position.",
          },
          {
            kind: 'interactive',
            widget: 'stepper',
            spec: {
              layout: 'triptych',
              positions: ENGINE_SAMPLE_POSITIONS,
            },
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Try it',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Open a board, share the link, play. No account required.",
          },
          {
            kind: 'cta',
            buttons: [
              { label: 'Play dark chess', href: '/?play=lobby', emphasis: 'primary' },
            ],
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              "The full source is AGPL-3.0. The visibility logic that powers every position in this article is the same code path Mistboard's servers run in production.",
          },
        ],
      },
    ],
  },
  {
    slug: 'dark-chess-concepts',
    kind: 'article',
    title: 'Dark Chess Concepts',
    summary:
      'Strategy concepts for dark chess: how to read fogged squares, pawn signals, vanished moves, and capture clues after you know the rules.',
    status: 'draft',
    audience:
      'Players who know the dark chess rules and want to start making better decisions under fog.',
    thumbnail: ARTICLE_OG_POSITIONS['dark-chess-concepts'],
    intro: [
      {
        kind: 'paragraph',
        text:
          'Dark chess is not only about the pieces you see. Fogged squares, missing destinations, and vanished pieces are information too. This concepts series starts with the most useful habit: reading what the fog is telling you.',
      },
    ],
    sections: [
      {
        heading: 'Reading the fog',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "You can read the darkness to deduce what's happening on the board.",
          },
          {
            kind: 'paragraph',
            text:
              'The goal is not perfect certainty. A good dark chess player learns which hidden worlds are dangerous enough to respect, then chooses moves that survive those worlds.',
          },
        ],
      },
      {
        heading: 'Pawn moves',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "A pawn sees where it can push. Fog on a push square means an opponent piece or pawn is blocking it.",
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'pair',
              boards: [
                { board: DEDUCE_PAWN_OPEN.board, fogSquares: DEDUCE_PAWN_OPEN_FOG, orientation: 'white', label: 'EMPTY AHEAD' },
                { board: DEDUCE_PAWN_BLOCKED.board, fogSquares: DEDUCE_PAWN_BLOCKED_FOG, orientation: 'white', label: 'BLOCKED AHEAD' },
              ],
            },
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              "Same signal in opening play. After 1.d4 e6 2.Nf3 Bb4, b4 leaves White's view: the b2-pawn no longer pushes there. A Black piece just landed on b4. Pawn, knight, or bishop, and White can't tell which. But c3 and d2 are visible empty, so a bishop would capture the king next move. White has to defend on that assumption.",
          },
          {
            kind: 'interactive',
            widget: 'stepper',
            spec: {
              layout: 'triptych',
              positions: DEDUCE_BB4_POSITIONS,
            },
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Captures',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "When the opponent takes one of your pieces, the capture square falls to fog. You can't see what took. Here: White pawn on d5, with four Black attackers around it (c6 pawn, e6 pawn, c7 knight, d7 rook). After 1...exd5, the d5 pawn vanishes. Which Black piece took it?",
          },
          {
            kind: 'interactive',
            widget: 'stepper',
            spec: {
              layout: 'triptych',
              positions: DEDUCE_RECAP_NB_POSITIONS,
            },
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              "Add a White bishop on h3. Its diagonal keeps e6 in view. After the same 1...exd5, White loses d5 and the bishop sees e6 fall empty. So the e-pawn took.",
          },
          {
            kind: 'interactive',
            widget: 'stepper',
            spec: {
              layout: 'triptych',
              positions: DEDUCE_RECAP_POSITIONS,
            },
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              "A pawn behind the captured piece can also prove what did not happen. Here White's d5 pawn is attacked by a Black pawn on e6 and a Black knight on f6, with another White pawn on d4 behind it. After the pawn vanishes, d5 is fogged in front of the d4 pawn.",
          },
          {
            kind: 'interactive',
            widget: 'stepper',
            spec: {
              layout: 'triptych',
              positions: DEDUCE_BACK_PAWN_POSITIONS,
            },
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              "White makes a quiet king move. Then the hidden piece on d5 moves away, and d5 becomes visible empty again. That rules out 1...exd5: a Black pawn on d5 would still be blocking the d4 pawn's push square. The mobile piece was the knight.",
          },
        ],
      },
      {
        heading: 'Castling into hidden safety',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "In regular chess, castling choices are judged in public. In dark chess, your opponent often does not know where your king is unless a scout has seen it, a move has revealed it, or castling itself gives the position away.",
          },
          {
            kind: 'paragraph',
            text:
              "That makes some unconventional castles playable. You can sometimes castle into a pawn structure or side you would normally reject because the opponent cannot immediately aim at a king they have not located. The safety is relative: the structure still matters, but the hidden king buys time.",
          },
          {
            kind: 'paragraph',
            text:
              "The danger is scouting. Once a knight, bishop, rook, queen, or pawn signal reveals where the king landed, the position stops being mysterious and has to hold up as chess again.",
          },
        ],
      },
      {
        heading: 'What to do with partial proof',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Dark chess deduction usually narrows the problem instead of solving it outright. Once a hidden bishop, rook, queen, or pawn capture is plausible, the practical question is whether your next move still works if that possibility is true.',
          },
          {
            kind: 'paragraph',
            text:
              'That habit is the bridge from rules to strategy: read the fog, name the dangerous possibilities, and defend against the ones that can end the game.',
          },
          {
            kind: 'cta',
            buttons: [
              { label: 'Read the rules', href: '/articles/dark-chess-rules', emphasis: 'secondary' },
              { label: 'Play dark chess', href: '/?play=lobby', emphasis: 'primary' },
            ],
          } as ArticleBlock,
        ],
      },
    ],
  },
  {
    slug: 'draft960',
    kind: 'rules',
    title: 'Draft960: dark chess with a hidden draft',
    summary:
      "Each player drafts one of three Chess960 setups, sealed. From move zero, you don't know your opponent's back rank. Everything else is regular dark chess.",
    status: 'draft',
    audience:
      'Readers who have grokked dark chess (start with the rules article if not). Curious chess players following the Mistboard OG card to learn what makes Draft960 unique.',
    thumbnail: ARTICLE_OG_POSITIONS.draft960,
    sections: [
      {
        heading: 'The draft',
        blocks: [
          {
            kind: 'paragraph',
            text: "The server deals each player three random Chess960 back ranks. You pick one. Your opponent independently picks one of theirs. The drafts are sealed. Neither side sees the other's offers or choice.",
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'triptych',
              boards: [
                { board: piecesToBoard(startingPositionFromBackRank(DRAFT960_OFFER_A).filter((p) => p.color === 'white')), fogSquares: PICK_SCREEN_FOG, orientation: 'white', label: 'A' },
                { board: piecesToBoard(startingPositionFromBackRank(DRAFT960_OFFER_B).filter((p) => p.color === 'white')), fogSquares: PICK_SCREEN_FOG, orientation: 'white', label: 'B' },
                { board: piecesToBoard(startingPositionFromBackRank(DRAFT960_OFFER_C).filter((p) => p.color === 'white')), fogSquares: PICK_SCREEN_FOG, orientation: 'white', label: 'C' },
              ],
            },
            caption: 'Your three offers.',
          } as ArticleBlock,
          {
            kind: 'live-boards',
            spec: {
              layout: 'triptych',
              boards: [
                { board: piecesToBoard(startingPositionFromBackRank(DRAFT960_BLACK_OFFER_A).filter((p) => p.color === 'black')), fogSquares: BLACK_PICK_SCREEN_FOG, orientation: 'black', label: 'A' },
                { board: piecesToBoard(startingPositionFromBackRank(DRAFT960_BLACK_OFFER_B).filter((p) => p.color === 'black')), fogSquares: BLACK_PICK_SCREEN_FOG, orientation: 'black', label: 'B' },
                { board: piecesToBoard(startingPositionFromBackRank(DRAFT960_BLACK_OFFER_C).filter((p) => p.color === 'black')), fogSquares: BLACK_PICK_SCREEN_FOG, orientation: 'black', label: 'C' },
              ],
            },
            caption: "Your opponent gets an independent set of three. Neither side sees the other's.",
          } as ArticleBlock,
        ],
      },
      {
        heading: 'The starting position',
        blocks: [
          {
            kind: 'live-boards',
            spec: {
              layout: 'triptych',
              boards: [
                { board: D960_FULL_STATES[0]!.board, fogSquares: fogFor(D960_FULL_STATES[0]!, 'white'), orientation: 'white', label: "WHITE'S VIEW" },
                { board: D960_FULL_STATES[0]!.board, orientation: 'white', label: 'SERVER TRUTH' },
                { board: D960_FULL_STATES[0]!.board, fogSquares: fogFor(D960_FULL_STATES[0]!, 'black'), orientation: 'white', label: "BLACK'S VIEW" },
              ],
            },
            caption: "Both players picked offer A. Each sees their own back rank. The opponent's stays in fog.",
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text: "960 × 960 = **921,600** possible starts. Standard chess is one of them.",
          },
        ],
      },
      {
        heading: 'Try it',
        blocks: [
          {
            kind: 'paragraph',
            text: "Open a board, pick Draft960, share the link. No account required.",
          },
          {
            kind: 'cta',
            buttons: [
              { label: 'Play Draft960', href: '/', emphasis: 'primary' },
            ],
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text: "The full source is AGPL-3.0. The variant runs on the same dark chess code path used everywhere on Mistboard.",
          },
        ],
      },
    ],
  },
  {
    slug: 'xiangqi-rules-primer',
    kind: 'rules',
    title: 'Xiangqi Rules',
    summary:
      'The regular xiangqi baseline for Mistboard: intersections, palaces, river rules, piece movement, cannon screens, checks, facing generals, and endings.',
    showSummaryOnPage: false,
    status: 'published',
    publishedAt: '2026-05-26',
    updatedAt: '2026-05-30',
    audience:
      'Mistboard readers who know chess or dark chess and want the xiangqi baseline before adding fog.',
    thumbnail: { kind: 'svg', svg: XQ_RULES_PRIMER_THUMBNAIL },
    intro: [
      {
        kind: 'paragraph',
        text:
          'Xiangqi is the game underneath Dark Xiangqi. If you already play xiangqi, you can skip this page and go straight to the [Dark Xiangqi rules](/articles/dark-xiangqi-rules). If you know Western chess but not xiangqi, this page gives you the board, pieces, and rule details you need before fog is added.',
      },
      {
        kind: 'paragraph',
        text:
          'The big differences are practical: pieces sit on line intersections, generals live inside palaces, elephants cannot cross the river, horses can be blocked, cannons need screens to capture, and stalemate is not a draw.',
      },
    ],
    sections: [
      {
        heading: 'Xiangqi in one minute',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Xiangqi is played by two players: Red and Black. Red moves first. Each side starts with 16 pieces: one general, two advisors, two elephants, two horses, two chariots, two cannons, and five soldiers.',
          },
          {
            kind: 'paragraph',
            text:
              'In normal xiangqi, the goal is to checkmate the opposing general. If a player has no legal move, that player loses. That is different from Western chess, where stalemate is a draw.',
          },
          {
            kind: 'paragraph',
            text:
              'A move either goes to an empty point or captures an enemy piece on the destination point. There are no promotions, castling, en passant captures, or drops.',
          },
        ],
      },
      {
        heading: 'The board',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The board has 9 files and 10 ranks, but pieces sit on the intersections of the lines, not inside squares. Pieces capture by moving to an enemy-occupied point. You cannot land on your own piece.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_RULES_PRIMER_START_BOARD,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              'The **palace** is the 3 by 3 box on each player\'s back side. Generals and advisors must stay inside their own palace. The **river** divides the board in half. Elephants cannot cross it, and soldiers gain sideways movement after crossing it.',
          },
        ],
      },
      {
        heading: 'The pieces',
        blocks: [
          {
            kind: 'paragraph',
            text:
              '**General:** moves one point horizontally or vertically inside its own palace. The two generals may not face each other on the same open file.',
          },
          {
            kind: 'paragraph',
            text:
              '**Advisor:** moves one point diagonally inside its own palace.',
          },
          {
            kind: 'paragraph',
            text:
              '**Elephant:** moves exactly two points diagonally. It cannot cross the river. If another piece sits on the midpoint of that diagonal, the elephant is blocked.',
          },
          {
            kind: 'paragraph',
            text:
              '**Horse:** moves one point orthogonally and then one point diagonally outward, similar to a chess knight. It does not jump: if the adjacent leg point is occupied, the horse cannot move in that direction.',
          },
          {
            kind: 'paragraph',
            text:
              '**Chariot:** moves any distance horizontally or vertically, like a rook. It cannot jump over pieces.',
          },
          {
            kind: 'paragraph',
            text:
              '**Cannon:** moves like a chariot when it is not capturing. To capture, it must jump over exactly one intervening piece, called the screen, and land on an enemy piece beyond it.',
          },
          {
            kind: 'paragraph',
            text:
              '**Soldier:** moves one point forward. After crossing the river, it may also move one point sideways. It never moves backward and never promotes.',
          },
        ],
      },
      {
        heading: 'Rules chess players usually miss',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'A horse can be blocked. Unlike a knight, it cannot jump over the adjacent leg point.',
          },
          {
            kind: 'paragraph',
            text:
              'An elephant can be blocked, and it never crosses the river.',
          },
          {
            kind: 'paragraph',
            text:
              'A cannon does not capture like a rook. It needs exactly one screen between itself and the target.',
          },
          {
            kind: 'paragraph',
            text:
              'The two generals cannot face each other on the same open file in normal xiangqi. A move that exposes that direct line is illegal, and an exposed general can be captured along the file.',
          },
          {
            kind: 'paragraph',
            text:
              'Stalemate is a loss for the player with no legal move, not a draw.',
          },
        ],
      },
      {
        heading: 'Checks and endings',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'In normal xiangqi, a general is in check when an enemy piece attacks it. The checked player must answer the threat. If there is no legal answer, the game ends by checkmate.',
          },
          {
            kind: 'paragraph',
            text:
              'Normal xiangqi also has rules for repetition, perpetual check, and perpetual chase. Those rules can get detailed in tournament play. For this rules page, the useful takeaway is simple: normal xiangqi does not allow endless forcing cycles as a free drawing weapon.',
          },
        ],
      },
      {
        heading: 'Next: Dark Xiangqi',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Dark Xiangqi keeps the board, setup, and piece movement above. Then it changes the information and the ending: enemy pieces outside your vision are hidden, check warnings disappear, facing generals are allowed, and the game ends when a general is captured.',
          },
          {
            kind: 'paragraph',
            text:
              'That means the same xiangqi tactics still matter, but under fog. Horse legs, elephant eyes, cannon screens, palace geometry, and river-crossed soldiers all become information signals as well as movement rules.',
          },
          {
            kind: 'cta',
            buttons: [
              { label: 'Read Dark Xiangqi', href: '/articles/dark-xiangqi-rules', emphasis: 'primary' },
              { label: 'Back to all rules', href: '/rules', emphasis: 'secondary' },
            ],
          } as ArticleBlock,
        ],
      },
    ],
  },
  {
    slug: 'dark-xiangqi-rules',
    kind: 'rules',
    title: 'Dark Xiangqi',
    summary:
      'Xiangqi under Fog of War: each side sees only what its pieces can reach, hidden blockers matter, check warnings disappear, and the general falls by capture.',
    showSummaryOnPage: false,
    status: 'published',
    publishedAt: '2026-05-26',
    updatedAt: '2026-05-30',
    audience:
      'Xiangqi players, dark chess players, and anyone who wants a clean first explanation of xiangqi under fog.',
    thumbnail: { kind: 'svg', svg: XQ_DARK_XIANGQI_THUMBNAIL },
    intro: [
      {
        kind: 'paragraph',
        text: 'Dark Xiangqi is the modern Fog of War version of [xiangqi](/articles/xiangqi-rules-primer): pieces keep their xiangqi movement, but unseen enemy pieces stay hidden and danger is not announced. Capture the general to win.',
      },
      {
        kind: 'paragraph',
        text:
          'If xiangqi is new to you, start with [Xiangqi Rules](/articles/xiangqi-rules-primer). If you already play xiangqi, the sections below explain only what fog changes.',
      },
    ],
    sections: [
      {
        heading: 'The starting position',
        blocks: [
          {
            kind: 'paragraph',
            text: 'At the start, you see your own pieces and every legal destination they control. Everything else is fog. Your opponent sees a different board from the same true position.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_START_TRIPTYCH,
          } as ArticleBlock,
        ],
      },
      {
        heading: 'What you see',
        blocks: [
          {
            kind: 'paragraph',
            text: "Here's the same rule, piece by piece.",
          },
          {
            kind: 'raw-svg',
            svg: XQ_VISIBILITY_GRID,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text: 'Vision is recomputed from the true position after every move, so hidden blockers, cannon screens, horse legs, elephant eyes, and newly opened lines immediately change what you know.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_VISION_MOVE_PAIR,
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Win condition: general capture',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Capture the general to win. Checks and checkmates are not announced, and the server does not warn a player who has moved into danger.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_GENERAL_CAPTURE_PAIR,
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Draws',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Games auto-draw on threefold repetition and after 60 plies with no capture. Both are judged from the true position, not either player\'s view. If the side to move has no legal move, that side loses; there are no stalemate draws.',
          },
        ],
      },
      {
        heading: 'Edge cases',
        blocks: [
          { kind: 'sub-heading', text: 'Cannons' },
          {
            kind: 'paragraph',
            text: 'A cannon moves like a chariot when it is not capturing. To capture, it jumps exactly one screen and lands on the first enemy piece beyond it. Under fog, the target is visible and marked, while the screen appears as unknown occupancy.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_CANNON_RULE_PAIR,
          } as ArticleBlock,
          { kind: 'sub-heading', text: 'Facing generals' },
          {
            kind: 'paragraph',
            text: 'Orthodox xiangqi forbids facing generals. Dark Xiangqi allows the position; if one general sees the other on a clear file, it can capture across that file.',
          },
          {
            kind: 'raw-svg-stepper',
            steps: XQ_FACING_GENERAL_STEPS,
          } as ArticleBlock,
          { kind: 'sub-heading', text: 'Horse legs' },
          {
            kind: 'paragraph',
            text: 'A horse can move only when the adjacent leg square is clear. If a hidden piece blocks that leg, the destination disappears from your visible set and the leg square appears as a ? marker.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_BLOCKED_HORSE_LEGS_PAIR,
          } as ArticleBlock,
          { kind: 'sub-heading', text: 'Elephant eyes' },
          {
            kind: 'paragraph',
            text: 'An elephant moves two points diagonally and cannot cross the river. If a hidden piece sits on the midpoint eye, the diagonal destination disappears and the eye square appears as a ? marker.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_BLOCKED_ELEPHANT_EYES_PAIR,
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Play status',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Playable Dark Xiangqi games are not public yet. These rules are published first so players can review the variant before live play opens.',
          },
          {
            kind: 'cta',
            buttons: [
              { label: 'Back to all rules', href: '/rules', emphasis: 'secondary' },
            ],
          } as ArticleBlock,
        ],
      },
    ],
  },
  {
    slug: 'mini-xiangqi-rules',
    kind: 'rules',
    title: 'Mini Xiangqi',
    summary:
      'The compact 7x7 xiangqi ruleset behind Dark Mini Xiangqi: fewer pieces, no river, sideways soldiers from move one, checkmate wins, and perpetual check loses.',
    showSummaryOnPage: false,
    status: 'draft',
    audience:
      'Mistboard readers reviewing the non-fog base rules before Dark Mini Xiangqi is promoted.',
    thumbnail: { kind: 'svg', svg: DARK_MINI_XIANGQI_THUMBNAIL },
    intro: [
      {
        kind: 'paragraph',
        text:
          'Mini Xiangqi was invented in 1973 by [Shigenobu Kusumoto of Osaka, Japan](https://playstrategy.org/variant/minixiangqi). It is a simplified, reduced version of [xiangqi](/articles/xiangqi-rules-primer): a smaller board, fewer pieces, and no river.',
      },
      {
        kind: 'paragraph',
        text:
          'This page describes the open-information base game. Dark Mini Xiangqi starts here, then adds fog and general capture.',
      },
    ],
    sections: [
      {
        heading: 'Board and setup',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Mini Xiangqi is xiangqi compressed to a 7 by 7 board, with a simplified army: guards and elephants are dropped. The palace remains a 3 by 3 box for each general, but the board has no river.',
          },
          {
            kind: 'raw-svg',
            svg: DARK_MINI_XIANGQI_THUMBNAIL,
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Piece movement',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'General, chariot, cannon, and horse movement is the same as in xiangqi.',
          },
          {
            kind: 'paragraph',
            text:
              'The only important movement change is the soldier: because there is no river, soldiers may move and capture forward or sideways from the start. They still never move backward.',
          },
          {
            kind: 'paragraph',
            text:
              'Facing generals are still illegal.',
          },
        ],
      },
      {
        heading: 'Winning and draws',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Checkmate wins. As in xiangqi, a player with no legal move loses instead of drawing by stalemate.',
          },
          {
            kind: 'paragraph',
            text:
              'Mistboard Mini Xiangqi uses a fourth-repetition rule. If the same true position with the same side to move appears for a fourth time, the game ends. If the repeating move gives check, the checking player loses. Otherwise, the game is a draw.',
          },
          {
            kind: 'paragraph',
            text:
              'The game is also drawn after 60 plies without a capture.',
          },
        ],
      },
      {
        heading: 'Next: add fog',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Dark Mini Xiangqi uses this smaller board and piece set, then turns the game into a Fog of War variant. The compact board makes cannon screens, horse legs, and palace threats appear faster than they do on the full xiangqi board.',
          },
          {
            kind: 'cta',
            buttons: [
              { label: 'Read Dark Mini Xiangqi', href: '/articles/dark-mini-xiangqi-rules', emphasis: 'primary' },
              { label: 'Back to all rules', href: '/rules', emphasis: 'secondary' },
            ],
          } as ArticleBlock,
        ],
      },
    ],
  },
  {
    slug: 'dark-mini-xiangqi-rules',
    kind: 'rules',
    title: 'Dark Mini Xiangqi',
    summary:
      'Mini Xiangqi under Fog of War: a compact 7x7 variant with generals, chariots, cannons, horses, soldiers, shrouded blockers, and general capture.',
    showSummaryOnPage: false,
    status: 'published',
    publishedAt: '2026-05-30',
    audience:
      'Dark Xiangqi readers who want the smaller experimental ruleset Mistboard is testing first.',
    thumbnail: { kind: 'svg', svg: DARK_MINI_XIANGQI_THUMBNAIL },
    intro: [
      {
        kind: 'paragraph',
        text:
          'Dark Mini Xiangqi is Mini Xiangqi played with Fog of War. Each player sees all of their own pieces and only the enemy pieces their army can see. The board is 7 by 7, the piece set is compact, and the game ends by capturing the opposing general.',
      },
      {
        kind: 'paragraph',
        text:
          'The smaller board is not meant to make xiangqi casual. It keeps the cannon, horse, chariot, soldier, and palace-general tactics that matter most under hidden information while reducing empty fog and making games easier to review.',
      },
    ],
    sections: [
      {
        heading: 'Board and setup',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Dark Mini Xiangqi uses the Mini Xiangqi board: 7 files by 7 ranks, with files a through g and ranks 1 through 7. Red starts on rank 1, Black starts on rank 7, and Red moves first.',
          },
          {
            kind: 'raw-svg',
            svg: DARK_MINI_XIANGQI_THUMBNAIL,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              'Each side has one general, two chariots, two cannons, two horses, and five soldiers. The back rank is chariot, cannon, horse, general, horse, cannon, chariot. Soldiers start one rank ahead on files a, c, d, e, and g.',
          },
          {
            kind: 'paragraph',
            text:
              'Each general is confined to a 3 by 3 palace. There are no advisors, elephants, river, promotions, drops, or reserves.',
          },
        ],
      },
      {
        heading: 'Piece movement',
        blocks: [
          {
            kind: 'paragraph',
            text:
              '**General:** moves one point orthogonally inside its own palace. If the two generals face each other on the same open file, a general may capture the opposing general across that file.',
          },
          {
            kind: 'paragraph',
            text:
              '**Chariot:** moves any distance horizontally or vertically. It cannot jump, and it may capture the first enemy piece it reaches.',
          },
          {
            kind: 'paragraph',
            text:
              '**Cannon:** moves like a chariot when it is not capturing. To capture, it jumps over exactly one intervening piece, called the screen, and lands on the first enemy piece beyond it.',
          },
          {
            kind: 'paragraph',
            text:
              '**Horse:** moves one point orthogonally and then one point diagonally outward, like a xiangqi horse. It cannot move if the adjacent orthogonal leg point is occupied.',
          },
          {
            kind: 'paragraph',
            text:
              '**Soldier:** moves and captures one point forward or sideways from the start of the game. There is no river-crossing rule because soldiers already have sideways movement.',
          },
        ],
      },
      {
        heading: 'Fog of War',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'A player sees all of their own pieces, the points their pieces can see, enemy pieces on visible unshrouded points, and shrouded occupancy markers for certain blockers and cannon screens.',
          },
          {
            kind: 'paragraph',
            text:
              'A player does not see enemy pieces outside visible points, whether a hidden point is empty, the role of a shrouded blocker, or empty cannon gap points between a screen and target.',
          },
          {
            kind: 'paragraph',
            text:
              'The key cannon rule is **screen shrouded, target revealed**. Empty points before the screen are visible, the screen appears occupied but unidentified, empty points between the screen and target stay fogged, and the capturable target is visible.',
          },
          {
            kind: 'paragraph',
            text:
              'Horses follow the same privacy principle. If a horse leg is blocked, the leg point appears occupied but unidentified, and the destinations behind that leg stay hidden.',
          },
        ],
      },
      {
        heading: 'Winning and draws',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The game ends when a general is captured. There is no separate check or checkmate rule, and check warnings are not announced.',
          },
          {
            kind: 'paragraph',
            text:
              'A player may move into danger, leave their general exposed, or allow facing generals. This follows Mistboard\'s Fog of War rule philosophy: the server should not reveal warning information that the visible position may not justify.',
          },
          {
            kind: 'paragraph',
            text:
              'If the side to move has no legal move, that side loses by immobilization. Draws are adjudicated from the true position, not either player\'s view: threefold repetition is an automatic draw, and a no-capture progress clock can also draw the game.',
          },
        ],
      },
      {
        heading: 'Play status',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Dark Mini Xiangqi is an experimental launch candidate, not a public Mistboard game mode yet. The intended game spec id is dark-mini-xiangqi.',
          },
          {
            kind: 'paragraph',
            text:
              'The conservative path is rules and fog tests first, a hidden local play lab second, live runtime only after privacy tests pass, and public launch only after mobile play, invite/share, and postgame behavior are ready.',
          },
          {
            kind: 'cta',
            buttons: [
              { label: 'Back to all rules', href: '/rules', emphasis: 'secondary' },
            ],
          } as ArticleBlock,
        ],
      },
    ],
  },
  {
    slug: 'engine-belief-state',
    kind: 'article',
    title: 'Building an engine for hidden-information chess',
    summary:
      'Stockfish-class engines don’t transfer to dark chess because they assume perfect information. The right technique is belief-state search with particle-filter approximations, drawn from the Reconnaissance Blind Chess literature.',
    status: 'outline',
    audience:
      'Chess engine developers, AI/ML researchers, software engineers curious about belief-state methods.',
    thumbnail: ARTICLE_OG_POSITIONS['engine-belief-state'],
    tldr: [
      'Standard chess engines assume one ground-truth board. Dark chess requires reasoning over a distribution of possible truths.',
      'Particle filters are the tractable approximation: keep N candidate positions consistent with observations, simulate moves on each, aggregate.',
      'Public RBC engines (StrangeFish, ReBeL, Penumbra, Obscuro) form the academic family. Mistboard’s engine is an open particle filter you can play against today.',
    ],
    sections: [
      {
        heading: 'Why Stockfish doesn’t transfer',
        paragraphs: [
          '[VISUAL: alpha-beta search tree on the left (familiar), the same tree on the right with each move forking into 100+ hidden-info branches.]',
          'Section TBD. Cover: standard search assumes a single ground-truth position, heuristics assume sight, "the position" in FoW isn’t one thing but a distribution, naive enumeration runs out of memory after 4 plies.',
        ],
      },
      {
        heading: 'The belief state',
        paragraphs: [
          '[VISUAL: mid-game board with a probability heatmap overlaid on opponent piece locations.]',
          'Section TBD. Cover: probability distribution over true states, constraint propagation (every observed square narrows the set), how the belief evolves through a game (huge at move 1, concentrates mid-game, can collapse late-game), hand-wavy formal definition without scary equations.',
        ],
      },
      {
        heading: 'Particle filters from first principles',
        paragraphs: [
          '[VISUAL: 5-panel sequence — particles sampled, particles weighted by observation match, particles resampled with replacement, drift forward in time, repeat.]',
          'Section TBD. Cover: the technique in one paragraph, one full step worked out on a sample position, why it’s tractable (bounded memory, parallelizable), the particle-count vs accuracy trade-off, degeneracy as a late-game phenomenon.',
        ],
      },
      {
        heading: 'Move selection over particles',
        paragraphs: [
          '[VISUAL: candidate-move tree with particle simulations branching from each.]',
          'Section TBD. Cover: for each candidate move simulate consequences on each particle and aggregate, depth-vs-breadth trade.',
        ],
      },
      {
        heading: 'Explore the particle-count trade for yourself',
        paragraphs: [
          '[INTERACTIVE CENTERPIECE: live particle-count vs win-rate slider. Reader drags particle count, sees benchmark win-rate against a baseline shift in real-time.]',
          'Section TBD. Brief framing of the experiment, what to look for, what the curve says about engineering trade-offs.',
        ],
      },
      {
        heading: 'The RBC academic family',
        paragraphs: [
          '[VISUAL: timeline 2017-2026 with major engines, ratings, methods, paper citations.]',
          'Section TBD. Cover: Reconnaissance Blind Chess as the academic neighbor; StrangeFish (CMU, 2018), ReBeL (FAIR, 2020), Penumbra (Georgia Tech), Obscuro (CMU, Feb 2026 — first superhuman FoW chess engine, closed source); which methods transfer to FoW specifically.',
        ],
      },
      {
        heading: 'Mistboard’s current engine',
        paragraphs: [
          '[VISUAL: screenshot from the Engine Lab showing particle visualizations on a real game.]',
          'Section TBD. Cover: implementation (particle filter, Tier-1 strategy), current strength positioning, specific failure modes encountered (filter extinction, etc.), open source under AGPL-3.',
        ],
      },
      {
        heading: 'Particle filter step-by-step',
        paragraphs: [
          '[INTERACTIVE CENTERPIECE: forward/back through one full particle update cycle on a real Mistboard position. Show particles concretely, watch them reweight as observations come in.]',
          'Section TBD. The most technical centerpiece. Pair with the from-first-principles section but at a real game level of detail.',
        ],
      },
      {
        heading: 'What’s hard and what’s open',
        paragraphs: [
          '[VISUAL: difficulty axes diagram — what each axis costs, where the frontier is.]',
          'Section TBD. Cover: belief representation (particles vs neural nets vs exact), search depth (1-ply vs N-ply over uncertain positions), opponent modeling (assume rational vs learn from data), transfer (can a strong FoW engine teach a stronger one?).',
        ],
      },
      {
        heading: 'The FUCI protocol',
        paragraphs: [
          '[VISUAL: protocol-message diagram, UCI-style.]',
          'Section TBD. Cover: why a protocol matters (UCI’s role for Stockfish/Lc0 in regular chess), hypothetical message structure, when this will exist (planned, not yet built).',
        ],
      },
      {
        heading: 'Contribute',
        paragraphs: [
          'CTA: GitHub repo, public engine protocol docs, baseline engines, benchmark methods, contribution guide link.',
        ],
      },
    ],
  },
  {
    slug: 'server-enforced-fog',
    kind: 'article',
    title: 'Server-Enforced Dark Chess',
    summary:
      'Server-owned state, projected player views, seat authority, and public postgame review for Mistboard games.',
    status: 'outline',
    audience:
      'Players and engineers who want a reference for how Mistboard keeps live hidden-information games private and postgame review public.',
    thumbnail: ARTICLE_OG_POSITIONS['server-enforced-fog'],
    tldr: [
      'The server owns truth. Players receive only the seat-scoped view they are allowed to use.',
      'Live rooms are private to seated players. Finished games become public through the review page.',
    ],
    sections: [
      {
        heading: 'The model',
        blocks: [
          { kind: 'paragraph', text: 'Dark chess is regular chess with one hidden-information rule: each side sees only the squares its own pieces reach. Mistboard runs that rule on the server. Browsers receive `PlayerView`. No browser receives a full board with CSS fog painted over it.' },
          {
            kind: 'live-boards',
            spec: {
              layout: 'triptych',
              boards: [
                { board: SERVER_FOG_FRAME_W.state.board, fogSquares: SERVER_FOG_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                { board: SERVER_FOG_TRUTH_STATE.board, orientation: 'white', label: 'SERVER TRUTH' },
                { board: SERVER_FOG_FRAME_B.state.board, fogSquares: SERVER_FOG_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
              ],
            },
            caption: 'Same position after 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6. The center board is canonical server state; the side boards are the payloads sent to each player.',
          } as ArticleBlock,
          { kind: 'paragraph', text: 'The core rule is simple: compute truth once, project the allowed view per seat, and keep the full event log private until the game is finished.' },
          { kind: 'paragraph', text: 'Live games are seat-gated. Other sockets are closed before game data is sent, and the replay endpoint returns 403 until the game is terminal. Draws, flags, and repetition use canonical state.' },
          { kind: 'paragraph', text: 'The same server-owned event log is the base for PvP, PvE, calibration, and tournaments. This article follows the player-facing live-room boundary.' },
        ],
      },
      {
        heading: 'How views are computed',
        blocks: [
          { kind: 'paragraph', text: 'For a player, the boundary is `PlayerView`: visible squares, visible pieces, legal moves, status, and clock for that seat.' },
          { kind: 'code', language: 'typescript', text: SERVER_FOG_VIEW_KERNEL },
          { kind: 'paragraph', text: 'There is no opponent array in the browser to unmask.' },
        ],
      },
      {
        heading: 'Sample data payload',
        blocks: [
          { kind: 'paragraph', text: 'The live move stream uses `event-appended`, the optimized frame shape. This is the white payload from the position above, shortened to the fields that matter:' },
          { kind: 'code', language: 'json', text: SERVER_FOG_DELTA_PAYLOAD, caption: 'Representative steady-state frame. The real payload carries complete board, square, move, and clock values.' },
          { kind: 'paragraph', text: '**Core fields:** `seat` identifies the recipient, `seq` orders the stream, `state.board` is the redacted board, `state.visibleSquares` is the clear-vs-fog mask, and `state.status` carries the canonical turn/result state.' },
          { kind: 'paragraph', text: 'If the appended event is visible to this seat, the frame includes one filtered `event`. If the move is hidden, the `event` field is omitted and the projected `state` still advances.' },
          { kind: 'paragraph', text: 'Snapshots still exist for first connect, explicit recovery, and final resync. They include the filtered event history needed to hydrate the client, so they are larger than the per-move stream.' },
        ],
      },
      {
        heading: 'Player move',
        blocks: [
          { kind: 'paragraph', text: 'A move request is just coordinates:' },
          { kind: 'code', language: 'typescript', text: SERVER_FOG_MOVE_PAYLOAD },
          { kind: 'paragraph', text: 'The server validates against canonical state, applies the move, appends an event, and projects the next view. The client never decides whether hidden information exists or whether an invisible move happened.' },
        ],
      },
      {
        heading: 'Live room access',
        blocks: [
          { kind: 'paragraph', text: 'After a move is accepted, the server may need to send two different views. The remaining question is who is allowed to receive either one.' },
          { kind: 'paragraph', text: 'A socket gets live room data only after it proves control of the white or black seat. Anonymous seats use random bearer tokens; the server stores only a SHA-256 token hash and compares the presented token in constant time. Signed-in seats also require the matching account session.' },
          { kind: 'paragraph', text: 'Non-players do not get a live spectator projection. A socket without a valid seat is rejected before room data is sent, and the live replay endpoint stays closed until the game reaches a terminal state.' },
        ],
      },
      {
        heading: 'Postgame review',
        blocks: [
          { kind: 'paragraph', text: 'When the game becomes terminal, the privacy rule changes. Mistboard releases game data through the review page, and that page can be viewed by everybody.' },
          { kind: 'paragraph', text: 'The review page is the public reveal surface. The live room remains seat-scoped, while the finished game record can load the event log for review, sharing, and dispute resolution.' },
          { kind: 'paragraph', text: 'Ratings, when enabled, should point at eligible completed account-backed games. The integrity point here is that rated results can have a public finished-game record without opening live rooms to non-players.' },
        ],
      },
      {
        heading: 'Scope and checks',
        blocks: [
          { kind: 'paragraph', text: 'This is not a full anti-cheat claim. It is the narrower integrity claim this architecture can prove: during live play, hidden truth is not sent to unauthorized browser paths; after the game ends, the record is reviewable.' },
          { kind: 'paragraph', text: 'Anonymous casual seats are bearer-token seats, not account-grade identity. There is also no live spectator mode for hidden-information games; friends watch through the review page after the game ends.' },
          { kind: 'paragraph', text: 'The boundary is covered by wire-format regression tests that open real WebSockets, drive moves, and assert on the bytes each seat receives.' },
          { kind: 'paragraph', text: 'Those tests cover live third-client rejection, seat-token reclaim behavior, `event-appended` delivery, filtered move events, and the rule that snapshot and delta frames use the same projection helpers. That is the claim: seat-scoped live play, public review after terminal state.' },
        ],
      },
    ],
  },
];

export function findArticle(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}

// Real WebSocket snapshot frame captured from a live PvP dark-chess room
// via apps/server/scripts/capture-snapshot.mjs and anonymized. Embedded as
// a verbatim artifact for the server-enforced-fog article. Re-run the
// capture script after wire-format changes.
export const SERVER_FOG_SNAPSHOT_ARTIFACT = articleSnapshotFog as unknown as Record<string, unknown>;
export const SERVER_FOG_SNAPSHOT_JSON = SERVER_FOG_SNAPSHOT_JSON_TEXT;
