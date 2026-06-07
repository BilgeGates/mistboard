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
  createInitialMiniXiangqiBoard,
  createInitialMiniXiangqiState,
  createInitialXiangqiState,
  computeMiniXiangqiVision,
  computeVision as computeXiangqiVision,
  getMiniXiangqiPlayerView,
  getPlayerView as getXiangqiPlayerView,
  darkChessVariant,
  miniXiangqiCoordOf,
  miniXiangqiSquareOf,
  squareOf as xiangqiSquareOf,
  type BackRankRole,
  type Board,
  type Chess960Start,
  type GameState,
  type MiniXiangqiBoard,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiPlayerView,
  type MiniXiangqiSquare,
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
import type { ChessReplaySpec } from './chess-replay.js';
import { DUAL_START_FEN, renderDualChessBoard, renderDualChessRow } from './dual-chess-diagram.js';
import type { DualReplaySpec } from './dual-chess-replay.js';
import { DUAL_CHESS_SAMPLE_GAME } from './dual-chess-sample-game.js';
import type { MiniXiangqiReplaySpec } from './mini-xiangqi-replay.js';
import {
  DEFAULT_XIANGQI_PIECE_SET,
  renderXiangqiPieceGlyphed,
  type XiangqiPieceSet,
} from './xiangqi-piece-sets.js';
import type { XiangqiReplaySpec } from './xiangqi-replay.js';
import {
  SHOGI4_CAPTURE,
  SHOGI4_DROP,
  SHOGI4_JUMP_CASES,
  SHOGI4_MOVE_ROYAL,
  SHOGI4_PAIR_CARP,
  SHOGI4_PAIR_FOX,
  SHOGI4_PAIR_RACCOON,
  SHOGI4_PAIR_TAPIR,
  SHOGI4_RULES_THUMBNAIL,
  SHOGI4_START_BOARD,
  SHOGI4_WIN,
} from './shogi4-rules-diagrams.js';
import { SHOGI4_GAME_STEPS, SHOGI4_GAME_TITLE } from './shogi4-sample-game.js';

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

// Client-side game replay: one board stepped through a move list. The move
// record ships as a compact ICCS string; positions render on demand.
export type XiangqiReplayBlock = {
  kind: 'xq-replay';
  spec: XiangqiReplaySpec;
  caption?: string;
};

// Chess analogue of XiangqiReplayBlock: the game ships as a compact UCI string
// and each position renders on demand on a chessground board.
export type ChessReplayBlock = {
  kind: 'chess-replay';
  spec: ChessReplaySpec;
  caption?: string;
};

// Crossroads Chess analogue: a 6x8 board stepped through a UCI move list, each
// position replayed through the real kernel and rendered by the live renderer.
export type DualReplayBlock = {
  kind: 'dual-replay';
  spec: DualReplaySpec;
  caption?: string;
};

// Mini Xiangqi analogue of XiangqiReplayBlock: a 7x7 board stepped through a
// move list, each position rendered on demand from the rules kernel.
export type MiniXiangqiReplayBlock = {
  kind: 'mxq-replay';
  spec: MiniXiangqiReplaySpec;
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
  // A string is baked once (chess timelines, axis plots). A render thunk is
  // re-run when the xiangqi appearance picker changes (piece set) and reflects
  // the active board theme via CSS — the xiangqi-diagram equivalent of how
  // chess diagrams restyle through chessground sprites + board-theme CSS.
  svg: string | (() => string);
  caption?: string;
};

export type RawSvgStepperStep = {
  // String, or a render thunk re-run on xiangqi appearance change (see RawSvgBlock).
  svg: string | (() => string);
  narrative?: string;
};

export type RawSvgStepperBlock = {
  kind: 'raw-svg-stepper';
  steps: RawSvgStepperStep[];
  header?: { players: string; event: string };   // optional title above the frame (engine-game style)
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
  | XiangqiReplayBlock
  | ChessReplayBlock
  | MiniXiangqiReplayBlock
  | DualReplayBlock
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
  // String is baked once; a render thunk re-runs on xiangqi appearance change so
  // the index/announcement card tracks the picked piece set (board theme is CSS).
  svg: string | (() => string);
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
  // Which appearance family this article's diagrams belong to. Drives the
  // Settings board/piece pickers while the article is open (xiangqi diagrams
  // react to the xiangqi pickers). Defaults to chess when unset.
  boardFamily?: 'chess' | 'xiangqi';
  sections: ArticleSection[];
};

// ── Standardized rules-article closings ───────────────────────────────────
// Two kinds, picked by whether *this article's* game is playable on Mistboard
// today:
//   relatedClosing — the game is not hosted (base games, or fog variants not
//     yet public). Links onward to related rules articles.
//   playClosing — the game is live. Deep-links into the homepage play modal
//     (`/?play=lobby` etc.), so a reader drops straight into starting a game.
// A not-yet-public fog variant flips from related to play by swapping the call.
function relatedClosing(opts: {
  heading: string;
  lead: string;
  links: CtaButton[];
}): ArticleSection {
  return {
    heading: opts.heading,
    blocks: [
      { kind: 'paragraph', text: opts.lead },
      { kind: 'cta', buttons: opts.links },
    ],
  };
}

function playClosing(opts: {
  heading: string;
  lead: string;
  playLabel: string;
  playHref: string;
  secondary?: CtaButton[];
}): ArticleSection {
  return {
    heading: opts.heading,
    blocks: [
      { kind: 'paragraph', text: opts.lead },
      {
        kind: 'cta',
        buttons: [
          { label: opts.playLabel, href: opts.playHref, emphasis: 'primary' },
          ...(opts.secondary ?? []),
        ],
      },
    ],
  };
}

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
  d4: { color: 'white', role: 'knight' },
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
const BASIC_KNIGHT_TARGETS: Square[] = ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'];
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
// Canonical king-and-queen stalemate. Black to move: the king on a8 is NOT in
// check, but its only squares (a7, b7, b8) are all covered by the queen on b6,
// and Black has no other piece to move. No legal move + no check = draw.
const BASIC_STALEMATE: Board = {
  a8: { color: 'black', role: 'king' },
  a6: { color: 'white', role: 'king' },
  b6: { color: 'white', role: 'queen' },
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

// ── Sample game: PvE 8d0c230e (Misty 1.0 vs test1) ────────────────────────
// A complete live PvE game from production: Mistboard's engine (Misty 1.0)
// plays White against a human (test1) at 60+1. White wins; Black resigns on
// ply 75, after 38.Rxd5 wins the queen.
// https://mistboard.com/game/8d0c230e-ff56-4ece-a7cc-0488b1d62640
const ENGINE_SAMPLE_START = darkChessVariant.createInitialState('pve-8d0c230e');
const ENGINE_SAMPLE_STATES = replayMoves(ENGINE_SAMPLE_START, [
  { from: 'e2', to: 'e4' },  // 1.
  { from: 'c7', to: 'c6' },  // 1...
  { from: 'b1', to: 'c3' },  // 2.
  { from: 'd7', to: 'd5' },  // 2...
  { from: 'e4', to: 'd5' },  // 3.
  { from: 'c6', to: 'd5' },  // 3...
  { from: 'd2', to: 'd4' },  // 4.
  { from: 'b8', to: 'c6' },  // 4...
  { from: 'c1', to: 'e3' },  // 5.
  { from: 'g8', to: 'f6' },  // 5...
  { from: 'f1', to: 'd3' },  // 6.
  { from: 'd8', to: 'd6' },  // 6...
  { from: 'g1', to: 'f3' },  // 7.
  { from: 'g7', to: 'g5' },  // 7...
  { from: 'f3', to: 'g5' },  // 8.
  { from: 'h8', to: 'g8' },  // 8...
  { from: 'e1', to: 'h1' },  // 9.
  { from: 'c8', to: 'f5' },  // 9...
  { from: 'd3', to: 'f5' },  // 10.
  { from: 'e7', to: 'e6' },  // 10...
  { from: 'f5', to: 'd3' },  // 11.
  { from: 'f6', to: 'e4' },  // 11...
  { from: 'c3', to: 'e4' },  // 12.
  { from: 'd5', to: 'e4' },  // 12...
  { from: 'g5', to: 'e4' },  // 13.
  { from: 'd6', to: 'c7' },  // 13...
  { from: 'd1', to: 'f3' },  // 14.
  { from: 'f8', to: 'e7' },  // 14...
  { from: 'f3', to: 'h3' },  // 15.
  { from: 'e8', to: 'a8' },  // 15...
  { from: 'a2', to: 'a4' },  // 16.
  { from: 'g8', to: 'g6' },  // 16...
  { from: 'e3', to: 'd2' },  // 17.
  { from: 'd8', to: 'g8' },  // 17...
  { from: 'f1', to: 'b1' },  // 18.
  { from: 'g6', to: 'g2' },  // 18...
  { from: 'h3', to: 'g2' },  // 19.
  { from: 'g8', to: 'g2' },  // 19...
  { from: 'g1', to: 'g2' },  // 20.
  { from: 'c6', to: 'd8' },  // 20...
  { from: 'f2', to: 'f3' },  // 21.
  { from: 'e7', to: 'd6' },  // 21...
  { from: 'e4', to: 'd6' },  // 22.
  { from: 'c7', to: 'd6' },  // 22...
  { from: 'b1', to: 'g1' },  // 23.
  { from: 'c8', to: 'd7' },  // 23...
  { from: 'g2', to: 'h1' },  // 24.
  { from: 'd8', to: 'c6' },  // 24...
  { from: 'd2', to: 'c3' },  // 25.
  { from: 'b7', to: 'b5' },  // 25...
  { from: 'a4', to: 'b5' },  // 26.
  { from: 'c6', to: 'e7' },  // 26...
  { from: 'g1', to: 'g2' },  // 27.
  { from: 'e7', to: 'd5' },  // 27...
  { from: 'd3', to: 'e4' },  // 28.
  { from: 'd5', to: 'c3' },  // 28...
  { from: 'b2', to: 'c3' },  // 29.
  { from: 'e6', to: 'e5' },  // 29...
  { from: 'd4', to: 'e5' },  // 30.
  { from: 'd6', to: 'e5' },  // 30...
  { from: 'g2', to: 'g1' },  // 31.
  { from: 'd7', to: 'e6' },  // 31...
  { from: 'b5', to: 'b6' },  // 32.
  { from: 'a7', to: 'b6' },  // 32...
  { from: 'a1', to: 'a8' },  // 33.
  { from: 'f7', to: 'f5' },  // 33...
  { from: 'e4', to: 'b7' },  // 34.
  { from: 'e6', to: 'f6' },  // 34...
  { from: 'a8', to: 'a1' },  // 35.
  { from: 'f5', to: 'f4' },  // 35...
  { from: 'a1', to: 'd1' },  // 36.
  { from: 'h7', to: 'h6' },  // 36...
  { from: 'b7', to: 'd5' },  // 37.
  { from: 'e5', to: 'd5' },  // 37...
  { from: 'd1', to: 'd5' },  // 38.
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

// ── Concepts: one view, many worlds ───────────────────────────────────────
// White's vision (Kg1, two rooks d1/f1, two knights c3/f3, pawns no further
// than rank 4) tops out at rank 5 in the centre (the c3 knight adds b5/a4),
// so the whole of Black's camp on ranks 6-8 is fog.
// Three very different Black armies therefore produce a byte-identical White
// view: the "fan" of worlds consistent with what one player can see. We vary
// only the king's side (kingside / centre / queenside) so the clustering
// visual can collapse the fan into two decision buckets. Verified: all three
// share the same visibleSquares and the same visible pieces (no Black leaks).
const WORLDS_WHITE: Board = {
  g1: { color: 'white', role: 'king' },
  f1: { color: 'white', role: 'rook' },
  d1: { color: 'white', role: 'rook' },
  f3: { color: 'white', role: 'knight' },
  c3: { color: 'white', role: 'knight' },
  a2: { color: 'white', role: 'pawn' },
  b2: { color: 'white', role: 'pawn' },
  c2: { color: 'white', role: 'pawn' },
  d4: { color: 'white', role: 'pawn' },
  e4: { color: 'white', role: 'pawn' },
  f2: { color: 'white', role: 'pawn' },
  g2: { color: 'white', role: 'pawn' },
  h2: { color: 'white', role: 'pawn' },
};
function worldState(id: string, black: Board): GameState {
  return {
    id,
    variant: 'dark-chess',
    board: { ...WORLDS_WHITE, ...black },
    status: { type: 'playing', turn: 'white' },
    moveNumber: 18,
    castlingRights: [],
    halfmoveClock: 0,
  };
}
const WORLD_KINGSIDE = worldState('worlds-kingside', {
  g8: { color: 'black', role: 'king' },
  f8: { color: 'black', role: 'rook' },
  a8: { color: 'black', role: 'rook' },
  c6: { color: 'black', role: 'knight' },
  b6: { color: 'black', role: 'bishop' },
  a7: { color: 'black', role: 'pawn' },
  b7: { color: 'black', role: 'pawn' },
  c7: { color: 'black', role: 'pawn' },
  f7: { color: 'black', role: 'pawn' },
  g7: { color: 'black', role: 'pawn' },
  h7: { color: 'black', role: 'pawn' },
});
const WORLD_CENTER = worldState('worlds-center', {
  e8: { color: 'black', role: 'king' },
  a8: { color: 'black', role: 'rook' },
  h8: { color: 'black', role: 'rook' },
  f6: { color: 'black', role: 'knight' },
  d6: { color: 'black', role: 'bishop' },
  a7: { color: 'black', role: 'pawn' },
  b7: { color: 'black', role: 'pawn' },
  c7: { color: 'black', role: 'pawn' },
  f7: { color: 'black', role: 'pawn' },
  g7: { color: 'black', role: 'pawn' },
  h7: { color: 'black', role: 'pawn' },
});
const WORLD_QUEENSIDE = worldState('worlds-queenside', {
  c8: { color: 'black', role: 'king' },
  d8: { color: 'black', role: 'rook' },
  h8: { color: 'black', role: 'rook' },
  f6: { color: 'black', role: 'knight' },
  e6: { color: 'black', role: 'bishop' },
  a7: { color: 'black', role: 'pawn' },
  b7: { color: 'black', role: 'pawn' },
  c7: { color: 'black', role: 'pawn' },
  f7: { color: 'black', role: 'pawn' },
  g7: { color: 'black', role: 'pawn' },
  h7: { color: 'black', role: 'pawn' },
});
// White's view is identical for every world (Black sits entirely in the fog),
// so the "WHAT YOU SEE" board is derived from any one of them.
const WORLDS_VIEW_FOG = fogFor(WORLD_KINGSIDE, 'white');

// ── Concepts: the move that survives every world (callback to the Bb4 line) ─
// Reuse the 1.d4 e6 2.Nf3 Bb4 position from "Pawn moves". After 2...Bb4 the
// b4-e1 diagonal is open (c3 and d2 are both empty) and it is White to move.
// The greedy/oblivious move (a3, ignoring the threat) loses the king to Bxe1
// if b4 hides a bishop; the patient move (Nb1-c3) blocks the diagonal and is
// safe whether b4 hides a bishop, a knight, or a pawn. Verified: Bxe1 ends the
// game (king-captured); Nc3 leaves the king on e1 with the bishop shut out.
const SURVIVE_BB4_FINAL = DEDUCE_BB4_STATES[DEDUCE_BB4_STATES.length - 1]!;
const SURVIVE_GREEDY_STATES = replayMoves(SURVIVE_BB4_FINAL, [
  { from: 'a2', to: 'a3' },
  { from: 'b4', to: 'e1' },
]);
const SURVIVE_GREEDY_FINAL = SURVIVE_GREEDY_STATES[SURVIVE_GREEDY_STATES.length - 1]!;
const SURVIVE_PATIENT_STATE = darkChessVariant.applyMove(SURVIVE_BB4_FINAL, { from: 'b1', to: 'c3' });

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
    <text x="${leftX + colW / 2}" y="240" font-family="${SF_FONT}" font-size="12" fill="${SF_ACCENT}" text-anchor="middle">opponent pieces sit in browser memory, so an extension can strip the fog</text>

    ${sfBox(rightX + 70, 44, 172, 44, 'server', { sub: 'canonical state' })}
    ${sfArrow(rightX + 156, 92, rightX + 80, 152, 'white\'s view', { tone: 'ok' })}
    ${sfArrow(rightX + 156, 92, rightX + 232, 152, 'black\'s view', { tone: 'ok' })}
    ${sfBox(rightX + 8, 156, 144, 56, 'white\'s browser', { sub: 'only what white can see', tone: 'ok' })}
    ${sfBox(rightX + 160, 156, 144, 56, 'black\'s browser', { sub: 'only what black can see', tone: 'ok' })}
    <text x="${rightX + colW / 2}" y="240" font-family="${SF_FONT}" font-size="12" fill="${SF_OK}" text-anchor="middle">opponent pieces never reach the browser, so there is nothing to strip</text>
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
    <text x="${SF_DIAGRAM_WIDTH / 2}" y="252" font-family="${SF_FONT}" font-size="12" fill="${SF_MUTED}" text-anchor="middle">no shared "broadcast" with masking later: two distinct messages from the start</text>
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
    <text x="${SF_DIAGRAM_WIDTH / 2}" y="200" font-family="${SF_FONT}" font-size="12" fill="${SF_MUTED}" text-anchor="middle">same rule gates HTTP replay: live games return 403, finished games return the event log</text>
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

// Render context for the xiangqi piece set. The diagram SVGs are produced by
// synchronous render thunks; the piece layers read whichever set is active for
// the current render. A diagram block re-runs its thunk inside
// `withXiangqiPieceSet` to switch sets (the appearance picker), the same way
// chess diagrams restyle via CSS sprites. Safe because rendering is synchronous
// and single-threaded (build prerender and browser both); the previous set is
// always restored.
let activeXiangqiPieceSet: XiangqiPieceSet = DEFAULT_XIANGQI_PIECE_SET;

export function withXiangqiPieceSet(set: XiangqiPieceSet, render: () => string): string {
  const previous = activeXiangqiPieceSet;
  activeXiangqiPieceSet = set;
  try {
    return render();
  } finally {
    activeXiangqiPieceSet = previous;
  }
}

function xqBoardGrid(x0: number, y0: number, perspective: XiangqiColor): string {
  const parts: string[] = [
    `<rect x="${x0}" y="${y0}" width="${XQ_BOARD_W}" height="${XQ_BOARD_H}" rx="${XQ_BOARD_RADIUS}" class="xq-diagram-bg"/>`,
  ];
  const left = x0 + XQ_MARGIN;
  const right = left + 8 * XQ_CELL;
  const top = y0 + XQ_MARGIN;
  const bottom = top + 9 * XQ_CELL;
  const riverTop = top + 4 * XQ_CELL;
  const riverBottom = top + 5 * XQ_CELL;
  for (let r = 0; r < 10; r += 1) {
    const y = top + r * XQ_CELL;
    parts.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" class="xq-diagram-line" stroke-width="1"/>`);
  }
  for (let f = 0; f < 9; f += 1) {
    const x = left + f * XQ_CELL;
    if (f === 0 || f === 8) {
      parts.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" class="xq-diagram-line" stroke-width="1"/>`);
    } else {
      parts.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${riverTop}" class="xq-diagram-line" stroke-width="1"/>`);
      parts.push(`<line x1="${x}" y1="${riverBottom}" x2="${x}" y2="${bottom}" class="xq-diagram-line" stroke-width="1"/>`);
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
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="xq-diagram-line" stroke-width="1"/>`);
    parts.push(`<line x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}" class="xq-diagram-line" stroke-width="1"/>`);
  }
  parts.push(
    `<text x="${left + 4 * XQ_CELL}" y="${(riverTop + riverBottom) / 2 + 1}" font-family="serif" font-size="16" class="xq-diagram-ink" text-anchor="middle" dominant-baseline="central">楚 河   漢 界</text>`,
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
    `<path d="${parts.join(' ')}" class="xq-diagram-fog" clip-path="url(#${clipId})"/>`,
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

// Movement-diagram destination markers, following the standard board-UI
// vocabulary:
//   - filled green dot  = a legal move to an empty point
//   - green ring        = a legal capture (drawn around the enemy piece)
//   - red X             = a point the piece would reach on an open board but
//                         cannot, because something blocks the path (a horse's
//                         leg, an elephant's eye, the river)
// Green matches the existing arrow colour so diagrams read consistently with
// the live UI. The capture ring sits just outside the piece disc (radius ~13),
// so it stays visible even though markers render beneath the pieces.
function xqMoveDots(
  dots: Array<{ square: XiangqiSquare; blocked?: boolean; capture?: boolean }> | undefined,
  x0: number,
  y0: number,
  perspective: XiangqiColor,
): string {
  if (!dots || dots.length === 0) return '';
  return dots
    .map(({ square, blocked, capture }) => {
      const { file, rank } = xqCoord(square);
      const { x, y } = xqPoint(file, rank, perspective, x0, y0);
      if (blocked) {
        const r = 7;
        return [
          `<line x1="${x - r}" y1="${y - r}" x2="${x + r}" y2="${y + r}" stroke="#d4351c" stroke-width="2.75" stroke-linecap="round"/>`,
          `<line x1="${x - r}" y1="${y + r}" x2="${x + r}" y2="${y - r}" stroke="#d4351c" stroke-width="2.75" stroke-linecap="round"/>`,
        ].join('');
      }
      if (capture) {
        return `<circle cx="${x}" cy="${y}" r="16" fill="none" stroke="#15781B" stroke-width="2.5"/>`;
      }
      return `<circle cx="${x}" cy="${y}" r="6.5" fill="#15781B" opacity="0.85"/>`;
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
      return renderXiangqiPieceGlyphed(piece as XiangqiPiece, activeXiangqiPieceSet, {
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

// Translucent callouts for the board's two structural zones: the two palaces
// (the 3x3 boxes the general and advisors never leave) and the river band.
// Used by the board-anatomy diagram so the prose's palace/river have a visual.
function xqZoneHighlights(x0: number, y0: number, perspective: XiangqiColor): string {
  const parts: string[] = [];
  const pad = 6;
  for (const [rLo, rHi] of [[1, 3], [8, 10]] as const) {
    const lo = xqPoint(3, rLo, perspective, x0, y0);
    const hi = xqPoint(5, rHi, perspective, x0, y0);
    const x = Math.min(lo.x, hi.x) - pad;
    const y = Math.min(lo.y, hi.y) - pad;
    const w = Math.abs(hi.x - lo.x) + pad * 2;
    const h = Math.abs(hi.y - lo.y) + pad * 2;
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#2563eb" opacity="0.13" rx="5"/>`);
  }
  const left = x0 + XQ_MARGIN;
  const right = left + 8 * XQ_CELL;
  const ya = xqPoint(0, 5, perspective, x0, y0).y;
  const yb = xqPoint(0, 6, perspective, x0, y0).y;
  parts.push(
    `<rect x="${left}" y="${Math.min(ya, yb)}" width="${right - left}" height="${Math.abs(yb - ya)}" fill="#2563eb" opacity="0.09"/>`,
  );
  return parts.join('');
}

function xqBoardSvg(opts: {
  state: XiangqiGameState;
  view?: XiangqiPlayerView;
  x: number;
  y: number;
  label: string;
  perspective?: XiangqiColor;
  arrows?: Array<{ from: XiangqiSquare; to: XiangqiSquare }>;
  dots?: Array<{ square: XiangqiSquare; blocked?: boolean; capture?: boolean }>;
  zones?: boolean;
  // Raw SVG drawn on top of the pieces (a confrontation line, etc.). The
  // caller positions it with xqPoint using the same x and boardY (y + 28).
  overlay?: string;
}): string {
  const perspective = opts.perspective ?? opts.view?.perspective ?? 'red';
  const view = opts.view ?? null;
  const boardY = opts.y + 28;
  const clipId = `xq-fog-${xqSvgIdPart(opts.state.id)}-${xqSvgIdPart(opts.label)}-${Math.round(opts.x)}-${Math.round(boardY)}-${perspective}`;
  return [
    `<text x="${opts.x + XQ_BOARD_W / 2}" y="${opts.y + 14}" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#5f4a2c" text-anchor="middle">${opts.label}</text>`,
    xqBoardGrid(opts.x, boardY, perspective),
    opts.zones ? xqZoneHighlights(opts.x, boardY, perspective) : '',
    xqFogLayer(view, opts.x, boardY, perspective, clipId),
    xqCannonTargets(opts.state, view, opts.x, boardY, perspective),
    xqMoveDots(opts.dots, opts.x, boardY, perspective),
    xqPiecesLayer(opts.state, view, opts.x, boardY, perspective),
    xqArrowLayer(opts.arrows, opts.x, boardY, perspective),
    opts.overlay ?? '',
    xqBoardBorder(opts.x, boardY),
  ].join('');
}

function xqSvg(width: number, height: number, body: string): string {
  const paddedWidth = width + XQ_VIEWBOX_PAD * 2;
  const paddedHeight = height + XQ_VIEWBOX_PAD * 2;
  const layout = width <= XQ_BOARD_W ? 'single' : width <= XQ_BOARD_W * 2 + 28 ? 'pair' : 'wide';
  return `<svg class="xq-article-svg" data-xq-layout="${layout}" style="--xq-svg-width: ${paddedWidth}px" viewBox="0 0 ${paddedWidth} ${paddedHeight}" role="img" xmlns="http://www.w3.org/2000/svg"><g transform="translate(${XQ_VIEWBOX_PAD} ${XQ_VIEWBOX_PAD})">${body}</g></svg>`;
}

// ── Mini Xiangqi rules diagrams ────────────────────────────────────────────
// A self-contained 7x7 board SVG, reusing the Xiangqi rules-diagram scale
// (XQ_CELL / XQ_MARGIN / XQ_PIECE_SIZE) and marker vocabulary so the Mini
// Xiangqi page reads as a sibling of the full Xiangqi page. There is no river;
// each palace is a 3x3 box spanning ranks 1-3 (Red) and 5-7 (Black). Boards are
// drawn from Red's perspective with rank 1 at the bottom.
const MXQ_FILES = 7;
const MXQ_RANKS = 7;
const MXQ_BOARD_W = XQ_MARGIN * 2 + (MXQ_FILES - 1) * XQ_CELL;
const MXQ_BOARD_H = XQ_MARGIN * 2 + (MXQ_RANKS - 1) * XQ_CELL;

function mxqPoint(file: number, rank: number): { x: number; y: number } {
  return {
    x: XQ_MARGIN + file * XQ_CELL,
    y: XQ_MARGIN + (MXQ_RANKS - rank) * XQ_CELL,
  };
}

function mxqGridLayer(): string {
  const parts: string[] = [
    `<rect x="0" y="0" width="${MXQ_BOARD_W}" height="${MXQ_BOARD_H}" rx="${XQ_BOARD_RADIUS}" class="xq-diagram-bg"/>`,
  ];
  const left = XQ_MARGIN;
  const right = XQ_MARGIN + (MXQ_FILES - 1) * XQ_CELL;
  const top = XQ_MARGIN;
  const bottom = XQ_MARGIN + (MXQ_RANKS - 1) * XQ_CELL;
  for (let r = 0; r < MXQ_RANKS; r += 1) {
    const y = top + r * XQ_CELL;
    parts.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" class="xq-diagram-line" stroke-width="1"/>`);
  }
  for (let f = 0; f < MXQ_FILES; f += 1) {
    const x = left + f * XQ_CELL;
    parts.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" class="xq-diagram-line" stroke-width="1"/>`);
  }
  // Palace diagonals: files c-e (indices 2-4), ranks 1-3 (Red) and 5-7 (Black).
  for (const [loRank, hiRank] of [[1, 3], [5, 7]] as const) {
    const a = mxqPoint(2, hiRank);
    const b = mxqPoint(4, loRank);
    const c = mxqPoint(4, hiRank);
    const d = mxqPoint(2, loRank);
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="xq-diagram-line" stroke-width="1"/>`);
    parts.push(`<line x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}" class="xq-diagram-line" stroke-width="1"/>`);
  }
  return parts.join('');
}

function mxqMarkerLayer(dots: MiniXiangqiSquare[], captures: MiniXiangqiSquare[]): string {
  const parts: string[] = [];
  for (const sq of captures) {
    const { file, rank } = miniXiangqiCoordOf(sq);
    const { x, y } = mxqPoint(file, rank);
    parts.push(`<circle cx="${x}" cy="${y}" r="16" fill="none" stroke="#15781B" stroke-width="2.5"/>`);
  }
  for (const sq of dots) {
    const { file, rank } = miniXiangqiCoordOf(sq);
    const { x, y } = mxqPoint(file, rank);
    parts.push(`<circle cx="${x}" cy="${y}" r="6.5" fill="#15781B" opacity="0.85"/>`);
  }
  return parts.join('');
}

function mxqPiecesLayer(board: MiniXiangqiBoard): string {
  return Object.entries(board)
    .map(([sq, piece]) => {
      if (!piece) return '';
      const { file, rank } = miniXiangqiCoordOf(sq as MiniXiangqiSquare);
      const { x, y } = mxqPoint(file, rank);
      return renderXiangqiPieceGlyphed(piece as XiangqiPiece, activeXiangqiPieceSet, {
        x: x - XQ_PIECE_SIZE / 2,
        y: y - XQ_PIECE_SIZE / 2,
        size: XQ_PIECE_SIZE,
      });
    })
    .join('');
}

function miniXqBoardSvg(opts: {
  board: MiniXiangqiBoard;
  dots?: MiniXiangqiSquare[];
  captures?: MiniXiangqiSquare[];
}): string {
  const w = MXQ_BOARD_W + XQ_VIEWBOX_PAD * 2;
  const h = MXQ_BOARD_H + XQ_VIEWBOX_PAD * 2;
  const body = [
    mxqGridLayer(),
    mxqMarkerLayer(opts.dots ?? [], opts.captures ?? []),
    mxqPiecesLayer(opts.board),
    `<rect x="0" y="0" width="${MXQ_BOARD_W}" height="${MXQ_BOARD_H}" rx="${XQ_BOARD_RADIUS}" fill="none" stroke="${XQ_BOARD_STROKE}" stroke-width="${XQ_BOARD_STROKE_WIDTH}"/>`,
  ].join('');
  return `<svg class="xq-article-svg" data-xq-layout="single" style="--xq-svg-width: ${w}px" viewBox="0 0 ${w} ${h}" role="img" xmlns="http://www.w3.org/2000/svg" aria-label="Mini Xiangqi board"><g transform="translate(${XQ_VIEWBOX_PAD} ${XQ_VIEWBOX_PAD})">${body}</g></svg>`;
}

// Clean fog-free starting position, used as both the page board and card image.
const MINI_XIANGQI_START_BOARD = () => miniXqBoardSvg({ board: createInitialMiniXiangqiBoard() });

// Soldier movement: a Red soldier in the open moves and captures one point
// forward or sideways (never backward) from the very first move, because Mini
// Xiangqi has no river. Dots are quiet moves; the ring is a sideways capture.
const MINI_XIANGQI_SOLDIER_BOARD: MiniXiangqiBoard = {
  d4: { color: 'red', role: 'soldier' },
  c4: { color: 'black', role: 'soldier' },
};
const MINI_XIANGQI_SOLDIER_DIAGRAM = () => miniXqBoardSvg({
  board: MINI_XIANGQI_SOLDIER_BOARD,
  dots: ['d5', 'e4'],
  captures: ['c4'],
});

// Fog overlay for the Dark Mini Xiangqi boards: a dark path over every point
// the player cannot see, clipped to the rounded board, the same inverse-fog
// look the full Dark Xiangqi diagrams use.
const MXQ_FOG_OVERLAP = 0.5;

function mxqFogLayer(view: MiniXiangqiPlayerView, clipId: string): string {
  const visible = new Set(view.visibleSquares);
  const parts: string[] = [];
  for (let file = 0; file < MXQ_FILES; file += 1) {
    for (let rank = 1; rank <= MXQ_RANKS; rank += 1) {
      const sq = miniXiangqiSquareOf(file, rank);
      if (visible.has(sq)) continue;
      const { x, y } = mxqPoint(file, rank);
      const row = MXQ_RANKS - rank;
      const left = file === 0 ? 0 : x - XQ_CELL / 2 - MXQ_FOG_OVERLAP;
      const right = file === MXQ_FILES - 1 ? MXQ_BOARD_W : x + XQ_CELL / 2 + MXQ_FOG_OVERLAP;
      const top = row === 0 ? 0 : y - XQ_CELL / 2 - MXQ_FOG_OVERLAP;
      const bottom = row === MXQ_RANKS - 1 ? MXQ_BOARD_H : y + XQ_CELL / 2 + MXQ_FOG_OVERLAP;
      parts.push(`M ${left} ${top} H ${right} V ${bottom} H ${left} Z`);
    }
  }
  if (parts.length === 0) return '';
  return [
    `<defs><clipPath id="${clipId}"><rect x="0" y="0" width="${MXQ_BOARD_W}" height="${MXQ_BOARD_H}" rx="${XQ_BOARD_RADIUS}"/></clipPath></defs>`,
    `<path d="${parts.join(' ')}" class="xq-diagram-fog" clip-path="url(#${clipId})"/>`,
  ].join('');
}

// Pieces as the viewer sees them: own and visible pieces by glyph, shrouded
// blockers as a neutral ? marker in the owner's color.
function mxqViewPiecesLayer(view: MiniXiangqiPlayerView): string {
  return Object.entries(view.board)
    .map(([sq, entry]) => {
      if (!entry) return '';
      const { file, rank } = miniXiangqiCoordOf(sq as MiniXiangqiSquare);
      const { x, y } = mxqPoint(file, rank);
      const piece = (
        entry.shrouded ? { color: entry.color, role: 'soldier' } : entry.piece
      ) as XiangqiPiece;
      return renderXiangqiPieceGlyphed(piece, activeXiangqiPieceSet, {
        x: x - XQ_PIECE_SIZE / 2,
        y: y - XQ_PIECE_SIZE / 2,
        size: XQ_PIECE_SIZE,
        shrouded: entry.shrouded,
      });
    })
    .join('');
}

function miniXqFogBoardSvg(view: MiniXiangqiPlayerView, clipId: string): string {
  const w = MXQ_BOARD_W + XQ_VIEWBOX_PAD * 2;
  const h = MXQ_BOARD_H + XQ_VIEWBOX_PAD * 2;
  const body = [
    mxqGridLayer(),
    mxqFogLayer(view, clipId),
    mxqViewPiecesLayer(view),
    `<rect x="0" y="0" width="${MXQ_BOARD_W}" height="${MXQ_BOARD_H}" rx="${XQ_BOARD_RADIUS}" fill="none" stroke="${XQ_BOARD_STROKE}" stroke-width="${XQ_BOARD_STROKE_WIDTH}"/>`,
  ].join('');
  return `<svg class="xq-article-svg" data-xq-layout="single" style="--xq-svg-width: ${w}px" viewBox="0 0 ${w} ${h}" role="img" xmlns="http://www.w3.org/2000/svg" aria-label="Dark Mini Xiangqi board"><g transform="translate(${XQ_VIEWBOX_PAD} ${XQ_VIEWBOX_PAD})">${body}</g></svg>`;
}

// Blue corner brackets on the squares a cannon can capture under fog (the
// "target revealed" half of the cannon rule), matching the full Dark Xiangqi
// diagrams. Computed from the real vision so it cannot drift from the rules.
function mxqCannonTargetMarkers(state: MiniXiangqiGameState, perspective: MiniXiangqiColor): string {
  const vision = computeMiniXiangqiVision(state, perspective);
  return [...vision.cannonTargets]
    .map((sq) => {
      const { file, rank } = miniXiangqiCoordOf(sq);
      const { x, y } = mxqPoint(file, rank);
      const outer = 16;
      const inner = 10;
      const stroke = 'fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round"';
      return [
        `<path d="M ${x - outer} ${y - inner} L ${x - outer} ${y - outer} L ${x - inner} ${y - outer}" ${stroke}/>`,
        `<path d="M ${x + inner} ${y - outer} L ${x + outer} ${y - outer} L ${x + outer} ${y - inner}" ${stroke}/>`,
        `<path d="M ${x - outer} ${y + inner} L ${x - outer} ${y + outer} L ${x - inner} ${y + outer}" ${stroke}/>`,
        `<path d="M ${x + inner} ${y + outer} L ${x + outer} ${y + outer} L ${x + outer} ${y + inner}" ${stroke}/>`,
      ].join('');
    })
    .join('');
}

// One labeled board in a comparison pair: the fogged player view (with cannon
// targets) when a view is given, otherwise the full server-truth board.
function mxqBoardCell(opts: {
  x: number;
  label: string;
  state: MiniXiangqiGameState;
  view?: MiniXiangqiPlayerView;
  fogClipId?: string;
}): string {
  const layers: string[] = [mxqGridLayer()];
  if (opts.view && opts.fogClipId) {
    layers.push(mxqFogLayer(opts.view, opts.fogClipId));
    layers.push(mxqCannonTargetMarkers(opts.state, opts.view.perspective));
    layers.push(mxqViewPiecesLayer(opts.view));
  } else {
    layers.push(mxqPiecesLayer(opts.state.board));
  }
  layers.push(
    `<rect x="0" y="0" width="${MXQ_BOARD_W}" height="${MXQ_BOARD_H}" rx="${XQ_BOARD_RADIUS}" fill="none" stroke="${XQ_BOARD_STROKE}" stroke-width="${XQ_BOARD_STROKE_WIDTH}"/>`,
  );
  return `<g transform="translate(${opts.x} 0)"><text x="${MXQ_BOARD_W / 2}" y="11" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#5f4a2c" text-anchor="middle">${opts.label}</text><g transform="translate(0 20)">${layers.join('')}</g></g>`;
}

const MXQ_BOARD_GAP = 22;

// A horizontal row of labeled boards: two for a view/truth pair, three for a
// red-view / server-truth / black-view triptych.
function mxqBoardRowSvg(
  state: MiniXiangqiGameState,
  cells: Array<{ label: string; view?: MiniXiangqiPlayerView; fogClipId?: string }>,
): string {
  const n = cells.length;
  const totalW = MXQ_BOARD_W * n + MXQ_BOARD_GAP * (n - 1) + XQ_VIEWBOX_PAD * 2;
  const totalH = MXQ_BOARD_H + 20 + XQ_VIEWBOX_PAD * 2;
  const body = cells
    .map((cell, i) =>
      mxqBoardCell({
        x: i * (MXQ_BOARD_W + MXQ_BOARD_GAP),
        label: cell.label,
        state,
        view: cell.view,
        fogClipId: cell.fogClipId,
      }),
    )
    .join('');
  return `<svg class="xq-article-svg" data-xq-layout="${n >= 3 ? 'wide' : 'pair'}" style="--xq-svg-width: ${totalW}px" viewBox="0 0 ${totalW} ${totalH}" role="img" xmlns="http://www.w3.org/2000/svg"><g transform="translate(${XQ_VIEWBOX_PAD} ${XQ_VIEWBOX_PAD})">${body}</g></svg>`;
}

function miniXqPairSvg(
  state: MiniXiangqiGameState,
  view: MiniXiangqiPlayerView,
  fogClipId: string,
): string {
  return mxqBoardRowSvg(state, [
    { label: "RED'S VIEW", view, fogClipId },
    { label: 'SERVER TRUTH' },
  ]);
}

// The opening position under fog. The card thumbnail shows Red's view; the page
// shows all three angles side by side (Red's view, the true board, Black's view).
const MINI_XIANGQI_DARK_STATE = createInitialMiniXiangqiState('dark-mini-xiangqi-diagram');
const MINI_XIANGQI_DARK_THUMBNAIL = () => miniXqFogBoardSvg(
  getMiniXiangqiPlayerView(MINI_XIANGQI_DARK_STATE, 'red'),
  'mxq-fog-thumb',
);
const MINI_XIANGQI_DARK_TRIPTYCH = () => mxqBoardRowSvg(MINI_XIANGQI_DARK_STATE, [
  {
    label: "RED'S VIEW",
    view: getMiniXiangqiPlayerView(MINI_XIANGQI_DARK_STATE, 'red'),
    fogClipId: 'mxq-fog-tri-r',
  },
  { label: 'SERVER TRUTH' },
  {
    label: "BLACK'S VIEW",
    view: getMiniXiangqiPlayerView(MINI_XIANGQI_DARK_STATE, 'black'),
    fogClipId: 'mxq-fog-tri-b',
  },
]);

function mxqDemoState(id: string, board: MiniXiangqiBoard): MiniXiangqiGameState {
  return {
    id,
    board,
    status: { type: 'playing', turn: 'red' },
    moveNumber: 8,
    progressClock: 0,
    positionCounts: {},
  };
}

// Cannon rule under fog: a Red cannon on d3 fires up the d-file. The screen on
// d5 is shrouded, the empty gap (d6) stays fogged, and the target on d7 (the
// Black general) is revealed with a capture bracket. A Black horse sits
// off-file on f3.
const MINI_XIANGQI_CANNON_STATE = mxqDemoState('dmxq-cannon-rule', {
  d3: { color: 'red', role: 'cannon' },
  d5: { color: 'black', role: 'soldier' },
  d7: { color: 'black', role: 'general' },
  f3: { color: 'black', role: 'horse' },
});
const MINI_XIANGQI_CANNON_PAIR = () => miniXqPairSvg(
  MINI_XIANGQI_CANNON_STATE,
  getMiniXiangqiPlayerView(MINI_XIANGQI_CANNON_STATE, 'red'),
  'mxq-fog-cannon',
);

// Horse leg under fog: a Red horse on d3 with the up-leg on d4 blocked. The leg
// point is a shrouded marker and the destinations behind it (c5, e5) stay hidden.
const MINI_XIANGQI_HORSE_STATE = mxqDemoState('dmxq-horse-leg', {
  d3: { color: 'red', role: 'horse' },
  d4: { color: 'black', role: 'soldier' },
});
const MINI_XIANGQI_HORSE_PAIR = () => miniXqPairSvg(
  MINI_XIANGQI_HORSE_STATE,
  getMiniXiangqiPlayerView(MINI_XIANGQI_HORSE_STATE, 'red'),
  'mxq-fog-horse',
);

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
const XQ_START_TRIPTYCH = () => xqSvg(
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
const XQ_RULES_PRIMER_START_BOARD = () => xqSvg(
  XQ_BOARD_W,
  XQ_BOARD_H + 52,
  xqBoardSvg({ state: XQ_START, x: 0, y: 0, label: 'STARTING POSITION', perspective: 'red', zones: true }),
);
const XQ_RULES_PRIMER_THUMBNAIL = () => xqSvg(
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

// Open-information movement diagram for the Horse (rules primer). Left board:
// a horse on a clear central point reaches all eight L-shaped destinations.
// Right board: a single blocker on the point directly ahead (the "leg") kills
// the two destinations that step through it, shown as red X marks.
function xqDots(squares: string[]): Array<{ square: XiangqiSquare; blocked?: boolean }> {
  return squares.map((s) => ({ square: s as XiangqiSquare }));
}
const XQ_PRIMER_HORSE_OPEN = xqVisionDemoState('xq-primer-horse-open', {
  e5: { color: 'red', role: 'horse' },
});
const XQ_PRIMER_HORSE_BLOCKED = xqVisionDemoState('xq-primer-horse-blocked', {
  e5: { color: 'red', role: 'horse' },
  e6: { color: 'black', role: 'soldier' },
});
const XQ_PRIMER_HORSE_PAIR = () => xqSvg(
  XQ_BOARD_W * 2 + 28,
  XQ_BOARD_H + 52,
  [
    xqBoardSvg({
      state: XQ_PRIMER_HORSE_OPEN,
      x: 0,
      y: 0,
      label: 'UNOBSTRUCTED',
      perspective: 'red',
      dots: xqDots(['c4', 'c6', 'd3', 'd7', 'f3', 'f7', 'g4', 'g6']),
    }),
    xqBoardSvg({
      state: XQ_PRIMER_HORSE_BLOCKED,
      x: XQ_BOARD_W + 28,
      y: 0,
      label: 'LEG BLOCKED',
      perspective: 'red',
      dots: [
        ...xqDots(['c4', 'c6', 'd3', 'f3', 'g4', 'g6']),
        { square: 'd7' as XiangqiSquare, blocked: true },
        { square: 'f7' as XiangqiSquare, blocked: true },
      ],
    }),
  ].join(''),
);

// General: one orthogonal step, confined to the palace.
const XQ_PRIMER_GENERAL = xqVisionDemoState('xq-primer-general', {
  e2: { color: 'red', role: 'general' },
});
const XQ_PRIMER_GENERAL_BOARD = () => xqSvg(
  XQ_BOARD_W,
  XQ_BOARD_H + 52,
  xqBoardSvg({
    state: XQ_PRIMER_GENERAL,
    x: 0,
    y: 0,
    label: 'GENERAL',
    perspective: 'red',
    dots: xqDots(['d2', 'f2', 'e1', 'e3']),
  }),
);

// The flying-general rule: two generals may not sit on the same open file with
// nothing between them. Left board is the forbidden facing (dashed red axis);
// right board is legal because a piece screens the file.
const XQ_PRIMER_FACING_ILLEGAL = xqVisionDemoState('xq-primer-facing-illegal', {
  e1: { color: 'red', role: 'general' },
  e10: { color: 'black', role: 'general' },
});
const XQ_PRIMER_FACING_LEGAL = xqVisionDemoState('xq-primer-facing-legal', {
  e1: { color: 'red', role: 'general' },
  e10: { color: 'black', role: 'general' },
  e5: { color: 'black', role: 'soldier' },
});
function xqFacingLine(x0: number): string {
  const a = xqPoint(4, 1, 'red', x0, 28);
  const b = xqPoint(4, 10, 'red', x0, 28);
  const yTop = Math.min(a.y, b.y) + 16;
  const yBottom = Math.max(a.y, b.y) - 16;
  return `<line x1="${a.x}" y1="${yTop}" x2="${a.x}" y2="${yBottom}" stroke="#d4351c" stroke-width="3" stroke-linecap="round" opacity="0.6" stroke-dasharray="3 5"/>`;
}
const XQ_PRIMER_FACING_PAIR = () => xqSvg(
  XQ_BOARD_W * 2 + 28,
  XQ_BOARD_H + 52,
  [
    xqBoardSvg({
      state: XQ_PRIMER_FACING_ILLEGAL,
      x: 0,
      y: 0,
      label: 'FACING: FORBIDDEN',
      perspective: 'red',
      overlay: xqFacingLine(0),
    }),
    xqBoardSvg({
      state: XQ_PRIMER_FACING_LEGAL,
      x: XQ_BOARD_W + 28,
      y: 0,
      label: 'SCREENED: ALLOWED',
      perspective: 'red',
    }),
  ].join(''),
);

// Advisor: one diagonal step, confined to the palace.
const XQ_PRIMER_ADVISOR = xqVisionDemoState('xq-primer-advisor', {
  e2: { color: 'red', role: 'advisor' },
});
const XQ_PRIMER_ADVISOR_BOARD = () => xqSvg(
  XQ_BOARD_W,
  XQ_BOARD_H + 52,
  xqBoardSvg({
    state: XQ_PRIMER_ADVISOR,
    x: 0,
    y: 0,
    label: 'ADVISOR',
    perspective: 'red',
    dots: xqDots(['d1', 'f1', 'd3', 'f3']),
  }),
);

// Elephant: two points diagonally, never crossing the river and never passing
// a piece on the midpoint "eye" of the diagonal. Left board shows the river
// limit (a7, e7 unreachable from c5); right board shows an eye block: a piece
// on d4 cuts off the c5 diagonal from an elephant on e3.
const XQ_PRIMER_ELEPHANT_RIVER = xqVisionDemoState('xq-primer-elephant-river', {
  c5: { color: 'red', role: 'elephant' },
});
const XQ_PRIMER_ELEPHANT_EYE = xqVisionDemoState('xq-primer-elephant-eye', {
  e3: { color: 'red', role: 'elephant' },
  d4: { color: 'black', role: 'soldier' },
});
const XQ_PRIMER_ELEPHANT_PAIR = () => xqSvg(
  XQ_BOARD_W * 2 + 28,
  XQ_BOARD_H + 52,
  [
    xqBoardSvg({
      state: XQ_PRIMER_ELEPHANT_RIVER,
      x: 0,
      y: 0,
      label: 'THE RIVER',
      perspective: 'red',
      dots: [
        ...xqDots(['a3', 'e3']),
        { square: 'a7' as XiangqiSquare, blocked: true },
        { square: 'e7' as XiangqiSquare, blocked: true },
      ],
    }),
    xqBoardSvg({
      state: XQ_PRIMER_ELEPHANT_EYE,
      x: XQ_BOARD_W + 28,
      y: 0,
      label: 'THE EYE',
      perspective: 'red',
      dots: [
        ...xqDots(['c1', 'g1', 'g5']),
        { square: 'c5' as XiangqiSquare, blocked: true },
      ],
    }),
  ].join(''),
);

// Chariot: slides any distance along open lines, cannot jump. On the e-file it
// is stopped by the soldier (which it may capture); the other rays run free.
const XQ_PRIMER_CHARIOT = xqVisionDemoState('xq-primer-chariot', {
  e4: { color: 'red', role: 'chariot' },
  e8: { color: 'black', role: 'soldier' },
});
const XQ_PRIMER_CHARIOT_BOARD = () => xqSvg(
  XQ_BOARD_W,
  XQ_BOARD_H + 52,
  xqBoardSvg({
    state: XQ_PRIMER_CHARIOT,
    x: 0,
    y: 0,
    label: 'CHARIOT',
    perspective: 'red',
    dots: [
      ...xqDots([
        'e5', 'e6', 'e7',
        'e3', 'e2', 'e1',
        'd4', 'c4', 'b4', 'a4',
        'f4', 'g4', 'h4', 'i4',
      ]),
      { square: 'e8' as XiangqiSquare, capture: true },
    ],
  }),
);

// Cannon: moves like a chariot, but captures only by leaping exactly one
// screen. Left board shows free movement; right board jumps the screen on e5
// to capture the chariot on e8.
const XQ_PRIMER_CANNON_MOVE = xqVisionDemoState('xq-primer-cannon-move', {
  e4: { color: 'red', role: 'cannon' },
});
const XQ_PRIMER_CANNON_CAPTURE = xqVisionDemoState('xq-primer-cannon-capture', {
  e2: { color: 'red', role: 'cannon' },
  e5: { color: 'red', role: 'soldier' },
  e8: { color: 'black', role: 'chariot' },
});
const XQ_PRIMER_CANNON_PAIR = () => xqSvg(
  XQ_BOARD_W * 2 + 28,
  XQ_BOARD_H + 52,
  [
    xqBoardSvg({
      state: XQ_PRIMER_CANNON_MOVE,
      x: 0,
      y: 0,
      label: 'MOVE',
      perspective: 'red',
      dots: xqDots([
        'e5', 'e6', 'e7', 'e8', 'e9', 'e10',
        'e3', 'e2', 'e1',
        'd4', 'c4', 'b4', 'a4',
        'f4', 'g4', 'h4', 'i4',
      ]),
    }),
    xqBoardSvg({
      state: XQ_PRIMER_CANNON_CAPTURE,
      x: XQ_BOARD_W + 28,
      y: 0,
      label: 'CAPTURE',
      perspective: 'red',
      dots: [{ square: 'e8' as XiangqiSquare, capture: true }],
    }),
  ].join(''),
);

// Soldier: one point straight forward; after crossing the river it may also
// step sideways. Never backward.
const XQ_PRIMER_SOLDIER_BEFORE = xqVisionDemoState('xq-primer-soldier-before', {
  e4: { color: 'red', role: 'soldier' },
});
const XQ_PRIMER_SOLDIER_AFTER = xqVisionDemoState('xq-primer-soldier-after', {
  e6: { color: 'red', role: 'soldier' },
});
const XQ_PRIMER_SOLDIER_PAIR = () => xqSvg(
  XQ_BOARD_W * 2 + 28,
  XQ_BOARD_H + 52,
  [
    xqBoardSvg({
      state: XQ_PRIMER_SOLDIER_BEFORE,
      x: 0,
      y: 0,
      label: 'BEFORE THE RIVER',
      perspective: 'red',
      dots: xqDots(['e5']),
    }),
    xqBoardSvg({
      state: XQ_PRIMER_SOLDIER_AFTER,
      x: XQ_BOARD_W + 28,
      y: 0,
      label: 'ACROSS THE RIVER',
      perspective: 'red',
      dots: xqDots(['e7', 'd6', 'f6']),
    }),
  ].join(''),
);

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
const XQ_VISIBILITY_GRID = () => xqSvg(
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
const XQ_VISION_MOVE_PAIR = () => xqSvg(
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
const XQ_CANNON_RULE_PAIR = () => xqSvg(
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
const XQ_DARK_XIANGQI_THUMBNAIL = () => xqSvg(
  XQ_BOARD_W,
  XQ_BOARD_H,
  [
    xqBoardGrid(0, 0, 'red'),
    xqFogLayer(XQ_START_RED, 0, 0, 'red', 'xq-fog-dark-xiangqi-thumbnail'),
    xqPiecesLayer(XQ_START, XQ_START_RED, 0, 0, 'red'),
    xqBoardBorder(0, 0),
  ].join(''),
);

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
    svg: () => xqSvg(
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
    svg: () => xqSvg(
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
    svg: () => xqSvg(
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
const XQ_BLOCKED_HORSE_LEGS_PAIR = () => xqSvg(
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
const XQ_BLOCKED_ELEPHANT_EYES_PAIR = () => xqSvg(
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
const XQ_GENERAL_CAPTURE_PAIR = () => xqSvg(
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
    slug: 'misty',
    kind: 'article',
    title: 'How Misty Plays',
    summary:
      "Misty is the engine you play on Mistboard, built for Fog of War chess and guided by the Obscuro architecture. How it thinks, what's hard, and where it stands.",
    showSummaryOnPage: false,
    status: 'draft',
    publishedAt: '2026-06-03',
    audience:
      'Dark chess players and chess-engine builders curious about how the Mistboard engine works.',
    intro: [
      {
        kind: 'paragraph',
        text:
          "Misty is the bot you play on Mistboard, an engine for Fog of War chess. It's our build of [Obscuro](https://arxiv.org/abs/2506.01242) (Zhang & Sandholm, ICLR 2026), the first engine to reach superhuman Fog of War play.",
      },
    ],
    sections: [
      {
        heading: 'It plays under the same fog you do',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Misty never sees the true board. Each move, it gets only what the side to move can legally observe under Fog of War: its own pieces, the squares they see, the captures in view. Everything else it infers. It plays under the same rules you do, and you can verify that: Mistboard is open source, so anyone can audit the server code that enforces the fog before the engine sees a position.',
          },
        ],
      },
      {
        heading: 'How it thinks',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'A classical chess engine like Stockfish has one big advantage: it can see the whole board. It picks its move by searching the game tree, looking ahead through the lines both sides could play and backing up the value of the best line (minimax). The search assumes a single true position and a single true continuation.',
          },
          {
            kind: 'paragraph',
            text:
              "Under fog there is no single position to search. Misty can't see the opponent's pieces, so the board it has to reason about is really a set of boards: every arrangement consistent with what it has observed. A move that's winning on one board can hang a piece on another. So Misty weighs the whole set at once and looks for a move that holds up across it, the way you'd play a hand of cards against an opponent whose cards you can't see. That's a game-theoretic problem rather than a lookahead one.",
          },
          {
            kind: 'paragraph',
            text: 'It splits that job into five concerns, the same five Obscuro uses:',
          },
          {
            kind: 'paragraph',
            text:
              '**Belief.** It holds that whole set of possible boards explicitly, updating it each move as new observations rule worlds in and out.',
          },
          {
            kind: 'paragraph',
            text:
              '**Search scope (KLUSS).** It bounds the subgame to what is actually knowable instead of searching the full game tree.',
          },
          {
            kind: 'paragraph',
            text:
              "**Search (CFR).** It runs game-theoretic search by regret minimization, converging toward a strategy an opponent can't easily exploit.",
          },
          {
            kind: 'paragraph',
            text:
              '**Evaluation.** Leaf positions get scored by Stockfish at depth one.',
          },
          {
            kind: 'paragraph',
            text:
              '**Commit.** It collapses the resulting mixed strategy into the single move it plays.',
          },
        ],
      },
      {
        heading: "What's hard",
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Two things. The first is the belief set itself. A few plies into a foggy middlegame, "every consistent board" can mean millions of positions, and the worst case is far larger: the Obscuro paper estimates the space of possible boards runs to at least 4 × 10^18, four quintillion. Misty has to rebuild that set every move inside a few seconds, and a heavy fog can blow it up faster than any time budget can keep up with.',
          },
          {
            kind: 'paragraph',
            text:
              'The second is picking a move over that set. Scoring one move means weighing it across thousands or millions of boards at once, and the obvious way to do that, averaging the outcomes, quietly buries disasters. A move that loses the king on 2% of boards barely moves the average, but it costs you 2% of your games outright. Reasoning well over a distribution of boards, rather than a single board, is most of what the engine does.',
          },
        ],
      },
      {
        heading: 'Where it stands',
        // HELD pending the 20-game human benchmark. The benchmark runs against a
        // RE-FROZEN strongest config (king-safety fix landed), not the current
        // king-hanging default — don't anchor strength on lines where it hangs its
        // king early. Finalize wording/numbers after the match; aim to imply
        // Obscuro-class play without claiming parity. Article release blocked on this.
        blocks: [
          {
            kind: 'paragraph',
            text:
              "As of mid-2026, Misty plays the strongest Fog of War chess we've seen. We're benchmarking it now against serious human play to pin down how strong; until then, this is our own read, not a rating.",
          },
        ],
      },
      {
        heading: "What's next",
        blocks: [
          {
            kind: 'paragraph',
            text:
              "The architecture isn't chess-specific. The same machinery already plays a second game, Dark Mini Xiangqi, and we're bringing it to Mistboard next. Other hidden-information games are mostly a matter of wiring up the rules.",
          },
        ],
      },
      {
        heading: 'Play it',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Misty is live on Mistboard, and every serious game against it sharpens that estimate. Play one, and you're part of the benchmark.",
          },
          {
            kind: 'cta',
            buttons: [
              { label: 'Play Misty', href: '/?play=computer', emphasis: 'primary' },
              { label: 'All articles', href: '/articles', emphasis: 'secondary' },
            ],
          },
        ],
      },
      {
        heading: 'For engine builders',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "If you build Fog of War engines, I'd like to play yours against Misty. There's almost no public head-to-head data between engines for this variant, and engine-vs-engine games are the cleanest way to see where any of them stand. Get in touch and we'll set up a match.",
          },
          {
            kind: 'cta',
            buttons: [{ label: 'Get in touch', href: '/contact', emphasis: 'secondary' }],
          },
        ],
      },
      {
        heading: 'References',
        blocks: [
          {
            kind: 'paragraph',
            text:
              '[Obscuro (Zhang & Sandholm, ICLR 2026)](https://arxiv.org/abs/2506.01242). The academic neighbor is Reconnaissance Blind Chess, whose engine lineage runs StrangeFish (CMU, 2018), ReBeL (FAIR, 2020), Penumbra (Georgia Tech), and Obscuro (CMU, 2026).',
          },
        ],
      },
    ],
  },
  {
    slug: 'chess',
    kind: 'rules',
    title: 'Chess Rules',
    summary:
      'Standard chess rules, the primer behind Dark Chess: castling, promotion, en passant, the draw rules, and a famous game to play through.',
    showSummaryOnPage: false,
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
          'Chess is a two-player strategy game played for centuries. It descends from the Indian game chaturanga of around the 6th century and reached Europe through Persia and the Islamic world; its modern form, with the long-range queen and bishop, took shape in Europe in the late 1400s.',
      },
    ],
    sections: [
      {
        heading: 'Board setup',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Chess is played on an 8 by 8 board of alternating light and dark squares.',
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
              'White moves first, then players alternate. Each side fills the two rows nearest it, with the queen starting on her own color. On your turn, move one piece to a legal square: you cannot land on your own piece, and landing on an enemy piece captures it, removing it from the board.',
          },
        ],
      },
      {
        heading: 'The pieces',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Each piece moves in its own way. In every diagram below, the highlighted squares are the legal moves and captures for the marked white piece.',
          },
          {
            kind: 'paragraph',
            text:
              '**King:** moves one square in any direction. In regular chess, a king may not move onto a square attacked by the opponent.',
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'single',
              boards: [
                { board: BASIC_KING.board, moveDotSquares: BASIC_KING_TARGETS, orientation: 'white', label: 'KING' },
              ],
            },
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Queen:** moves any number of squares horizontally, vertically, or diagonally. Other pieces block her path.',
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'single',
              boards: [
                {
                  board: BASIC_QUEEN.board,
                  moveDotSquares: BASIC_QUEEN_TARGETS,
                  orientation: 'white',
                  label: 'QUEEN',
                },
              ],
            },
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Rook:** moves any number of squares horizontally or vertically. It cannot jump, so the first occupied square in a line stops it.',
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'single',
              boards: [
                {
                  board: BASIC_ROOK.board,
                  moveDotSquares: BASIC_ROOK_TARGETS,
                  orientation: 'white',
                  label: 'ROOK',
                },
              ],
            },
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Bishop:** moves any number of squares diagonally. Because diagonals stay on one color, each bishop stays on light squares or dark squares for the whole game.',
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'single',
              boards: [
                {
                  board: BASIC_BISHOP.board,
                  moveDotSquares: BASIC_BISHOP_TARGETS,
                  orientation: 'white',
                  label: 'BISHOP',
                },
              ],
            },
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Knight:** moves in an L shape: two squares one way and one square sideways. The knight is the only piece that jumps over other pieces.',
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'single',
              boards: [
                { board: BASIC_KNIGHT.board, moveDotSquares: BASIC_KNIGHT_TARGETS, orientation: 'white', label: 'KNIGHT' },
              ],
            },
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Pawn:** the pawn moves and captures differently from every other piece. It moves straight forward into an empty square, one square at a time, or two squares from its starting position. It can never move backward or sideways, and a piece directly in front of it blocks it completely. It captures only diagonally forward, one square (the green rings below), never straight ahead. Two further pawn rules, promotion and en passant, appear under Special moves below.',
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'single',
              boards: [
                {
                  board: BASIC_PAWN.board,
                  moveDotSquares: ['e3' as Square, 'e4' as Square],
                  captureSquares: ['d3' as Square, 'f3' as Square],
                  orientation: 'white',
                  label: 'PAWN',
                },
              ],
            },
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
              'In regular chess the king is never actually captured: the game ends at checkmate, with the king still on the board.',
          },
        ],
      },
      {
        heading: 'Special moves',
        blocks: [
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
                  orientation: 'white',
                  label: 'BEFORE',
                  arrows: [{ orig: 'e1' as Square, dest: 'g1' as Square }],
                },
                { board: BASIC_CASTLE_AFTER, orientation: 'white', label: 'AFTER' },
              ],
            },
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
              'When a pawn reaches the farthest rank, it promotes into a queen, rook, bishop, or knight.',
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
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Draws',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Not every game is won. Some end in a draw, where neither side wins.',
          },
          { kind: 'sub-heading', text: 'Stalemate' },
          {
            kind: 'paragraph',
            text:
              'Stalemate is when the player to move has no legal move but their king is not in check. It is a draw, not a win, even if one side is far ahead. Below it is Black to move: the king on a8 is not in check, yet every square it could step to is covered by the white queen, and Black has nothing else to move. The game is drawn.',
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'single',
              boards: [
                {
                  board: BASIC_STALEMATE,
                  orientation: 'white',
                  label: 'STALEMATE — BLACK TO MOVE',
                },
              ],
            },
          } as ArticleBlock,
          { kind: 'sub-heading', text: 'Other draws' },
          {
            kind: 'paragraph',
            text:
              '**Threefold repetition:** the same position, with the same player to move, occurs three times. Either player can then claim a draw.',
          },
          {
            kind: 'paragraph',
            text:
              '**Fifty-move rule:** fifty moves by each side pass with no capture and no pawn move. The clock resets whenever a pawn moves or a piece is taken.',
          },
          {
            kind: 'paragraph',
            text:
              '**Insufficient material:** neither side has enough force to deliver checkmate, such as king versus king, or king and a lone bishop or knight against a bare king.',
          },
          {
            kind: 'paragraph',
            text:
              '**Agreement:** both players simply agree to a draw.',
          },
        ],
      },
      {
        heading: 'A famous game',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'To see the pieces work together in a real game, step through Game 11 of the 2014 World Championship in Sochi. Playing White, Magnus Carlsen grinds down Viswanathan Anand in a Berlin endgame to clinch the title; Anand resigns on move 45.',
          },
          {
            kind: 'chess-replay',
            spec: {
              uci: 'e2e4 e7e5 g1f3 b8c6 f1b5 g8f6 e1g1 f6e4 d2d4 e4d6 b5c6 d7c6 d4e5 d6f5 d1d8 e8d8 h2h3 c8d7 b1c3 h7h6 b2b3 d8c8 c1b2 c6c5 a1d1 b7b6 f1e1 d7e6 c3d5 g7g5 c2c4 c8b7 g1h2 a7a5 a2a4 f5e7 g2g4 e7g6 h2g3 f8e7 f3d2 h8d8 d2e4 e7f8 e4f6 b6b5 b2c3 b5a4 b3a4 b7c6 g3f3 d8b8 f3e4 b8b4 c3b4 c5b4 f6h5 c6b7 f2f4 g5f4 h5f4 g6f4 d5f4 e6c4 d1d7 a8a6 f4d5 a6c6 d7f7 f8c5 f7c7 c6c7 d5c7 b7c6 c7b5 c4b5 a4b5 c6b5 e5e6 b4b3 e4d3 c5e7 h3h4 a5a4 g4g5 h6g5 h4g5 a4a3 d3c3',
              white: 'Magnus Carlsen',
              black: 'Viswanathan Anand',
              event: 'World Championship Game 11, Sochi 2014',
              resultText: 'Anand resigns. Carlsen (White) wins the match.',
            },
          } as ArticleBlock,
        ],
      },
      relatedClosing({
        heading: 'Where to next',
        lead: 'Chess is the open-information base game. Add Fog of War for dark chess, where enemy pieces outside your vision disappear and the king falls by capture.',
        links: [
          { label: 'Read Dark Chess', href: '/rules/dark-chess', emphasis: 'primary' },
          { label: 'All rules', href: '/rules', emphasis: 'secondary' },
        ],
      }),
    ],
  },
  {
    slug: 'dark-chess',
    kind: 'rules',
    title: 'Dark Chess (Fog of War) Rules',
    summary:
      'Chess under Fog of War: each side sees only the squares its pieces reach, there are no check warnings, and the king falls by capture.',
    status: 'published',
    publishedAt: '2026-05-22',
    updatedAt: '2026-06-04',
    audience:
      'Any chess player who has heard of dark chess (or Fog of War) and wants to understand it from scratch.',
    thumbnail: ARTICLE_OG_POSITIONS['dark-chess'],
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
              "Here is a complete game between Mistboard's engine and a human, shown from both player views and the server's full position.",
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
        heading: 'Is dark chess the same as fog of war chess?',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Yes. "Dark chess" and "fog of war chess" are two names for this same variant: hidden-information chess where you see only the squares your pieces reach. It is sometimes confused with [banqi](https://en.wikipedia.org/wiki/Banqi), the Chinese game also nicknamed "dark chess," which plays with xiangqi pieces turned face-down. That is a different game.',
          },
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
      'Strategy concepts for dark chess: read fogged squares and capture clues, model the hidden positions you could be facing, cluster them into the few that matter, and pick moves that survive every one.',
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
        heading: 'Thinking in worlds',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Every move your opponent makes, you usually do not see. So the board in front of you is not one position. It is a fan of positions: one for every move they could have made, branching again with every move you miss. You are never really looking at the board. You are looking at a cloud of boards that all happen to match what you can see.",
          },
          {
            kind: 'paragraph',
            text:
              "Here White sees only the near half. The whole enemy camp is fog. The pieces in your fog did not vanish: they are somewhere. The skill is holding a rough picture of where they could be.",
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'single',
              boards: [
                { board: WORLD_KINGSIDE.board, fogSquares: WORLDS_VIEW_FOG, orientation: 'white', label: 'WHAT YOU SEE' },
              ],
            },
            caption: 'Your view: the near half only. Everything past it is fog.',
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              "Each of these is a different position that fits that exact view, and there are far more than three. You cannot tell them apart from where you sit.",
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'triptych',
              boards: [
                { board: WORLD_KINGSIDE.board, orientation: 'white', label: 'WORLD A' },
                { board: WORLD_CENTER.board, orientation: 'white', label: 'WORLD B' },
                { board: WORLD_QUEENSIDE.board, orientation: 'white', label: 'WORLD C' },
              ],
            },
            caption: 'Three of the many truths behind that one view. Filtered to the same fog, all three collapse to the board above.',
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              "The signals from the last sections are how you prune the cloud. A pawn that can still push means nothing sits in front of it, so every world that put a piece there is gone. A capture you can name removes the worlds where a different piece took. Each thing you observe kills off worlds. You will never get down to one, and you do not need to.",
          },
          {
            kind: 'sub-heading',
            text: 'How big is the cloud?',
          },
          {
            kind: 'paragraph',
            text:
              "That cloud has a name. In game theory, the set of positions consistent with everything you have observed is your information set, and its size is a real, countable number. You feel it as a vague unease; an engine can count it exactly.",
          },
          {
            kind: 'paragraph',
            text:
              "Obscuro, the first superhuman fog-of-war chess engine, does exactly that: it enumerates the whole set rather than sampling it, and calls it P. The rough scale is worth sitting with. In a typical position P holds on the order of ten thousand boards (the Obscuro paper reports an average near 17,000), and in the sharpest, most hidden positions it climbs toward a million, the practical upper bound the paper works with. Your two or three buckets are a human compression of a set that large. You are not being imprecise. You are doing the only thing a person can do with a number that big.",
          },
        ],
      },
      {
        heading: 'Clustering the worlds',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "There are too many worlds to track one by one. A computer can enumerate them all; you cannot, and you do not play like one. What you can do is group them, because most of those worlds do not change your move. The ones that do tend to fall into a handful of buckets.",
          },
          {
            kind: 'paragraph',
            text:
              "Their king is kingside or it is queenside. The piece that just landed on b4 is a bishop or a knight. You are walking into a battery or you are not. You rarely need the exact position. You need to know which bucket you are in, because the bucket is what changes your plan.",
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'pair',
              boards: [
                { board: WORLD_KINGSIDE.board, orientation: 'white', label: 'KING KINGSIDE', highlightSquares: ['g8' as Square] },
                { board: WORLD_QUEENSIDE.board, orientation: 'white', label: 'KING QUEENSIDE', highlightSquares: ['c8' as Square] },
              ],
            },
            caption: 'Dozens of exact positions, two buckets that matter: attack the kingside or attack the queenside. You plan against the bucket, not the position.',
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              "Cluster by what would change your decision, not by what is merely different. Two worlds that point to the same best move are one world for your purposes, so collapse them. Two that demand opposite moves are the split worth naming. Most of dark chess is this: reducing a cloud you cannot count to the two or three buckets you can actually plan against.",
          },
        ],
      },
      {
        heading: 'Patience and risk',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Once the cloud is down to a few buckets, the question is not which one is true. You often cannot know. The question is whether your next move still works if the dangerous bucket is the real one.",
          },
          {
            kind: 'paragraph',
            text:
              "That changes what counts as a good move. A move that beats the board you see but loses to a hidden piece you cannot rule out is a gamble, not a plan. The strong move is usually the one that holds up across every live bucket, even if it wins by less when you turn out to be right. Recall the bishop on b4: you cannot prove it is a bishop, but Nc3 blocks the diagonal whether b4 hides a bishop, a knight, or a pawn. The grab only works if you guessed right; the block survives every world.",
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'triptych',
              boards: [
                { board: SURVIVE_BB4_FINAL.board, fogSquares: fogFor(SURVIVE_BB4_FINAL, 'white'), orientation: 'white', label: 'WHAT YOU SEE', highlightSquares: ['b4' as Square] },
                { board: SURVIVE_GREEDY_FINAL.board, orientation: 'white', label: 'IGNORE IT: Bxe1', arrows: [{ orig: 'b4', dest: 'e1' }] },
                { board: SURVIVE_PATIENT_STATE.board, orientation: 'white', label: 'BLOCK: Nc3', arrows: [{ orig: 'b1', dest: 'c3' }] },
              ],
            },
            caption: 'Ignore the b4 signal and a hidden bishop ends the game on e1. Nc3 shuts the diagonal in every world. Same view, two outcomes.',
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              "This is why patience pays. Forcing the position commits you before the fog clears. A quieter move keeps your options open, makes the opponent act first, and often makes them reveal a piece in the process. Let the board come into focus before you stake the game on it.",
          },
          {
            kind: 'paragraph',
            text:
              "That is the whole arc: read the fog, hold the worlds it could hide, cluster them down to the few that matter, and choose the move that beats the dangerous ones. Deduction narrows the problem; what you do with what is left is the game.",
          },
          {
            kind: 'cta',
            buttons: [
              { label: 'Read the rules', href: '/rules/dark-chess', emphasis: 'secondary' },
              { label: 'Play dark chess', href: '/?play=lobby', emphasis: 'primary' },
            ],
          } as ArticleBlock,
        ],
      },
    ],
  },
  {
    slug: 'dark-draft960',
    kind: 'rules',
    title: 'Dark Draft960',
    summary:
      "Dark Chess with a sealed opening draft: each player picks one of three Chess960 back ranks and never sees the other's.",
    status: 'published',
    publishedAt: '2026-05-31',
    audience:
      'Readers who have grokked dark chess (start with the rules article if not). Curious chess players following the Mistboard OG card to learn what makes Dark Draft960 unique.',
    thumbnail: ARTICLE_OG_POSITIONS['dark-draft960'],
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
          } as ArticleBlock,
        ],
      },
      {
        heading: 'The starting position',
        blocks: [
          {
            kind: 'paragraph',
            text: "Say both players picked offer A. Each side sees only its own back rank; the opponent's stays in fog. Only the server holds both.",
          },
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
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text: "960 × 960 = **921,600** possible starts. Standard chess is one of them.",
          },
        ],
      },
      {
        heading: 'Play status',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Dark Draft960 is a future variant, not playable yet. There is no set release date.',
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
    slug: 'xiangqi',
    boardFamily: 'xiangqi',
    kind: 'rules',
    title: 'Xiangqi Rules',
    summary:
      'Standard xiangqi rules, the primer behind Dark Xiangqi: palaces, the river, cannon screens, facing generals, and a famous game to play through.',
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
          '[Xiangqi](https://en.wikipedia.org/wiki/Xiangqi), or Chinese chess, is a two-player strategy game with roots in China going back many centuries. Its modern form, including the cannon, took shape around the Song dynasty (960 to 1279).',
      },
      {
        kind: 'paragraph',
        text:
          'Red and Black alternate moves, with Red first. Each side begins with 16 pieces: one general, two advisors, two elephants, two horses, two chariots, two cannons, and five soldiers. The goal is to checkmate the opposing general.',
      },
    ],
    sections: [
      {
        heading: 'The board',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The board has 9 files and 10 ranks, but pieces sit on the intersections of the lines, not inside squares.',
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
              'A piece captures by landing on an enemy-occupied point, and no piece may move through an occupied point. The cannon\'s capturing jump is the only exception. The pieces are listed below in the traditional order.',
          },
          {
            kind: 'paragraph',
            text:
              '**General:** moves one point horizontally or vertically and can never leave its own palace. The two generals may never face each other along an open file with nothing between them: a move that would expose that line is illegal. In effect, a general guards the file in front of it like a chariot.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_PRIMER_GENERAL_BOARD,
          } as ArticleBlock,
          {
            kind: 'raw-svg',
            svg: XQ_PRIMER_FACING_PAIR,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Advisor:** moves one point diagonally and, like the general, stays inside the palace.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_PRIMER_ADVISOR_BOARD,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Elephant:** moves exactly two points diagonally and cannot cross the river, so it never leaves its own half. It does not jump: a piece on the midpoint of the diagonal, the elephant\'s eye, blocks the move.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_PRIMER_ELEPHANT_PAIR,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Horse:** moves one point orthogonally and then one point diagonally outward, like a chess knight, but it does not jump. If the orthogonal point it steps through, the horse\'s leg, is occupied, the horse cannot move in that direction.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_PRIMER_HORSE_PAIR,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Chariot:** moves any distance horizontally or vertically and cannot jump, exactly like a rook. It is the strongest piece on the board.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_PRIMER_CHARIOT_BOARD,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Cannon:** moves like a chariot when it is not capturing. To capture, it jumps over exactly one piece, friend or foe, called the screen, and lands on an enemy piece beyond it.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_PRIMER_CANNON_PAIR,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Soldier:** moves one point straight forward and never backward. After crossing the river it may also move one point sideways. It never promotes.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_PRIMER_SOLDIER_PAIR,
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Check, checkmate, and endings',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'A general is in check when an enemy piece attacks it, and the player in check must answer the threat. If there is no legal answer, it is checkmate and the checked player loses.',
          },
          {
            kind: 'paragraph',
            text:
              'A player who has no legal move at all also loses. This is the opposite of Western chess, where having no legal move is a stalemate draw.',
          },
          {
            kind: 'paragraph',
            text:
              'Xiangqi also restricts endless forcing cycles. Perpetual check and perpetual chase are not allowed: a player who repeats an endless attack loses rather than forcing a draw. Tournament rules spell out detailed repetition procedures for exactly when a cycle counts as perpetual.',
          },
          {
            kind: 'paragraph',
            text:
              'A game is drawn when neither side has enough material to checkmate, by a repetition that breaks none of those rules, or when a long run of moves passes with no capture. The no-capture limit depends on the rule set: the World Xiangqi Federation rules use a fifty-move rule, while the Chinese (CXA) rules require at least sixty plies before a draw can be claimed.',
          },
        ],
      },
      {
        heading: 'A famous game',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'To see the pieces work together in a real game, step through this 1990 championship between two of xiangqi\'s greatest grandmasters. Playing Black, Liu Dahua checkmates Hu Ronghua, the most dominant champion of the era, in 31 moves.',
          },
          {
            kind: 'xq-replay',
            spec: {
              iccs: 'h2e2 h9g7 h0g2 i9h9 c3c4 g6g5 b0c2 c9e7 i0i1 b9c7 i1f1 h7i7 f1f4 d9e8 b2a2 a9b9 a0b0 h9h3 e2d2 h3g3 c0e2 g5g4 f4g4 g3g4 e2g4 b7b5 g4e2 g7f5 b0b4 c6c5 c4c5 e7c5 a3a4 c5e7 d0e1 b9d9 a2a0 i7f7 a0d0 d9b9 g2f4 b5c5 b4b9 c7b9 f4d5 b9c7 c2b4 c7d5 b4d5 c5c1 d2a2 c1a1 e2c4 f7g7 d0d1 g7g5 d5b6 g5g8 a2e2 f5g7 i3i4 g8g0',
              red: 'Hu Ronghua',
              black: 'Liu Dahua',
              event: '5 Ram Cup, 1990',
              resultText: 'Checkmate. Liu Dahua (Black) defeats Hu Ronghua.',
            },
          } as ArticleBlock,
        ],
      },
      relatedClosing({
        heading: 'Where to next',
        lead: 'Xiangqi is the open-information base game. Add Fog of War for dark xiangqi, where enemy pieces outside your vision disappear and the general falls by capture. Or try the compact board.',
        links: [
          { label: 'Read Dark Xiangqi', href: '/rules/dark-xiangqi', emphasis: 'primary' },
          { label: 'Mini Xiangqi', href: '/rules/mini-xiangqi', emphasis: 'secondary' },
          { label: 'Dark Mini Xiangqi', href: '/rules/dark-mini-xiangqi', emphasis: 'secondary' },
          { label: 'All rules', href: '/rules', emphasis: 'secondary' },
        ],
      }),
    ],
  },
  {
    slug: 'dark-xiangqi',
    boardFamily: 'xiangqi',
    kind: 'rules',
    title: 'Dark Xiangqi',
    summary:
      'Xiangqi under Fog of War: each side sees only the points its pieces reach, hidden blockers matter, and the general falls by capture.',
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
        text: 'Dark Xiangqi is the modern Fog of War version of [xiangqi](/rules/xiangqi): pieces keep their xiangqi movement, but unseen enemy pieces stay hidden and danger is not announced. Capture the general to win.',
      },
      {
        kind: 'paragraph',
        text:
          'If xiangqi is new to you, start with [Xiangqi Rules](/rules/xiangqi). If you already play xiangqi, the sections below explain only what fog changes.',
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
            text: 'Games auto-draw on threefold repetition and after 60 plies with no capture. Both are judged from the true position, not either player\'s view. There is no stalemate draw: if the side to move has no legal move, it loses, and with no check to freeze you, this almost never happens.',
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
          { kind: 'sub-heading', text: 'Facing generals' },
          {
            kind: 'paragraph',
            text: 'Orthodox xiangqi forbids facing generals. Dark Xiangqi allows the position; if one general sees the other on a clear file, it can capture across that file.',
          },
          {
            kind: 'raw-svg-stepper',
            steps: XQ_FACING_GENERAL_STEPS,
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Play status',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Dark Xiangqi is a future variant, not playable yet. There is no set release date.',
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
    slug: 'mini-xiangqi',
    boardFamily: 'xiangqi',
    kind: 'rules',
    title: 'Mini Xiangqi',
    summary:
      'Mini Xiangqi rules, the 7×7 primer behind Dark Mini Xiangqi: no advisors or elephants, no river, sideways soldiers, and checkmate to win.',
    showSummaryOnPage: false,
    status: 'published',
    publishedAt: '2026-05-31',
    audience:
      'Mistboard readers who want the open-information Mini Xiangqi baseline before adding fog.',
    thumbnail: { kind: 'svg', svg: MINI_XIANGQI_START_BOARD },
    intro: [
      {
        kind: 'paragraph',
        text:
          'Mini Xiangqi was invented in 1973 by Shigenobu Kusumoto of Osaka, Japan. It is a simplified, reduced version of [xiangqi](/rules/xiangqi): a smaller board, fewer pieces, and no river.',
      },
      {
        kind: 'paragraph',
        text: 'This page describes the open-information base game.',
      },
    ],
    sections: [
      {
        heading: 'Board and setup',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Mini Xiangqi is xiangqi compressed onto a 7 by 7 board with a smaller army. The advisors and elephants are dropped and there is no river, but each general still keeps a 3 by 3 palace.',
          },
          {
            kind: 'raw-svg',
            svg: MINI_XIANGQI_START_BOARD,
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Piece movement',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Every piece except the soldier moves exactly as it does in [xiangqi](/rules/xiangqi).',
          },
          {
            kind: 'paragraph',
            text:
              '**Soldier:** a soldier moves and captures one point forward or sideways, never backward. With no river to cross, it has that sideways freedom from its very first move, unlike a soldier on the full xiangqi board.',
          },
          {
            kind: 'raw-svg',
            svg: MINI_XIANGQI_SOLDIER_DIAGRAM,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              'Facing generals are illegal here too. The two generals may never sit on the same open file with nothing between them, so a move that would expose that line is not allowed.',
          },
        ],
      },
      {
        heading: 'Winning and draws',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Checkmate wins. As in xiangqi, a player who has no legal move loses rather than drawing by stalemate, and perpetual check or perpetual chase is not a free draw: a player who repeats an endless attack loses instead.',
          },
          {
            kind: 'paragraph',
            text:
              'A game is drawn when neither side has enough material to checkmate, when a long run of moves passes with no capture (xiangqi caps this much like chess’s fifty-move rule), or by a repetition that breaks none of the perpetual rules. These outcomes follow from the position, not from one player choosing to stop.',
          },
        ],
      },
      {
        heading: 'A complete game',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Mini Xiangqi has no canon of famous human games, so to watch the full army work together, step through a game in which Fairy-Stockfish, a strong open-source engine, plays both sides with full information. Notice how fast the chariots and cannons open lines: on a tight 7 by 7 board with no river, the generals come under fire far sooner than in full xiangqi.',
          },
          {
            kind: 'mxq-replay',
            spec: {
              moves:
                'b1b4 b7b5 a2b2 e6f6 g2f2 e7f5 b4b3 c6c5 g1g4 g6g5 b3a3 a6b6 a3d3 c5d5 a1a7 g5g4 d3a3 b6a6 f1g1 g4f4 e1g2 f4g4 f2f3 f6e6 e2e3 g7g6 c2c3 d5d4 c3d3 g4g3 f3g3 f7g7 d3d4 b5a5 a7b7 g6f6 g3f3 g7g1 c1b3 f5d4 b3d4 a5d5 d1c1 d5c5 a3d3 g1f1 b7b4 d7e7 b4b7 d6c6 d4c6 e7d7 d2e2 f6f7 b7b5 f7f5 e3e4 a6b6 b5b6 f5f3 g2e3 f3f6 b6b5 c7a6 e4d4 e6d6 b5b6 c5g5 b6a6 g5g1 c1c2 f1f2 e2f2 d7e7 f2g2 g1d1 d3d2 f6f2 g2f2 d1d4 c6d4 d6d5 d4f5',
              red: 'Fairy-Stockfish',
              black: 'Fairy-Stockfish',
              event: 'Engine self-play · depth 10',
              resultText:
                'Red’s horse leaps to f5 and checkmates the black general on e7. Red wins.',
            },
          } as ArticleBlock,
        ],
      },
      relatedClosing({
        heading: 'Where to next',
        lead: 'Mini Xiangqi is the open-information base game. Dark Mini Xiangqi adds Fog of War, where enemy pieces outside your vision disappear and the general falls by capture rather than checkmate.',
        links: [
          { label: 'Read Dark Mini Xiangqi', href: '/rules/dark-mini-xiangqi', emphasis: 'primary' },
          { label: 'Xiangqi', href: '/rules/xiangqi', emphasis: 'secondary' },
          { label: 'Dark Xiangqi', href: '/rules/dark-xiangqi', emphasis: 'secondary' },
          { label: 'All rules', href: '/rules', emphasis: 'secondary' },
        ],
      }),
    ],
  },
  {
    slug: 'dark-mini-xiangqi',
    boardFamily: 'xiangqi',
    kind: 'rules',
    title: 'Dark Mini Xiangqi',
    summary:
      'Mini Xiangqi under Fog of War: each side sees only the points its pieces reach on the 7×7 board, and the general falls by capture.',
    showSummaryOnPage: false,
    status: 'published',
    publishedAt: '2026-05-30',
    audience:
      'Dark Xiangqi readers who want the smaller experimental ruleset Mistboard is testing first.',
    thumbnail: { kind: 'svg', svg: MINI_XIANGQI_DARK_THUMBNAIL },
    intro: [
      {
        kind: 'paragraph',
        text:
          '[Mini Xiangqi](/rules/mini-xiangqi) played with Fog of War: each player sees only their own pieces and the enemy pieces their army can reach. The board is 7 by 7, and the game ends by capturing the opposing general. If you know Mini Xiangqi, the sections below explain only what fog changes.',
      },
    ],
    sections: [
      {
        heading: 'Board and fog',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The board and army are the same as Mini Xiangqi. Fog of War then hides the board: you see your own pieces and every point they can reach, and everything else is fog.',
          },
          {
            kind: 'raw-svg',
            svg: MINI_XIANGQI_DARK_TRIPTYCH,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              'The opening position from three angles. Red and Black each see only their own side clearly, while the server holds the true board in the middle. Vision is recomputed after every move, so opening a line or losing a piece immediately changes what each player knows.',
          },
          {
            kind: 'paragraph',
            text:
              'You never see enemy pieces outside your vision, whether a fogged point is empty, or the identity of a shrouded blocker.',
          },
        ],
      },
      {
        heading: 'Winning and draws',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Capture the general to win. There is no checkmate and no check warning, so you can move into danger, leave your general exposed, or let the generals face each other across an open file.',
          },
          {
            kind: 'paragraph',
            text:
              'There is no stalemate draw: if the side to move has no legal move, it loses. With no check to freeze you, this almost never happens. Draws are judged from the true position, not either player\'s view: the game draws on threefold repetition, and also after 60 plies (30 moves by each side) without a capture.',
          },
        ],
      },
      {
        heading: 'Edge cases',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Two pieces interact with fog in ways worth seeing up close.',
          },
          { kind: 'sub-heading', text: 'Cannons' },
          {
            kind: 'paragraph',
            text:
              'A cannon captures by jumping exactly one screen and landing on the first enemy piece beyond it. Under fog the rule is **screen shrouded, target revealed**: the screen shows as occupied but unidentified, the empty gap behind it stays fogged, and the capturable target is shown with a marker.',
          },
          {
            kind: 'raw-svg',
            svg: MINI_XIANGQI_CANNON_PAIR,
          } as ArticleBlock,
          { kind: 'sub-heading', text: 'Horses' },
          {
            kind: 'paragraph',
            text:
              'A horse moves one point orthogonally and then one diagonally outward, and cannot move if the leg point in between is occupied. If a hidden piece blocks the leg, the leg point shows as occupied but unidentified, and the destinations behind it drop out of your view.',
          },
          {
            kind: 'raw-svg',
            svg: MINI_XIANGQI_HORSE_PAIR,
          } as ArticleBlock,
        ],
      },
      {
        heading: 'A complete game under fog',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'To see the whole army work under Fog of War, step through a game where Mistboard’s engine, Misty 1.0, plays both sides. Each ply is shown three ways: what Red can see, the server’s true board, and what Black can see.',
          },
          {
            kind: 'mxq-replay',
            spec: {
              views: 'triptych',
              moves:
                'b1b4 f7f5 a2b2 f5d5 b4d4 c6b6 e2e3 c7b5 e1f3 b5d4 e3e4 d4b5 e4d4 d5c5 b2b3 b6c6 b3b4 b7b4 a1b1 b4a4 b1b5 a4a3 b5b1 a6b6 g2f2 a3a1 b1a1 a7a1 f2e2 a1a3 c2b2 c5b5 g1g4 e6f6 f1f6 e7d5 d4d5 d6d5 b2b3 a3a7 b3b4 b5c5 f6e6 g6g5 g4g2 g5g4 e6e3 g4g3 g2g3 g7g3 e3g3 d7d6 g3g7 a7g7 f3e1 g7g4 b4a4 g4c4 e2e3 c5c1 d1c1 c4c1',
              red: 'Misty 1.0',
              black: 'Misty 1.0',
              event: 'Misty 1.0 · Fog of War self-play',
              resultText:
                'Black’s cannon takes the horse on c1; the Red general must recapture, and the waiting chariot runs the open c-file to capture it. Black wins.',
              caption:
                'Misty 1.0 plays both sides of Dark Mini Xiangqi. Step through all 62 plies and compare the same position under Red’s fog, the server’s truth, and Black’s fog.',
            },
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Play status',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Dark Mini Xiangqi is an experimental launch candidate, not yet a public game mode. Play and invite links will appear here soon.',
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
    slug: 'dual-chess',
    kind: 'rules',
    title: 'Crossroads Chess Rules',
    summary:
      'A modern variant that fuses chess and xiangqi on a 6 by 8 river board. The pieces you already know from both games, and two ways to win: checkmate, or race your king across.',
    showSummaryOnPage: false,
    showInIndex: false,
    status: 'draft',
    audience: 'Mistboard readers who know chess or xiangqi and want the Crossroads Chess rules.',
    thumbnail: { kind: 'svg', svg: renderDualChessBoard({ fen: DUAL_START_FEN }) },
    intro: [
      {
        kind: 'paragraph',
        text:
          'Crossroads Chess puts chess and xiangqi on one board: six files by eight ranks, split by a river. Each side has a king, an army, and a finish line behind the enemy pieces.',
      },
      {
        kind: 'paragraph',
        text:
          'Most pieces move as they do in their parent games. The rule that changes everything is the race: checkmate wins, and so does getting your own king safely to the far rank.',
      },
    ],
    sections: [
      {
        heading: 'Board setup',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The river lies between the fourth and fifth ranks. As in xiangqi, only soldiers care about crossing it.',
          },
          {
            kind: 'raw-svg',
            svg: renderDualChessBoard({ fen: DUAL_START_FEN }),
            caption: 'The starting position. White moves up the board, Red moves down.',
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              'White moves first. The armies start in rotational symmetry: turn the board 180 degrees and the position is unchanged.',
          },
        ],
      },
      {
        heading: 'The pieces',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The highlighted squares below show legal moves and captures for each marked piece.',
          },
          { kind: 'sub-heading', text: 'From chess' },
          {
            kind: 'paragraph',
            text:
              '**King:** moves one square in any direction. It may not move onto a square attacked by the opponent. The king is also your racing piece (see How to win).',
          },
          {
            kind: 'raw-svg',
            svg: renderDualChessBoard({
              fen: '6/6/6/6/2K3/6/6/6',
              moveDots: ['b5', 'c5', 'd5', 'b4', 'd4', 'b3', 'c3', 'd3'],
            }),
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Bishop:** moves any number of squares diagonally. Because diagonals stay on one color, each bishop stays on light squares or dark squares for the whole game.',
          },
          {
            kind: 'raw-svg',
            svg: renderDualChessBoard({
              fen: '6/6/6/6/2B3/6/6/6',
              moveDots: ['a6', 'b5', 'd5', 'e6', 'f7', 'a2', 'b3', 'd3', 'e2', 'f1'],
            }),
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Knight:** moves in an L shape, two squares one way and one square sideways. It jumps over any pieces in its path.',
          },
          {
            kind: 'raw-svg',
            svg: renderDualChessBoard({
              fen: '6/6/6/6/2N3/6/6/6',
              moveDots: ['a5', 'b6', 'd6', 'e5', 'a3', 'b2', 'd2', 'e3'],
            }),
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Pawn:** moves one square straight forward into an empty square, or two squares from its starting position, and never moves backward. It captures one square diagonally forward (the red rings), never straight ahead. When it reaches the far rank it promotes to a queen.',
          },
          {
            kind: 'raw-svg',
            svg: renderDualChessRow([
              {
                fen: '6/6/6/6/6/2n1o1/3P2/6',
                moveDots: ['d3', 'd4'],
                captures: ['c3', 'e3'],
                label: 'FROM START',
              },
              {
                fen: '6/6/6/3P2/6/6/6/6',
                moveDots: ['d6'],
                label: 'AFTER MOVING',
              },
            ]),
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Queen:** a pawn that reaches the far rank promotes to a queen. The queen moves any number of squares horizontally, vertically, or diagonally.',
          },
          {
            kind: 'raw-svg',
            svg: renderDualChessRow([
              {
                fen: '6/5P/6/6/6/6/6/6',
                moveDots: ['f8'],
                arrows: [{ from: 'f7', to: 'f8' }],
                label: 'PROMOTE',
              },
              {
                fen: '5Q/6/6/6/6/6/6/6',
                moveDots: [
                  'a8',
                  'b8',
                  'c8',
                  'd8',
                  'e8',
                  'f7',
                  'f6',
                  'f5',
                  'f4',
                  'f3',
                  'f2',
                  'f1',
                  'e7',
                  'd6',
                  'c5',
                  'b4',
                  'a3',
                ],
                label: 'QUEEN',
              },
            ]),
          } as ArticleBlock,
          { kind: 'sub-heading', text: 'From xiangqi' },
          {
            kind: 'paragraph',
            text:
              '**Chariot:** moves any number of squares horizontally or vertically and cannot jump, exactly like a rook.',
          },
          {
            kind: 'raw-svg',
            svg: renderDualChessBoard({
              fen: '6/6/6/6/2V3/6/6/6',
              moveDots: ['c8', 'c7', 'c6', 'c5', 'c3', 'c2', 'c1', 'a4', 'b4', 'd4', 'e4', 'f4'],
            }),
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Cannon:** moves like a chariot when it is not capturing. To capture, it jumps over exactly one piece, friend or foe, called the screen, and lands on an enemy piece beyond it.',
          },
          {
            kind: 'raw-svg',
            svg: renderDualChessRow([
              {
                fen: '6/6/6/6/2C3/6/6/6',
                moveDots: ['c8', 'c7', 'c6', 'c5', 'c3', 'c2', 'c1', 'a4', 'b4', 'd4', 'e4', 'f4'],
                label: 'MOVE',
              },
              {
                fen: '6/6/2b3/6/2o3/6/6/2C3',
                moveDots: ['c2', 'c3'],
                captures: ['c6'],
                highlights: ['c4'],
                label: 'CAPTURE (jump the screen)',
              },
            ]),
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Horse:** moves like the knight, one square orthogonally and then one square diagonally outward, **but it does not jump.** Only the adjacent leg square can block it. If that square is occupied, the two moves through that leg disappear; pieces farther along the line do not block by themselves.',
          },
          {
            kind: 'raw-svg',
            svg: renderDualChessRow([
              {
                fen: '6/6/6/6/2H3/6/6/6',
                moveDots: ['a5', 'b6', 'd6', 'e5', 'a3', 'b2', 'd2', 'e3'],
                label: 'MOVES LIKE THE KNIGHT',
              },
              {
                fen: '6/6/6/2P3/2H1o1/6/6/6',
                moveDots: ['a5', 'e5', 'a3', 'b2', 'd2', 'e3'],
                highlights: ['c5'],
                crosses: ['b6', 'd6'],
                label: 'ONLY THE LEG BLOCKS',
              },
            ]),
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Soldier:** moves one square straight forward, to move or to capture, and never backward. After it crosses the river it may also move one square sideways. It never promotes.',
          },
          {
            kind: 'raw-svg',
            svg: renderDualChessRow([
              { fen: '6/6/6/6/6/2O3/6/6', moveDots: ['c4'], label: 'BEFORE THE RIVER' },
              { fen: '6/6/2O3/6/6/6/6/6', moveDots: ['c7', 'b6', 'd6'], label: 'AFTER CROSSING' },
            ]),
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              'The pawn and the soldier are opposites worth remembering: the pawn moves straight and captures diagonally, while the soldier both moves and captures straight ahead.',
          },
        ],
      },
      {
        heading: 'How to win',
        blocks: [
          { kind: 'sub-heading', text: 'Checkmate' },
          {
            kind: 'paragraph',
            text:
              'The king is protected by check, as in chess and xiangqi. A king is in check when an enemy piece attacks it, and the player in check must answer by moving the king, blocking the line of attack, or capturing the attacker. If there is no legal answer, it is checkmate and the checked player loses.',
          },
          { kind: 'sub-heading', text: 'The race' },
          {
            kind: 'paragraph',
            text:
              'The king is also a runner. Move your king onto the enemy back rank, the far row of the board, and you win at once. Because a king can never step onto a square where it could be captured, reaching the far rank means reaching it safely. White wins by landing the king on the eighth rank, Red by landing on the first.',
          },
          {
            kind: 'raw-svg',
            svg: renderDualChessRow([
              {
                fen: '2vV2/4Ko/kC4/2O3/p5/O5/5P/6',
                arrows: [{ from: 'e7', to: 'e8' }],
                highlights: ['e7', 'e8'],
                label: 'THE KING RACES IN',
              },
              {
                fen: '2vVK1/6/kC3o/2O3/p5/O5/5P/6',
                highlights: ['e8'],
                label: 'RANK 8: WHITE WINS',
              },
            ]),
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Draws',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Stalemate is a loss for the player with no legal move. Threefold repetition is also a loss, charged to the side that forces the repetition. The fifty-move rule can still draw a game after a long run with no capture and no pawn move.',
          },
        ],
      },
      {
        heading: 'A sample game',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The replay below is a Fairy-Stockfish self-play game showing the pieces in motion. The sides trade down through the middlegame, then White wins the race by marching the king to the eighth rank.',
          },
          {
            kind: 'dual-replay',
            spec: {
              white: DUAL_CHESS_SAMPLE_GAME.white,
              red: DUAL_CHESS_SAMPLE_GAME.red,
              event: DUAL_CHESS_SAMPLE_GAME.event,
              resultText: DUAL_CHESS_SAMPLE_GAME.result,
              moves: DUAL_CHESS_SAMPLE_GAME.moves,
            },
            caption: 'Fairy-Stockfish self-play on the canonical 6 by 8 setup. White wins the race.',
          } as ArticleBlock,
        ],
      },
      {
        heading: 'The nature of the game',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The early game often becomes a race of pawn and soldier advances, because both armies can cross the center quickly. The endgame is less about holding a fortress than managing king routes: your king must stay safe, but it is also the fastest way to win.',
          },
        ],
      },
      relatedClosing({
        heading: 'Where to next',
        lead: 'Start a local game, or read the rules of the two games Crossroads Chess borrows from.',
        links: [
          { label: 'Play Crossroads Chess', href: '/dual-chess-play', emphasis: 'primary' },
          { label: 'Read Chess Rules', href: '/rules/chess', emphasis: 'secondary' },
          { label: 'Read Xiangqi Rules', href: '/rules/xiangqi', emphasis: 'secondary' },
          { label: 'All rules', href: '/rules', emphasis: 'secondary' },
        ],
      }),
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
  {
    slug: 'shogi4',
    kind: 'rules',
    title: 'Shogi4 (4×4 Shogi) Rules',
    summary:
      "The complete rules of Shogi4 (4x4 Shogi), Oca Studios' public-domain animal drop-shogi on a 4×4 board: how the Carp, Tapir, Raccoon-dog, Fox, and royal move, plus the friendly-jump, evolution, drops, and king-capture wins.",
    showSummaryOnPage: false,
    status: 'published',
    publishedAt: '2026-06-05',
    updatedAt: '2026-06-06',
    audience:
      'Players and shogi-curious readers who want the full, primary-sourced rules of Shogi4, a 4×4 drop-shogi.',
    thumbnail: { kind: 'svg', svg: SHOGI4_RULES_THUMBNAIL },
    intro: [
      {
        kind: 'paragraph',
        text:
          'Shogi4, also called 4x4 Shogi, is a drop-shogi played with animal tiles on a 4×4 board. It plays much like ordinary shogi shrunk to sixteen squares: pieces step in marked directions, captured pieces switch sides and drop back into play, and you win by taking the king. The one rule shogi players won\'t recognize is that a piece may hop over a friendly piece, added so your own pieces don\'t jam each other on a board this small.',
      },
      {
        kind: 'paragraph',
        text:
          'Oca Studios released Shogi4 into the public domain in its "Four" series, free as a print-and-play set and as an app. Each player has five pieces: a Carp, a Tapir, a Raccoon-dog, a Fox, and a royal (a Crane for the first player, a Pheasant for the second).',
      },
    ],
    sections: [
      {
        heading: 'The board and setup',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "The board is 4×4, with a farm to either side that holds captured pieces. A tile's owner is shown by its facing: the first player's tiles point up the board, the second player's point down.",
          },
          {
            kind: 'raw-svg',
            svg: SHOGI4_START_BOARD,
          } as ArticleBlock,
        ],
      },
      {
        heading: 'The pieces',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Every piece moves one square per turn, in the directions printed on its tile. On reaching the far row, each non-royal piece evolves, flipping to its evolved side. The pairs below show the base piece, then its evolved form, with a dot on every square each can reach (forward is up).',
          },
          {
            kind: 'paragraph',
            text: '**Carp → Koi.** The Carp steps one square straight forward, a pawn. It evolves into a Koi, which moves as a silver from shogi.',
          },
          { kind: 'raw-svg', svg: SHOGI4_PAIR_CARP } as ArticleBlock,
          {
            kind: 'paragraph',
            text: '**Tapir → Baku.** The Tapir steps forward or to a forward diagonal. It evolves into a Baku, a silver.',
          },
          { kind: 'raw-svg', svg: SHOGI4_PAIR_TAPIR } as ArticleBlock,
          {
            kind: 'paragraph',
            text: '**Raccoon-dog → Tanuki.** The Raccoon-dog steps one diagonal. It evolves into a Tanuki, a silver.',
          },
          { kind: 'raw-svg', svg: SHOGI4_PAIR_RACCOON } as ArticleBlock,
          {
            kind: 'paragraph',
            text: '**Fox → Kitsune.** The Fox steps one orthogonal. It evolves into a Kitsune, which moves as a gold from shogi.',
          },
          { kind: 'raw-svg', svg: SHOGI4_PAIR_FOX } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Crane / Pheasant.** The royal steps one square in any of the eight directions, a king. The two royals differ only in theme. It never evolves, and capturing it ends the game.',
          },
          {
            kind: 'raw-svg',
            svg: SHOGI4_MOVE_ROYAL,
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Jumping over a friendly piece',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'A piece can leap over a friendly piece. If an ally sits on the next square in a direction the piece moves, the piece jumps it and lands on the square just beyond, empty or capturing an enemy there. It works in any direction the piece itself moves: straight for a Carp, on the diagonal for a Raccoon-dog, any of the eight for the royal.',
          },
          {
            kind: 'raw-svg',
            svg: SHOGI4_JUMP_CASES,
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Capturing, farms, and drops',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Move onto an enemy to capture it; it switches sides into your farm, reverting to its base form if it was evolved.',
          },
          {
            kind: 'raw-svg',
            svg: SHOGI4_CAPTURE,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              "Instead of moving, drop a piece from your farm onto any empty square, except those on the far row (the opponent's back rank).",
          },
          {
            kind: 'raw-svg',
            svg: SHOGI4_DROP,
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Winning',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Capturing the royal is the only way to win. No check, no checkmate: the game ends the moment a royal is taken.',
          },
          {
            kind: 'raw-svg',
            svg: SHOGI4_WIN,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              'There is no stalemate. Because moving the king into capture range is legal, a lack of safe moves never ends the game: you simply make the unsafe move and play on until a king is taken. A side with no legal move at all, boxed in with nothing to drop, loses rather than draws.',
          },
        ],
      },
      {
        heading: 'Repetition and draws',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The original rules address neither repetition nor a move-count limit. Our convention fills the gap: a position reached three times is an automatic draw. That rule is ours, not Oca\'s, and changes none of the rules above.',
          },
        ],
      },
      {
        heading: 'A sample game',
        blocks: [
          {
            kind: 'paragraph',
            text: SHOGI4_GAME_TITLE,
          },
          {
            kind: 'raw-svg-stepper',
            header: {
              players: 'Fairy-Stockfish (White) vs Fairy-Stockfish (Black)',
              event: 'Engine self-play · 2s/move',
            },
            steps: SHOGI4_GAME_STEPS,
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Source and license',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Shogi4 and its tile art are by Oca Studios, which released its whole \"Four\" series into the public domain. The [BoardGameGeek entry](https://boardgamegeek.com/boardgame/146291/shogi4) is a catalog reference.",
          },
          {
            kind: 'paragraph',
            text:
              "We recovered the exact rules from Oca's official Shogi4 app, decompiling it to read the move logic directly: the friendly-jump geometry, the single drop ban, and king-capture as the sole win all come from there. Oca's public rules page and starting-position graphic (now reachable only through the [Internet Archive](https://web.archive.org/web/20240926113424/https://www.ocastudios.com/four/shogi/), since the live site is down) corroborate the board and the basic moves.",
          },
        ],
      },
      relatedClosing({
        heading: 'Playing Shogi4',
        lead: "Shogi4 isn't playable on the site yet; for now this page is the rules reference. Browse the rest of the rules, or compare it with the chess and xiangqi primers.",
        links: [
          { label: 'All rules', href: '/rules', emphasis: 'primary' },
          { label: 'Chess Rules', href: '/rules/chess', emphasis: 'secondary' },
          { label: 'Xiangqi Rules', href: '/rules/xiangqi', emphasis: 'secondary' },
        ],
      }),
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
