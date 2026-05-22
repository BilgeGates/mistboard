// Scaffolding for the three canonical articles. Each section's body is a
// placeholder pending the full draft per docs-private/articles-plan.md.
// Visual specs live in [VISUAL: ...] notes that should be replaced with
// rendered assets when sections are written.

import {
  type BoardSpec,
  type CompositionLayout,
  fogSquaresFromVisible,
  startingPositionFromBackRank,
} from '@mistboard/board-render';
import type { LiveBoardsOptions, SteppedBoardsOptions } from '@mistboard/board-render/interactive';
import {
  createChess960CastlingRightsForSides,
  createChess960InitialBoardForSides,
  fogOfWarVariant,
  type BackRankRole,
  type Board,
  type Chess960Start,
  type GameState,
  type PieceRole,
  type Square,
} from '@mistboard/game';

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

export type ArticleBlock =
  | ParagraphBlock
  | SubHeadingBlock
  | StaticBoardsBlock
  | InteractiveBlock
  | LiveBoardsBlock
  | CtaBlock
  | RawSvgBlock;

// `blocks` is the structured body. `paragraphs` is the legacy outline body
// that still carries `[VISUAL: ...]` markers — sections are migrated to
// `blocks` as they get their real visuals.
export type ArticleSection = {
  heading: string;
  paragraphs?: string[];
  blocks?: ArticleBlock[];
};

export type Article = {
  slug: string;
  title: string;
  summary: string;
  status: 'outline' | 'draft' | 'published';
  audience: string;
  tldr?: string[];
  sections: ArticleSection[];
};

// Three distinct Chess960 starting back ranks for the Draft960 pick-screen
// hero. Each is valid (bishops on opposite-colored squares, king between
// rooks) and visually distinct from the others.
const DRAFT960_OFFER_A: PieceRole[] = ['bishop', 'bishop', 'queen', 'knight', 'knight', 'rook', 'king', 'rook'];
const DRAFT960_OFFER_B: PieceRole[] = ['rook', 'knight', 'bishop', 'bishop', 'king', 'queen', 'knight', 'rook'];
const DRAFT960_OFFER_C: PieceRole[] = ['queen', 'rook', 'bishop', 'knight', 'knight', 'bishop', 'king', 'rook'];

// Starting-position triptych for the Fog of War rules article. Visibility is
// derived from the canonical fog-of-war variant kernel so the diagram exactly
// matches what players see in a live game.
const FOW_START_STATE = fogOfWarVariant.createInitialState('fow-rules-start');
const FOW_START_VIEW_W = fogOfWarVariant.getPlayerView(FOW_START_STATE, 'white');
const FOW_START_VIEW_B = fogOfWarVariant.getPlayerView(FOW_START_STATE, 'black');
const FOW_START_FOG_W = fogSquaresFromVisible(FOW_START_VIEW_W.visibleSquares);
const FOW_START_FOG_B = fogSquaresFromVisible(FOW_START_VIEW_B.visibleSquares);

// Helper: derive the visibility complement for a player on a state.
function fogFor(state: GameState, player: 'white' | 'black'): Square[] {
  return fogSquaresFromVisible(fogOfWarVariant.getPlayerView(state, player).visibleSquares);
}

// Helper: apply a sequence of moves from a start state; returns all states
// including the start. states[0] = start, states[N] = after N-th move.
function replayMoves(
  start: GameState,
  moves: Array<{ from: Square; to: Square; promotion?: Exclude<PieceRole, 'king' | 'pawn'> }>,
): GameState[] {
  const states: GameState[] = [start];
  for (const move of moves) {
    states.push(fogOfWarVariant.applyMove(states[states.length - 1]!, move));
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
    variant: 'fog-of-war',
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
const CONE_QUEEN = coneState('cone-queen', {
  e4: { color: 'white', role: 'queen' },
});
const CONE_PAWN = coneState('cone-pawn', {
  a2: { color: 'white', role: 'pawn' },
  c2: { color: 'white', role: 'pawn' },
  e4: { color: 'white', role: 'pawn' },
  f3: { color: 'white', role: 'pawn' },
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
// White pawn on a5; black just plays b7-b5 (a two-square push next to the
// white pawn). axb6 e.p. is legal, so b6 (the e.p. target) and b5 (the
// captured pawn) are both added to white's visibility.
const ENPASSANT_INITIAL_BOARD: Board = {
  g1: { color: 'white', role: 'king' },
  a5: { color: 'white', role: 'pawn' },
  g8: { color: 'black', role: 'king' },
  b7: { color: 'black', role: 'pawn' },
};
const ENPASSANT_INITIAL: GameState = {
  id: 'fow-rules-enpassant',
  variant: 'fog-of-war',
  board: ENPASSANT_INITIAL_BOARD,
  status: { type: 'playing', turn: 'black' },
  moveNumber: 30,
  castlingRights: [],
  halfmoveClock: 0,
};
const ENPASSANT_AFTER_PUSH = fogOfWarVariant.applyMove(ENPASSANT_INITIAL, { from: 'b7', to: 'b5' });
const ENPASSANT_AFTER_CAPTURE = fogOfWarVariant.applyMove(ENPASSANT_AFTER_PUSH, { from: 'a5', to: 'b6' });
const ENPASSANT_PUSH_FOG_W = fogFor(ENPASSANT_AFTER_PUSH, 'white');
const ENPASSANT_CAPTURE_FOG_W = fogFor(ENPASSANT_AFTER_CAPTURE, 'white');

// ── Discovered visibility demo ────────────────────────────────────────────
// Black rook on d8 sees the d-file but nothing on rank 2. White's king (h2)
// and bishop (a2) sit hidden in fog. Black slides Rd8-d2 — the rook's new
// square reveals rank 2, and both white pieces appear in black's view at
// once. Demonstrates "moving a piece moves its sight": new squares enter
// visibility on the next half-move.
const DISCOVERY_BOARD: Board = {
  h2: { color: 'white', role: 'king' },
  a2: { color: 'white', role: 'bishop' },
  g8: { color: 'black', role: 'king' },
  d8: { color: 'black', role: 'rook' },
};
const DISCOVERY_BEFORE: GameState = {
  id: 'fow-rules-discovery',
  variant: 'fog-of-war',
  board: DISCOVERY_BOARD,
  status: { type: 'playing', turn: 'black' },
  moveNumber: 15,
  castlingRights: [],
  halfmoveClock: 0,
};
const DISCOVERY_FINAL = fogOfWarVariant.applyMove(DISCOVERY_BEFORE, { from: 'd8', to: 'd2' });
const DISCOVERY_BEFORE_FOG_B = fogFor(DISCOVERY_BEFORE, 'black');
const DISCOVERY_FINAL_FOG_B = fogFor(DISCOVERY_FINAL, 'black');

// ── Worked game: test1 (Black) vs test2 (White), local 2026-05-15 ─────────────
// Room 092ca35d-bd5d-4517-a135-cd7a9c3eb3f1 — 82 ply, Black wins, king captured
// A 41-move game. The Black pawn lands on c5 on move 12 and stays there for
// 70 ply. White's king never once sees it — until it walks to b4 on move 41
// and the pawn captures it immediately.
const PVP_START = fogOfWarVariant.createInitialState('pvp-t2t1-82ply');
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
  { from: 'b7', to: 'g2' },  // 36...Bg2
  { from: 'a3', to: 'a4' },  // 37.a4
  { from: 'g7', to: 'g5' },  // 37...g5
  { from: 'a4', to: 'a5' },  // 38.a5
  { from: 'g2', to: 'c6' },  // 38...Bc6
  { from: 'e3', to: 'd2' },  // 39.Kd2
  { from: 'g5', to: 'g4' },  // 39...g4
  { from: 'd2', to: 'c3' },  // 40.Kc3
  { from: 'g4', to: 'g3' },  // 40...g3
  { from: 'c3', to: 'b4' },  // 41.Kb4 ← KING WALKS INTO c5 PAWN'S RANGE
  { from: 'c5', to: 'b4' },  // 41...cxb4 ← PAWN CAPTURES KING
]);

const PVP_FULL_POSITIONS = PVP_STATES.map((state, i) => {
  const isLast = i === PVP_STATES.length - 1;
  return {
    ...(isLast ? { outcome: { headline: 'Black wins', reason: 'king captured', tone: 'win' as const } } : {}),
    boards: [
      { board: state.board, fogSquares: fogFor(state, 'white'), orientation: 'white' as const, label: "WHITE'S VIEW" },
      { board: state.board, orientation: 'white' as const, label: 'SERVER TRUTH' },
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
  variant: 'fog-of-war',
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

// Fog for the pick-screen boards — opponent's half of the board is always hidden
const PICK_SCREEN_FOG: Square[] = [
  'a5', 'b5', 'c5', 'd5', 'e5', 'f5', 'g5', 'h5',
  'a6', 'b6', 'c6', 'd6', 'e6', 'f6', 'g6', 'h6',
  'a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7',
  'a8', 'b8', 'c8', 'd8', 'e8', 'f8', 'g8', 'h8',
];

// ── Win-condition demo: vs-brian-game-3 final plies ──────────────────────────
// Brian (Black) vs production tier-1 engine (White), bakeoff PvE match. The
// engine's king walks Kf1→Ke1 with a black queen lurking unseen on e5 (it
// captured there four moves earlier); Qxe1 ends the game. Real game
// illustrating the canonical FoW failure mode: a king walking onto a file
// occupied by an opposing slider that sat outside the king's vision.
const VS_BRIAN_3_START = fogOfWarVariant.createInitialState('vs-brian-game-3');
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
// and plays Bxe8, taking the king on its starting square. Triptych is
// rendered from White's POV with fog applied — the bishop on b5 reveals
// the long diagonal down to e8.
const WHITE_BISHOP_WIN_START = fogOfWarVariant.createInitialState('white-bishop-win');
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
// Frame 3 is post-capture (status=finished), so the canonical FoW kernel
// collapses White's visibility to own pieces only. To keep the article's
// frame-to-frame story coherent (black's dxe4 result should still be visible,
// and the captured bishop sitting on e8 should be in view), we re-compute
// fog from a mock playing-state of the same position — i.e., what White
// would have seen if the game were still in motion.
const WHITE_BISHOP_WIN_FINAL_AS_PLAYING: GameState = {
  ...WHITE_BISHOP_WIN_STATES[13]!,
  status: { type: 'playing', turn: 'black' },
};
const WHITE_BISHOP_WIN_BOARDS = [
  {
    board: WHITE_BISHOP_WIN_STATES[11]!.board,
    fogSquares: fogFor(WHITE_BISHOP_WIN_STATES[11]!, 'white'),
    orientation: 'white' as const,
    arrows: [{ orig: 'f1' as Square, dest: 'b5' as Square }],
  },
  {
    board: WHITE_BISHOP_WIN_STATES[12]!.board,
    fogSquares: fogFor(WHITE_BISHOP_WIN_STATES[12]!, 'white'),
    orientation: 'white' as const,
    arrows: [{ orig: 'd5' as Square, dest: 'e4' as Square }],
  },
  {
    board: WHITE_BISHOP_WIN_STATES[13]!.board,
    fogSquares: fogFor(WHITE_BISHOP_WIN_FINAL_AS_PLAYING, 'white'),
    orientation: 'white' as const,
    arrows: [{ orig: 'b5' as Square, dest: 'e8' as Square }],
  },
];

// ── Castling triple-threat ──────────────────────────────────────────────────
// Kingside castling that is simultaneously out of, through, and into check.
// Black's knight on f3 covers e1 (out of) and g1 (into); black's rook on f8
// covers f1 (through). In FoW none of these matter — castling has no check
// restrictions. White castles, the king lands on g1, and Black's knight
// captures it on the next move.
//
// White visibility is set up so neither attacker is in sight: no e2/f2/g2
// pawns means no diagonal-capture vision onto f3, and the f-file is open
// past white's rank-1 line.
const CASTLE_TRIPLE_BOARD: Board = {
  a1: { color: 'white', role: 'rook' },
  e1: { color: 'white', role: 'king' },
  h1: { color: 'white', role: 'rook' },
  a2: { color: 'white', role: 'pawn' },
  b2: { color: 'white', role: 'pawn' },
  c2: { color: 'white', role: 'pawn' },
  d2: { color: 'white', role: 'pawn' },
  h2: { color: 'white', role: 'pawn' },
  a7: { color: 'black', role: 'pawn' },
  b7: { color: 'black', role: 'pawn' },
  c7: { color: 'black', role: 'pawn' },
  d7: { color: 'black', role: 'pawn' },
  h7: { color: 'black', role: 'pawn' },
  b8: { color: 'black', role: 'king' },
  f3: { color: 'black', role: 'knight' },
  f8: { color: 'black', role: 'rook' },
};
const CASTLE_TRIPLE_BEFORE: GameState = {
  id: 'fow-rules-castle-triple',
  variant: 'fog-of-war',
  board: CASTLE_TRIPLE_BOARD,
  status: { type: 'playing', turn: 'white' },
  moveNumber: 20,
  castlingRights: ['a1', 'h1'],
  halfmoveClock: 0,
};
const CASTLE_TRIPLE_AFTER = fogOfWarVariant.applyMove(CASTLE_TRIPLE_BEFORE, { from: 'e1', to: 'h1' });
const CASTLE_TRIPLE_FINAL = fogOfWarVariant.applyMove(CASTLE_TRIPLE_AFTER, { from: 'f3', to: 'g1' });
const CASTLE_TRIPLE_BEFORE_FOG_W = fogFor(CASTLE_TRIPLE_BEFORE, 'white');
const CASTLE_TRIPLE_AFTER_FOG_W = fogFor(CASTLE_TRIPLE_AFTER, 'white');
const CASTLE_TRIPLE_FINAL_FOG_W = CASTLE_TRIPLE_AFTER_FOG_W;

export const articles: Article[] = [
  {
    slug: 'fog-of-war-rules',
    title: 'Fog of War: the canonical reference',
    summary:
      'A side sees only what its pieces can legally see. King capture ends the game, not checkmate. Everything else is regular chess.',
    status: 'published',
    audience:
      'Any chess player who has heard of Fog of War or wants to understand it from scratch.',
    sections: [
      {
        heading: 'The starting position',
        blocks: [
          {
            kind: 'live-boards',
            spec: {
              layout: 'triptych',
              boards: [
                { board: FOW_START_STATE.board, fogSquares: FOW_START_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                { board: FOW_START_STATE.board, orientation: 'white', label: 'SERVER TRUTH' },
                { board: FOW_START_STATE.board, fogSquares: FOW_START_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
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
              "A piece sees the squares it could legally move to, plus the square it stands on. A side always sees its own pieces.",
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
        ],
      },
      {
        heading: 'Discovered visibility',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Moving a piece moves its sight. Squares it covered may go dark; squares it did not may become visible.",
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'pair',
              boards: [
                { board: DISCOVERY_BEFORE.board, fogSquares: DISCOVERY_BEFORE_FOG_B, orientation: 'black', label: 'BEFORE' },
                { board: DISCOVERY_FINAL.board, fogSquares: DISCOVERY_FINAL_FOG_B, orientation: 'black', label: 'AFTER', arrows: [{ orig: 'd8', dest: 'd2' }] },
              ],
            },
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Win condition: king capture',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Fog of War ends when a king is captured. No check, no checkmate — a side can walk into capture without seeing the threat.",
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'triptych',
              boards: WHITE_BISHOP_WIN_BOARDS,
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
              "Games auto-draw on **threefold repetition** (same position three times, same side to move, same castling and en-passant rights) or the **50-move rule** (fifty full moves with no pawn move or capture). Both apply to the true position, not either player's view.",
          },
          {
            kind: 'paragraph',
            text:
              "There's **no stalemate and no insufficient-material draw**.",
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
              "A king may castle out of, through, or into check. None of the standard-chess castling restrictions tied to check apply, because there is no check rule to enforce. The position below violates all three at once: Black's knight on f3 attacks e1 (out of) and g1 (into); Black's rook on f8 attacks f1 (through). White castles anyway — and is captured on the next move.",
          },
          {
            kind: 'interactive',
            widget: 'stepper',
            spec: {
              layout: 'pair',
              positions: [
                {
                  boards: [
                    { board: CASTLE_TRIPLE_BEFORE.board, orientation: 'white', label: 'SERVER TRUTH' },
                    { board: CASTLE_TRIPLE_BEFORE.board, fogSquares: CASTLE_TRIPLE_BEFORE_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                  ],
                },
                {
                  boards: [
                    { board: CASTLE_TRIPLE_AFTER.board, orientation: 'white', label: 'SERVER TRUTH' },
                    { board: CASTLE_TRIPLE_AFTER.board, fogSquares: CASTLE_TRIPLE_AFTER_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                  ],
                },
                {
                  outcome: { headline: 'Black wins', reason: 'king captured', tone: 'win' },
                  boards: [
                    { board: CASTLE_TRIPLE_FINAL.board, orientation: 'white', label: 'SERVER TRUTH' },
                    { board: CASTLE_TRIPLE_FINAL.board, fogSquares: CASTLE_TRIPLE_FINAL_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                  ],
                },
              ],
            },
          } as ArticleBlock,
          { kind: 'sub-heading', text: 'En passant' },
          {
            kind: 'paragraph',
            text:
              "Standard en passant mechanics apply. The capturing side's visibility expands to include the target square and the adjacent square the captured pawn occupies — the only case where a pawn can see a square it could not legally move to.",
          },
          {
            kind: 'interactive',
            widget: 'stepper',
            spec: {
              layout: 'pair',
              positions: [
                {
                  boards: [
                    { board: ENPASSANT_AFTER_PUSH.board, orientation: 'white', label: 'SERVER TRUTH' },
                    { board: ENPASSANT_AFTER_PUSH.board, fogSquares: ENPASSANT_PUSH_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                  ],
                },
                {
                  boards: [
                    { board: ENPASSANT_AFTER_CAPTURE.board, orientation: 'white', label: 'SERVER TRUTH' },
                    { board: ENPASSANT_AFTER_CAPTURE.board, fogSquares: ENPASSANT_CAPTURE_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                  ],
                },
              ],
            },
          } as ArticleBlock,
        ],
      },
      {
        heading: 'A worked game',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "A complete 41-move game. Step through to see how visibility shifts across the board.",
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
        heading: 'Related variants',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Fog of War was invented by Jens Bæk Nielsen and Torben Osted in 1989; it is the implicit version of the idea — no umpire, no scan action, visibility derived from where each side's pieces can move. [Chess.com's variant](https://www.chess.com/variants/fog-of-war) popularized it online, and Mistboard's rules match theirs.",
          },
        ],
      },
      {
        heading: 'Try it',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Mistboard runs Fog of War as the default variant. Casual games are 3 minutes plus a 2-second increment. No account, no rating during beta.",
          },
          {
            kind: 'cta',
            buttons: [
              { label: 'Find an opponent', href: '/', emphasis: 'primary' },
              { label: 'Play a friend', href: '/', emphasis: 'secondary' },
              { label: 'View on GitHub', href: 'https://github.com/brianhliou/mistboard', emphasis: 'secondary', external: true },
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
    title: 'Draft960: the end of opening theory in Fog of War',
    summary:
      'A variant of Fog of War built on Chess960. Each player picks secretly from their own independent set of three starting positions. Two layers of hidden information — and a different board every game.',
    status: 'outline',
    audience:
      'Readers who have grokked Fog of War (start with the rules article if not). Curious chess players following the Mistboard OG card to learn what makes Draft960 unique.',
    tldr: [
      'Fog of War hides the board mid-game. Draft960 also hides the starting position — from move 0, neither player knows the other\'s setup.',
      'Each player picks from their own independent set of three Chess960 offers. The picks stay sealed until the pieces start moving.',
    ],
    sections: [
      {
        heading: 'The pick screen',
        blocks: [
          {
            kind: 'static-boards',
            layout: 'triptych',
            canvasWidth: 720,
            canvasHeight: 244,
            boardSize: 200,
            boardY: 34,
            gap: 30,
            labelY: 22,
            labelFill: '#4b5563',
            boards: [
              { pieces: startingPositionFromBackRank(DRAFT960_OFFER_A).filter((p) => p.color === 'white'), fogSquares: PICK_SCREEN_FOG, label: 'A' },
              { pieces: startingPositionFromBackRank(DRAFT960_OFFER_B).filter((p) => p.color === 'white'), fogSquares: PICK_SCREEN_FOG, label: 'B' },
              { pieces: startingPositionFromBackRank(DRAFT960_OFFER_C).filter((p) => p.color === 'white'), fogSquares: PICK_SCREEN_FOG, label: 'C' },
            ],
            caption: "Your three offers. Your opponent gets their own independent set — they never see yours.",
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text: "Draft960 merges Fog of War and Chess960 into one variant. Fog of War hides the board mid-game. Chess960 scrambles where everything starts. Both layers hidden simultaneously — pick one of three random setups, keep it sealed, and neither side knows what the other started from until the pieces start talking.",
          },
        ],
      },
      {
        heading: 'The gradual reveal',
        blocks: [
          {
            kind: 'paragraph',
            text: "Your opponent's setup is hidden — but not forever. Each piece that moves off the back rank tells you something about where it started. The reveal isn't an announcement; it happens one move at a time, through fog.",
          },
          {
            kind: 'interactive',
            widget: 'stepper',
            spec: {
              layout: 'triptych',
              positions: D960_FULL_POSITIONS,
            },
            caption: "By move 3, each player has deduced something about the other's setup — through the fog, one piece at a time.",
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Try it',
        blocks: [
          {
            kind: 'paragraph',
            text: "Draft960 is available as a pregame option when creating a private room. Pick your setup, share the link, play.",
          },
          {
            kind: 'cta',
            buttons: [
              { label: 'Play a friend', href: '/', emphasis: 'primary' },
              { label: 'Find an opponent', href: '/', emphasis: 'secondary' },
            ],
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text: "New to Fog of War? The [rules article](/articles/fog-of-war-rules) covers visibility, king capture, and the edge cases — start there before your first Draft960 game.",
          },
        ],
      },
    ],
  },
  {
    slug: 'engine-belief-state',
    title: 'Building an engine for hidden-information chess',
    summary:
      'Stockfish-class engines don’t transfer to Fog of War because they assume perfect information. The right technique is belief-state search with particle-filter approximations, drawn from the Reconnaissance Blind Chess literature.',
    status: 'outline',
    audience:
      'Chess engine developers, AI/ML researchers, software engineers curious about belief-state methods.',
    tldr: [
      'Standard chess engines assume one ground-truth board. Fog of War requires reasoning over a distribution of possible truths.',
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
    title: 'How Mistboard enforces Fog of War',
    summary:
      'Each client receives only its own view — never the canonical position. The kernel that derives a per-player view, the gateway that shapes outbound traffic, and the regression tests that pin the contract. Plus how the same source-of-truth principle handles threefold repetition, the 50-move rule, and clocks.',
    status: 'outline',
    audience:
      'Chess developers, security-minded readers, anyone curious about how an open-source online chess platform enforces a hidden-information variant correctly.',
    tldr: [
      'Mistboard\'s server holds the canonical game state. Clients never receive it — they receive a derived PlayerView, computed per recipient, with hidden pieces and hidden moves stripped before the bytes leave the server.',
      'Three layers do the work: a per-recipient view kernel in packages/game, a per-recipient outbound shaper in apps/server, and a connection-layer rule that lets only seated players observe a live game.',
      'The same source-of-truth principle decides threefold repetition (counted over canonical positions, not visible ones), the 50-move rule, and clock expiration. The server is authoritative; the client renders.',
    ],
    sections: [
      {
        heading: 'The architecture',
        paragraphs: [
          'Section TBD. Set up the three-layer model: (1) canonical GameState lives only on the server; (2) packages/game/src/variants.ts defines fogOfWarVariant.getPlayerView(state, player) which computes per-player visibility and masks the board; (3) apps/server/src/payloads.ts wraps getPlayerView into per-recipient snapshotPayload calls that are sent on the WebSocket.',
          '[VISUAL: three-layer diagram. Top: canonical GameState (full board, full history). Middle: getPlayerView per side, producing two distinct PlayerViews. Bottom: snapshotPayload per recipient, fanning out over WS to the two seated clients only.]',
        ],
      },
      {
        heading: 'The visibility kernel',
        paragraphs: [
          'Section TBD. Walk through packages/game/src/variants.ts fogVisibleSquares (lines 184-193) and boardVisibleTo (lines 201-208) — together they are the entire fog primitive. "The opponent\'s piece on e5 isn\'t hidden by CSS — it\'s not in this object."',
          '[VISUAL: annotated code snippet, side-by-side with a board diagram showing the visibility set as highlighted squares.]',
          '[VISUAL: lastMove handling — visibleLastMoveForPlayer (lines 210-216). Diagram showing that the opponent\'s last move arrow is omitted from the view, even when you can see the destination piece.]',
        ],
      },
      {
        heading: 'The outbound gateway',
        paragraphs: [
          'Section TBD. apps/server/src/payloads.ts snapshotPayload is called once per recipient in broadcastSnapshot. Three fields matter: state (per-seat PlayerView), events (move-played events filtered to own color in live fog games), and devViews (admin-gated truth view; never reachable from a query param in production).',
          '[VISUAL: a single broadcastSnapshot call expanded into two distinct WS frames, one per recipient, with the differing payloads side by side.]',
        ],
      },
      {
        heading: 'The one rule for live observation',
        paragraphs: [
          'Section TBD. server-policy.ts canObserveLiveRoom: returns true only when the game is finished. Live games are visible only to seated players, regardless of mode (PvP, PvE, EvE). Non-seated WebSocket connections to a live room are rejected with 1008 \'private room\'. This collapses what used to be a per-mode table (12 cells: mode × game-state × viewer) to a single rule. Tradeoff acknowledged: no live spectator view for engine games or for friends watching you play the bot. The simplification is worth it — every future variant or mode inherits the rule for free.',
          '[VISUAL: small table — old per-mode rules (4 rows: PvP/PvE/EvE × live/finished) vs new single rule. Visual collapse from 12 cells to 2.]',
        ],
      },
      {
        heading: 'Show me: a captured WebSocket frame',
        paragraphs: [
          'Section TBD. Pretty-printed JSON of a real snapshot frame from a live PvP game sent to white\'s socket: state.board has ~16 entries (not 32), state.visibleSquares is a sorted list of white\'s seen squares, events contains only white\'s move-played records.',
          '[VISUAL: JSON snippet of a captured snapshot frame (anonymized roomId, real data shape).]',
          '[VISUAL: side-by-side — canonical state (server-only, 32 pieces, full history) on the left; white\'s PlayerView (16-20 pieces, white\'s moves only) on the right. Same position, two boxes.]',
        ],
      },
      {
        heading: 'Show me: see the same position from three sides',
        blocks: [
          {
            kind: 'paragraph',
            text:
              '[INTERACTIVE PLACEHOLDER: stepper widget with a tab strip — Truth / White\'s view / Black\'s view — over a single mid-game position. Reuses the triptych pattern from the Fog of War rules article. Possibly: a "click any square to highlight what each side sees from that piece" interaction.]',
          },
        ],
      },
      {
        heading: 'Prove it: the regression tests',
        paragraphs: [
          'Section TBD. apps/server/src/privacy-ws.test.ts spawns a real built server, opens real WebSockets, and asserts on the wire bytes — not on mocked internals. The fog-specific assertions: PvE/EvE third-party WS connection is rejected with 1008 \'private room\' before any snapshot is sent; seated players in PvP can\'t see opponent move-played events; finished games reveal everything.',
          '[VISUAL: code excerpt from privacy-ws.test.ts showing the rejection assertion. Caption: "clone the repo and run npm test — these run in CI on every commit."]',
        ],
      },
      {
        heading: 'More than fog: the server is the source of truth',
        paragraphs: [
          'Section TBD. The same principle that makes fog enforcement work decides the rest of the game state. Threefold repetition is the most interesting case in fog: two players can see the same visible position twice while the underlying canonical position differs (a phantom piece moved off-screen). The server counts repetitions over the canonical board (variants.ts:295-309 positionRepetitionKey), not over either player\'s view. Counting from views would be both wrong and exploitable.',
          'Also enforced server-side: king capture as the win condition (variants.ts:267-269), the 50-move rule via halfmoveClock, clock expiration, resignation, draw-by-agreement, pause/resume across server restart. The client renders; the server decides.',
          '[VISUAL: code excerpt of positionRepetitionKey showing the full board enumeration. Caption noting why view-based repetition would be both incorrect and exploitable in a fog setting.]',
        ],
      },
      {
        heading: 'Honest limits',
        paragraphs: [
          'Section TBD. Three caveats to be explicit about: (1) finished games reveal full truth — same as Lichess\'s FoW model; replay/share need it. (2) Live spectator view in PvP is "nothing" by design — we don\'t render a fair-fog-union view for friends watching, because we couldn\'t do it without exposing one side\'s perspective. (3) The devViews admin path exists for debugging and is gated on a constant-time-compared admin token (server-policy.ts isDebugViewAuthorized + index.ts handleAdminDebugAuth). Query params alone cannot flip it in production.',
        ],
      },
      {
        heading: 'Where the code lives',
        paragraphs: [
          'Section TBD. Repo map: packages/game/src/variants.ts (the kernel), apps/server/src/payloads.ts (the gateway), apps/server/src/server-policy.ts (the one observation rule), apps/server/src/privacy-ws.test.ts (the regression tests). Link to the repo, encourage forks and issues.',
        ],
      },
      {
        heading: 'Contribute',
        paragraphs: [
          'CTA: GitHub repo, file an issue if you spot a leak, run the test suite locally, link to the related Fog of War rules article.',
        ],
      },
    ],
  },
];

export function findArticle(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}
