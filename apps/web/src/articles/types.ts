// Article-schema types for the articles content modules. These are pure type
// declarations relocated from articles-data.ts; the public type surface is
// re-exported through the articles-data.ts barrel.

import type { BoardSpec, CompositionLayout } from '@mistboard/board-render';
import type { LiveBoardsOptions, SteppedBoardsOptions } from '@mistboard/board-render/interactive';
import type { Square } from '@mistboard/game';
import type { ChessReplaySpec } from '../chess-replay.js';
import type { CrossroadsReplaySpec } from '../crossroads-chess-replay.js';
import type { MiniXiangqiReplaySpec } from '../mini-xiangqi-replay.js';
import type { XiangqiReplaySpec } from '../xiangqi-replay.js';

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
export type CrossroadsReplayBlock = {
  kind: 'crossroads-replay';
  spec: CrossroadsReplaySpec;
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
  layout?: 'single-row';
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
  | CrossroadsReplayBlock
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
  splitFogSquares?: {
    left: Square[];
    right: Square[];
  };
  orientation?: BoardSpec['orientation'];
};

export type SvgArticleThumbnail = {
  kind: 'svg';
  // String is baked once; a render thunk re-runs on xiangqi appearance change so
  // the index/announcement card tracks the picked piece set (board theme is CSS).
  svg: string | (() => string);
};

export type ImageArticleThumbnail = {
  kind: 'image';
  // Path under apps/web/public (served at site root). Avoid folders that shadow
  // a client route (e.g. '/articles'): use '/article-thumbs/misty.jpg'.
  src: string;
  alt?: string;
};

export type ArticleThumbnail =
  | BoardArticleThumbnail
  | SvgArticleThumbnail
  | ImageArticleThumbnail;

export type Article = {
  slug: string;
  kind: 'rules' | 'article';
  // Rules articles: the game is live on Mistboard today (drives the
  // playable / not-yet grouping in the variant rail). Omit when the page
  // is a reference for a game we do not host yet.
  playableOnMistboard?: boolean;
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
