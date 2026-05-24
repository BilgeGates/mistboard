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
  createChess960CastlingRightsForSides,
  createChess960InitialBoardForSides,
  darkChessVariant,
  type BackRankRole,
  type Board,
  type Chess960Start,
  type GameState,
  type PieceRole,
  type Square,
} from '@mistboard/game';
import articleSnapshotFog from './article-snapshot-fog.json' with { type: 'json' };
import articleSnapshotFogBlack from './article-snapshot-fog-black.json' with { type: 'json' };

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
export type ArticleThumbnail = {
  pieces: BoardSpec['pieces'];
  fogSquares?: BoardSpec['fogSquares'];
  orientation?: BoardSpec['orientation'];
};

export type Article = {
  slug: string;
  title: string;
  summary: string;
  status: 'outline' | 'draft' | 'published';
  audience: string;
  // ISO-8601 dates (YYYY-MM-DD). When present, rendered in the article meta.
  publishedAt?: string;
  updatedAt?: string;
  tldr?: string[];
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
// White rooks doubled on the d-file (d1 supports d2). White's d2 rook sees
// up the d-file but not across rank 7, so Black's king (h7) and queen (b7)
// sit in fog. White slides Rd2-d7 — the rook's new square reveals rank 7,
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
const DISCOVERY_FINAL = darkChessVariant.applyMove(DISCOVERY_BEFORE, { from: 'd2', to: 'd7' });
const DISCOVERY_BEFORE_FOG_W = fogFor(DISCOVERY_BEFORE, 'white');
const DISCOVERY_FINAL_FOG_W = fogFor(DISCOVERY_FINAL, 'white');

// ── Worked game: test1 (Black) vs test2 (White), local 2026-05-15 ─────────────
// Room 092ca35d-bd5d-4517-a135-cd7a9c3eb3f1 — 82 ply, Black wins, king captured
// A 41-move game. The Black pawn lands on c5 on move 12 and stays there for
// 70 ply. White's king never once sees it — until it walks to b4 on move 41
// and the pawn captures it immediately.
const PVP_START = darkChessVariant.createInitialState('pvp-t2t1-82ply');
const PVP_STATES = replayMoves(PVP_START, [
  { from: 'e2', to: 'e4' },  // 1.e4
  { from: 'e7', to: 'e6' },  // 1...e6
  { from: 'b1', to: 'c3' },  // 2.Nc3
  { from: 'f8', to: 'e7' },  // 2...Be7
  { from: 'f1', to: 'e2' },  // 3.Be2
  { from: 'b7', to: 'b5' },  // 3...b5
  { from: 'a2', to: 'a3' },  // 4.a3
  { from: 'a7', to: 'a6' },  // 4...a6
  { from: 'g1', to: 'f3' },  // 5.Nf3
  { from: 'c8', to: 'b7' },  // 5...Bb7
  { from: 'd2', to: 'd4' },  // 6.d4
  { from: 'd7', to: 'd6' },  // 6...d6
  { from: 'c1', to: 'e3' },  // 7.Be3
  { from: 'b8', to: 'd7' },  // 7...Nd7
  { from: 'h1', to: 'g1' },  // 8.Rg1
  { from: 'e7', to: 'f6' },  // 8...Bf6
  { from: 'd1', to: 'd2' },  // 9.Qd2
  { from: 'd8', to: 'e7' },  // 9...Qe7
  { from: 'a1', to: 'd1' },  // 10.Rd1
  { from: 'e6', to: 'e5' },  // 10...e5
  { from: 'd4', to: 'd5' },  // 11.d5
  { from: 'd7', to: 'c5' },  // 11...Nc5
  { from: 'e3', to: 'c5' },  // 12.Bxc5
  { from: 'd6', to: 'c5' },  // 12...dxc5 ← THE PAWN LANDS
  { from: 'd5', to: 'd6' },  // 13.d6
  { from: 'c7', to: 'd6' },  // 13...cxd6
  { from: 'd2', to: 'd6' },  // 14.Qxd6
  { from: 'e7', to: 'd6' },  // 14...Qxd6
  { from: 'd1', to: 'd6' },  // 15.Rxd6
  { from: 'g8', to: 'e7' },  // 15...Ne7
  { from: 'd6', to: 'd2' },  // 16.Rd2
  { from: 'e8', to: 'h8' },  // 16...O-O
  { from: 'c3', to: 'd5' },  // 17.Nd5
  { from: 'e7', to: 'd5' },  // 17...Nxd5
  { from: 'e4', to: 'd5' },  // 18.exd5
  { from: 'f8', to: 'd8' },  // 18...Rfd8
  { from: 'b2', to: 'b3' },  // 19.b3
  { from: 'd8', to: 'd7' },  // 19...Rd7
  { from: 'c2', to: 'c4' },  // 20.c4
  { from: 'b5', to: 'c4' },  // 20...bxc4
  { from: 'b3', to: 'c4' },  // 21.bxc4
  { from: 'a8', to: 'd8' },  // 21...Rad8
  { from: 'e2', to: 'd1' },  // 22.Bd1
  { from: 'e5', to: 'e4' },  // 22...e4
  { from: 'f3', to: 'e5' },  // 23.Ne5
  { from: 'f6', to: 'e5' },  // 23...Bxe5
  { from: 'f2', to: 'f3' },  // 24.f3
  { from: 'e4', to: 'f3' },  // 24...exf3
  { from: 'd1', to: 'f3' },  // 25.Bxf3
  { from: 'f7', to: 'f6' },  // 25...f6
  { from: 'e1', to: 'f2' },  // 26.Kf2
  { from: 'd8', to: 'e8' },  // 26...Re8
  { from: 'g1', to: 'e1' },  // 27.Re1
  { from: 'd7', to: 'd8' },  // 27...Rd8
  { from: 'd2', to: 'e2' },  // 28.Re2
  { from: 'e5', to: 'd6' },  // 28...Bd6
  { from: 'e2', to: 'e8' },  // 29.Rxe8
  { from: 'd8', to: 'e8' },  // 29...Rxe8
  { from: 'e1', to: 'e8' },  // 30.Rxe8
  { from: 'g8', to: 'f7' },  // 30...Kf7
  { from: 'e8', to: 'a8' },  // 31.Ra8
  { from: 'b7', to: 'a8' },  // 31...Bxa8
  { from: 'f3', to: 'e4' },  // 32.Be4
  { from: 'a8', to: 'b7' },  // 32...Bb7
  { from: 'e4', to: 'h7' },  // 33.Bh7
  { from: 'd6', to: 'h2' },  // 33...Bh2
  { from: 'h7', to: 'd3' },  // 34.Bd3
  { from: 'h2', to: 'e5' },  // 34...Be5
  { from: 'd5', to: 'd6' },  // 35.d6
  { from: 'e5', to: 'd6' },  // 35...Bxd6
  { from: 'f2', to: 'e3' },  // 36.Ke3
  { from: 'b7', to: 'g2' },  // 36...Bg2 (captures white g-pawn)
  { from: 'a3', to: 'a4' },  // 37.a4
  { from: 'g7', to: 'g5' },  // 37...g5
  { from: 'a4', to: 'a5' },  // 38.a5
  { from: 'g2', to: 'c6' },  // 38...Bc6
  { from: 'e3', to: 'd2' },  // 39.Kd2
  { from: 'g5', to: 'g4' },  // 39...g4
  { from: 'd2', to: 'e3' },  // 40.Ke3 (was Kc3) — king walks toward attacker
  { from: 'g4', to: 'g3' },  // 40...g3
  { from: 'e3', to: 'f4' },  // 41.Kf4 (was Kb4) — walks onto d6-bishop's h2-d6 diagonal
  { from: 'd6', to: 'f4' },  // 41...Bxf4 (was cxb4) — bishop captures king
]);

const PVP_FULL_POSITIONS = PVP_STATES.map((state) => {
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
  a8: { color: 'black', role: 'rook' },
  e8: { color: 'black', role: 'king' },
  h8: { color: 'black', role: 'rook' },
  a7: { color: 'black', role: 'pawn' },
  b7: { color: 'black', role: 'pawn' },
  c7: { color: 'black', role: 'pawn' },
  d7: { color: 'black', role: 'pawn' },
  h7: { color: 'black', role: 'pawn' },
  // White: attacking side
  a3: { color: 'white', role: 'bishop' },
  b2: { color: 'white', role: 'pawn' },
  c2: { color: 'white', role: 'pawn' },
  d2: { color: 'white', role: 'pawn' },
  h2: { color: 'white', role: 'pawn' },
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

// Pre-stringified captured WS frame for the server-enforced-fog article.
// White's payload is rendered as a code block; black's snapshot is consumed
// only by the live-boards pair (board + visibleSquares), so only one JSON
// text constant is needed.
const SERVER_FOG_SNAPSHOT_JSON_TEXT = JSON.stringify(articleSnapshotFog, null, 2);

// Board + fog projections for the live-boards pair in the article. Sourced
// from the captured snapshots so the rendered position is exactly what was
// on the wire (not a re-simulated approximation).
type CapturedFrame = { state: { board: Board; visibleSquares: Square[] } };
const SERVER_FOG_FRAME_W = articleSnapshotFog as unknown as CapturedFrame;
const SERVER_FOG_FRAME_B = articleSnapshotFogBlack as unknown as CapturedFrame;
const SERVER_FOG_FOG_W = fogSquaresFromVisible(SERVER_FOG_FRAME_W.state.visibleSquares);
const SERVER_FOG_FOG_B = fogSquaresFromVisible(SERVER_FOG_FRAME_B.state.visibleSquares);

// Anatomy of the move-submission wire (client → server). One small payload;
// the loop closes here.
const SERVER_FOG_MOVE_PAYLOAD = `// client → server, sent on player's move
{ type: 'move', from: 'e2', to: 'e4' }`;

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

const SERVER_FOG_CODE_MAP = `visibility set, masked board, player view
  packages/game/src/variants.ts

per-recipient outbound layer (snapshot and delta share one filter)
  apps/server/src/payloads.ts

connection rule + HTTP replay rule
  apps/server/src/server-policy.ts

seat token mint + verify
  apps/server/src/index.ts

regression tests pinning the wire format
  apps/server/src/delta-ws.test.ts`;

export const articles: Article[] = [
  {
    slug: 'dark-chess-rules',
    title: 'Dark chess: the canonical reference',
    summary:
      'A side sees only what its pieces can legally see. King capture ends the game, not checkmate. Everything else is regular chess.',
    status: 'published',
    publishedAt: '2026-05-22',
    updatedAt: '2026-05-22',
    audience:
      'Any chess player who has heard of dark chess (or Fog of War) and wants to understand it from scratch.',
    thumbnail: ARTICLE_OG_POSITIONS['dark-chess-rules'],
    sections: [
      {
        heading: 'The starting position',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "[Dark chess](https://en.wikipedia.org/wiki/Dark_chess) (also called Fog of War) was invented by Jens Bæk Nielsen and Torben Osted in 1989. It is the implicit-fog version of the idea: no umpire, no scan action. Each side's visibility is derived from where its pieces can legally move.",
          },
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
                { board: DISCOVERY_FINAL.board, fogSquares: DISCOVERY_FINAL_FOG_W, orientation: 'white', label: 'AFTER', arrows: [{ orig: 'd2', dest: 'd7' }] },
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
              "Games auto-draw on threefold repetition (same position three times, same side to move, same castling and en-passant rights) and the 50-move rule (fifty full moves with no pawn move or capture). Both apply to the true position, not either player's view. No stalemate, no insufficient-material draw.",
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
        heading: 'Basic deduction',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "You can read the darkness to deduce what's happening on the board.",
          },
          { kind: 'sub-heading', text: 'Pawn moves' },
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
          { kind: 'sub-heading', text: 'Captures' },
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
        ],
      },
      {
        heading: 'A sample game',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "A realistic 41-move game between two decent players.",
          },
          {
            kind: 'interactive',
            widget: 'stepper',
            spec: {
              layout: 'triptych',
              positions: PVP_FULL_POSITIONS,
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
    slug: 'draft960',
    title: 'Draft960: dark chess with a hidden draft',
    summary:
      "Each player drafts one of three Chess960 setups, sealed. From move zero, you don't know your opponent's back rank. Everything else is regular dark chess.",
    status: 'outline',
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
    slug: 'engine-belief-state',
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
          'CTA: GitHub repo, engine code path under apps/server, research sidecar in research/python-fow-lab, contribution guide link.',
        ],
      },
    ],
  },
  {
    slug: 'server-enforced-fog',
    title: 'Designing a dark chess server',
    summary:
      'How the server keeps half the game hidden: one view per recipient, the rules that compute it, and the bytes of a real frame.',
    status: 'outline',
    audience:
      'Engineers curious how a hidden-information game enforces visibility server-side.',
    thumbnail: ARTICLE_OG_POSITIONS['server-enforced-fog'],
    tldr: [
      'Dark chess server-side: one PlayerView per recipient, hidden state never leaves the box.',
      'Captured wire payload + the identity layer the views rest on.',
    ],
    sections: [
      {
        heading: 'The obvious approach doesn\'t work',
        blocks: [
          { kind: 'paragraph', text: 'Dark chess is regular chess with one change: each side sees only the squares its pieces can reach. The opponent\'s pieces are hidden until you can see them.' },
          { kind: 'paragraph', text: 'The obvious way to build it on the web is to send the canonical position to both clients and paint fog over the squares each player isn\'t supposed to see. The opponent\'s pieces are still in the browser; they just aren\'t on the screen. Anyone with dev tools can read them, and browser extensions that strip the fog already exist for the dominant chess platform\'s dark chess offering.' },
          { kind: 'paragraph', text: 'The fix is structural: the server has to compute one view per recipient and never let the hidden state leave the box.' },
        ],
      },
      {
        heading: 'What the server enforces',
        blocks: [
          { kind: 'paragraph', text: 'The server holds the full game state — board, both clocks, both move histories. Clients never see it. They receive a PlayerView, computed per recipient: take this player\'s pieces, derive a visibility set, mask the board to that set, strip the opponent\'s last move, attach this player\'s legal moves and clock.' },
          { kind: 'paragraph', text: 'Every state-changing event triggers one PlayerView per connected client. Two recipients, two distinct messages, two different sets of bytes. There is no "broadcast then mask later."' },
          { kind: 'paragraph', text: 'Three rules layer on top of the per-recipient computation.' },
          { kind: 'sub-heading', text: 'Connection gate' },
          { kind: 'paragraph', text: 'A live dark chess game is private to its seated players. Anyone else is closed at the WebSocket layer before any game data is sent. The same rule gates HTTP replay: live games return 403, finished games return the event log. One rule covers PvP, PvE, and EvE — no per-mode access table to drift out of sync.' },
          { kind: 'sub-heading', text: 'Game-end reveal' },
          { kind: 'paragraph', text: 'When a game ends, the canonical position becomes public. Hidden moves show up in replay; the replay endpoint opens. This is the rulebook, not a leak — finished games are how share links work.' },
          { kind: 'sub-heading', text: 'Canonical position decides draws and clocks' },
          { kind: 'paragraph', text: 'Threefold repetition, the 50-move rule, and clock expiration run against the canonical position, not what either player can see. Counting from views would be both incorrect (positions that aren\'t equal would be called equal) and exploitable (a player could construct a draw they don\'t have).' },
        ],
      },
      {
        heading: 'The two views',
        blocks: [
          { kind: 'paragraph', text: 'Same canonical game state, three moves in (1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6). The server\'s job is to project one view per recipient.' },
          {
            kind: 'live-boards',
            spec: {
              layout: 'pair',
              boards: [
                { board: SERVER_FOG_FRAME_W.state.board, fogSquares: SERVER_FOG_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                { board: SERVER_FOG_FRAME_B.state.board, fogSquares: SERVER_FOG_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
              ],
            },
            caption: 'Both boards drawn from the captured payloads below — verbatim positions, not re-simulated. Black\'s view is drawn from white\'s side for easier comparison; from black\'s actual perspective the board is flipped.',
          } as ArticleBlock,
          { kind: 'paragraph', text: 'White sees two of black\'s pieces — black\'s e-pawn and f6-knight have wandered into the squares white\'s pieces light up. Black sees one of white\'s — only the e-pawn. The bishop on c4 sits aimed at f7, completely invisible to black.' },
          { kind: 'sub-heading', text: 'On the wire' },
          { kind: 'paragraph', text: 'Here\'s the WebSocket payload behind white\'s board above. Real bytes, anonymized.' },
          { kind: 'code', language: 'json', text: SERVER_FOG_SNAPSHOT_JSON_TEXT, caption: 'White\'s snapshot frame. The `state.board` and `state.visibleSquares` fields are what render the board.', maxHeight: 340 },
          { kind: 'paragraph', text: 'Black\'s payload is the same shape projected the other way: `state.board` has black\'s 16 pieces plus the one visible white pawn; `state.visibleSquares` is black\'s lit set; `events` carries three move-played entries all `color: "black"`; `state.lastMove` is present and equals their own `g8-f6` (a player always keeps their own last move; only the opponent\'s gets stripped during play). One field both payloads agree on: `state.status.turn` is `"white"` in both — turn is canonical state, it has to agree across recipients.' },
          { kind: 'paragraph', text: 'This is the hydration shape — what a browser gets on first connect or when it explicitly asks via snapshot:request. Steady-state moves ship as smaller event-appended deltas (one filtered event per frame, same per-recipient projection); snapshots stay for first connect, gap recovery, and the game-end reveal.' },
          { kind: 'paragraph', text: 'The same harness that captured these — spawning the production server, opening real WebSockets, asserting on bytes — runs on every commit.' },
        ],
      },
      {
        heading: 'What the client does with it',
        blocks: [
          { kind: 'paragraph', text: 'The client trusts the view. It renders the pieces in `state.board`, paints the squares not in `state.visibleSquares` as fog, draws the move arrow if `state.lastMove` is present, and shows `state.legalMoves` when it\'s the player\'s turn. There is no reconstruction step, no client-side fog-of-war kernel — the server already did that work, and the bytes the client receives are the bytes it renders.' },
          { kind: 'paragraph', text: 'When the player makes a move, the client sends a single message back:' },
          { kind: 'code', language: 'typescript', text: SERVER_FOG_MOVE_PAYLOAD, maxHeight: 120 },
          { kind: 'paragraph', text: 'The server validates the move against the canonical game state (not against any client\'s view), applies it, and triggers the next per-recipient computation for every connected client. The loop closes.' },
        ],
      },
      {
        heading: 'Identity',
        blocks: [
          { kind: 'paragraph', text: 'The view computation only works if the server knows whose view to compute. If a socket\'s seat is wrong — white\'s frame goes to black, or to a third party — every other rule above runs on a lie.' },
          { kind: 'paragraph', text: 'When a player first claims a seat, the server mints a random per-seat token, stores its bcrypt hash, and hands the raw token back to that one client. Every future WebSocket connection from that client presents the token in the subprotocol header. The server verifies it against the stored hash (constant-time) and binds the socket to a server-assigned seat. The seat is something the server remembers, not something the client claims.' },
          { kind: 'paragraph', text: 'Three properties matter. Tokens are minted server-side, so a client cannot ask for white\'s seat without the token white was given. Only the hash is stored, so a leaked database doesn\'t hand an attacker working tokens. Comparison is constant-time, so there is no timing side channel. The token doubles as the reconnect mechanism — refresh the page, present the token, get your seat back.' },
        ],
      },
      {
        heading: 'What we gave up',
        blocks: [
          { kind: 'sub-heading', text: 'Anonymous identity' },
          { kind: 'paragraph', text: 'Possession of the seat token is possession of the seat. There is no OAuth-bound account guarding it. Anyone with the link who got the token can take that seat. This is what makes link-share casual play simple; the design above would still hold under stronger identity if Mistboard adds it later.' },
          { kind: 'sub-heading', text: 'No live spectator view' },
          { kind: 'paragraph', text: 'A fair, mutually-hidden view for friends watching a live game would require exposing at least one side\'s perspective. We couldn\'t make it safe without growing the rule set above, so the answer is no. Friends can watch after the game ends.' },
        ],
      },
      {
        heading: 'Where the code is',
        blocks: [
          {
            kind: 'code',
            language: 'text',
            text: SERVER_FOG_CODE_MAP,
            maxHeight: 240,
          },
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
