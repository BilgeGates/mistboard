// Scaffolding for the three canonical articles. Each section's body is a
// placeholder pending the full draft per docs-private/articles-plan.md.
// Visual specs live in [VISUAL: ...] notes that should be replaced with
// rendered assets when sections are written.

import {
  boardToPieces,
  type BoardSpec,
  type CompositionLayout,
  fogSquaresFromVisible,
  piecesToBoard,
  startingPositionFromBackRank,
} from '@mistboard/board-render';
import type { SteppedBoardsOptions } from '@mistboard/board-render/interactive';
import { fogOfWarVariant, type Board, type GameState, type PieceRole, type Square } from '@mistboard/game';

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

export type ArticleBlock = ParagraphBlock | SubHeadingBlock | StaticBoardsBlock | InteractiveBlock | CtaBlock;

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

const STANDARD_BACK_RANK: PieceRole[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

function withMove(board: Board, from: Square, to: Square): Board {
  const next: Board = { ...board };
  next[to] = next[from];
  delete next[from];
  return next;
}

const WORKED_EXAMPLE_START = piecesToBoard(startingPositionFromBackRank(STANDARD_BACK_RANK));
const WORKED_EXAMPLE_AFTER_E4 = withMove(WORKED_EXAMPLE_START, 'e2', 'e4');
const WORKED_EXAMPLE_AFTER_E4_E5 = withMove(WORKED_EXAMPLE_AFTER_E4, 'e7', 'e5');

// Starting-position triptych for the Fog of War rules article. Visibility is
// derived from the canonical fog-of-war variant kernel so the diagram exactly
// matches what players see in a live game.
const FOW_START_STATE = fogOfWarVariant.createInitialState('fow-rules-start');
const FOW_START_PIECES = boardToPieces(FOW_START_STATE.board);
const FOW_START_VIEW_W = fogOfWarVariant.getPlayerView(FOW_START_STATE, 'white');
const FOW_START_VIEW_B = fogOfWarVariant.getPlayerView(FOW_START_STATE, 'black');
const FOW_START_FOG_W = fogSquaresFromVisible(FOW_START_VIEW_W.visibleSquares);
const FOW_START_FOG_B = fogSquaresFromVisible(FOW_START_VIEW_B.visibleSquares);

// Helper: derive the visibility complement for a player on a state.
function fogFor(state: GameState, player: 'white' | 'black'): Square[] {
  return fogSquaresFromVisible(fogOfWarVariant.getPlayerView(state, player).visibleSquares);
}

// ── Castling example 1: out of check, into safety ─────────────────────────
// Black rook on e8 puts the white king in check along the open e-file.
// Standard chess forbids castling out of check; Fog of War allows it, and
// here the king lands on g1 with nothing attacking it.
const CASTLING1_BOARD: Board = {
  a1: { color: 'white', role: 'rook' },
  e1: { color: 'white', role: 'king' },
  h1: { color: 'white', role: 'rook' },
  a2: { color: 'white', role: 'pawn' },
  b2: { color: 'white', role: 'pawn' },
  c2: { color: 'white', role: 'pawn' },
  d2: { color: 'white', role: 'pawn' },
  f2: { color: 'white', role: 'pawn' },
  g2: { color: 'white', role: 'pawn' },
  h2: { color: 'white', role: 'pawn' },
  a7: { color: 'black', role: 'pawn' },
  b7: { color: 'black', role: 'pawn' },
  c7: { color: 'black', role: 'pawn' },
  d7: { color: 'black', role: 'pawn' },
  f7: { color: 'black', role: 'pawn' },
  g7: { color: 'black', role: 'pawn' },
  h7: { color: 'black', role: 'pawn' },
  e8: { color: 'black', role: 'rook' },
  g8: { color: 'black', role: 'king' },
};
const CASTLING1_BEFORE: GameState = {
  id: 'fow-rules-castling-1',
  variant: 'fog-of-war',
  board: CASTLING1_BOARD,
  status: { type: 'playing', turn: 'white' },
  moveNumber: 20,
  castlingRights: ['a1', 'h1'],
  halfmoveClock: 0,
};
const CASTLING1_AFTER = fogOfWarVariant.applyMove(CASTLING1_BEFORE, { from: 'e1', to: 'h1' });
const CASTLING1_BEFORE_FOG_W = fogFor(CASTLING1_BEFORE, 'white');
const CASTLING1_BEFORE_FOG_B = fogFor(CASTLING1_BEFORE, 'black');
const CASTLING1_AFTER_FOG_W = fogFor(CASTLING1_AFTER, 'white');
const CASTLING1_AFTER_FOG_B = fogFor(CASTLING1_AFTER, 'black');

// ── Castling example 2: out of check, into check, captured ───────────────
// Adds a black knight on h3 that attacks g1, and removes white's g-pawn
// so the knight isn't itself under threat (a g-pawn would attack h3 and
// give white visibility on the knight). White castles out of one threat
// directly into another; black's next move captures the king.
const CASTLING2_BOARD: Board = {
  ...CASTLING1_BOARD,
  h3: { color: 'black', role: 'knight' },
  g2: undefined,
};
delete CASTLING2_BOARD.g2;
const CASTLING2_BEFORE: GameState = {
  id: 'fow-rules-castling-2',
  variant: 'fog-of-war',
  board: CASTLING2_BOARD,
  status: { type: 'playing', turn: 'white' },
  moveNumber: 20,
  castlingRights: ['a1', 'h1'],
  halfmoveClock: 0,
};
const CASTLING2_AFTER = fogOfWarVariant.applyMove(CASTLING2_BEFORE, { from: 'e1', to: 'h1' });
const CASTLING2_FINAL = fogOfWarVariant.applyMove(CASTLING2_AFTER, { from: 'h3', to: 'g1' });
const CASTLING2_BEFORE_FOG_W = fogFor(CASTLING2_BEFORE, 'white');
const CASTLING2_BEFORE_FOG_B = fogFor(CASTLING2_BEFORE, 'black');
const CASTLING2_AFTER_FOG_W = fogFor(CASTLING2_AFTER, 'white');
const CASTLING2_AFTER_FOG_B = fogFor(CASTLING2_AFTER, 'black');
// Fog stays on after capture: both players still see only what they could
// during play. The truth panel carries the new (post-capture) board.
const CASTLING2_FINAL_FOG_W = CASTLING2_AFTER_FOG_W;
const CASTLING2_FINAL_FOG_B = CASTLING2_AFTER_FOG_B;

// ── Win-condition demo: walk into mate ───────────────────────────────────
// Sparse position after a queen trade. Black's rook has infiltrated the
// open e-file. White doesn't see the rook; the king on d1 looks safe.
// White plays Ke1 (natural centralization). The king lands on the open
// e-file. Black plays Rxe1 next turn.
const MATE_INITIAL_BOARD: Board = {
  a1: { color: 'white', role: 'rook' },
  d1: { color: 'white', role: 'king' },
  a2: { color: 'white', role: 'pawn' },
  b2: { color: 'white', role: 'pawn' },
  c2: { color: 'white', role: 'pawn' },
  d2: { color: 'white', role: 'pawn' },
  f2: { color: 'white', role: 'pawn' },
  g2: { color: 'white', role: 'pawn' },
  h2: { color: 'white', role: 'pawn' },
  a7: { color: 'black', role: 'pawn' },
  b7: { color: 'black', role: 'pawn' },
  c7: { color: 'black', role: 'pawn' },
  d7: { color: 'black', role: 'pawn' },
  f7: { color: 'black', role: 'pawn' },
  g7: { color: 'black', role: 'pawn' },
  h7: { color: 'black', role: 'pawn' },
  e8: { color: 'black', role: 'rook' },
  h8: { color: 'black', role: 'rook' },
  a8: { color: 'black', role: 'king' },
};
const MATE_BEFORE: GameState = {
  id: 'fow-rules-mate',
  variant: 'fog-of-war',
  board: MATE_INITIAL_BOARD,
  status: { type: 'playing', turn: 'white' },
  moveNumber: 25,
  castlingRights: [],
  halfmoveClock: 0,
};
const MATE_AFTER = fogOfWarVariant.applyMove(MATE_BEFORE, { from: 'd1', to: 'e1' });
const MATE_FINAL = fogOfWarVariant.applyMove(MATE_AFTER, { from: 'e8', to: 'e1' });
const MATE_BEFORE_FOG_W = fogFor(MATE_BEFORE, 'white');
const MATE_BEFORE_FOG_B = fogFor(MATE_BEFORE, 'black');
const MATE_AFTER_FOG_W = fogFor(MATE_AFTER, 'white');
const MATE_AFTER_FOG_B = fogFor(MATE_AFTER, 'black');
const MATE_FINAL_FOG_W = MATE_AFTER_FOG_W;
const MATE_FINAL_FOG_B = MATE_AFTER_FOG_B;

// ── Section 1 demo: knight visibility cone ────────────────────────────────
// A near-empty position so the knight's cone reads cleanly. White king on
// h1 contributes a small corner cone; black king on a8 is a sentinel,
// outside any white-piece reach.
const VISIBILITY_BOARD: Board = {
  h1: { color: 'white', role: 'king' },
  e4: { color: 'white', role: 'knight' },
  a8: { color: 'black', role: 'king' },
};
const VISIBILITY_STATE: GameState = {
  id: 'fow-rules-visibility',
  variant: 'fog-of-war',
  board: VISIBILITY_BOARD,
  status: { type: 'playing', turn: 'white' },
  moveNumber: 30,
  castlingRights: [],
  halfmoveClock: 0,
};
const VISIBILITY_FOG_W = fogFor(VISIBILITY_STATE, 'white');

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
const ENPASSANT_INITIAL_FOG_W = fogFor(ENPASSANT_INITIAL, 'white');
const ENPASSANT_INITIAL_FOG_B = fogFor(ENPASSANT_INITIAL, 'black');
const ENPASSANT_PUSH_FOG_W = fogFor(ENPASSANT_AFTER_PUSH, 'white');
const ENPASSANT_PUSH_FOG_B = fogFor(ENPASSANT_AFTER_PUSH, 'black');
const ENPASSANT_CAPTURE_FOG_W = fogFor(ENPASSANT_AFTER_CAPTURE, 'white');
const ENPASSANT_CAPTURE_FOG_B = fogFor(ENPASSANT_AFTER_CAPTURE, 'black');

// ── Promotion demo ────────────────────────────────────────────────────────
// White pawn on g7 promotes to queen on g8. The new queen reveals the
// entire rank 8 (including the previously-hidden black king on a8) and the
// long diagonal. Step 3 captures the king.
const PROMOTION_BEFORE_BOARD: Board = {
  g1: { color: 'white', role: 'king' },
  g7: { color: 'white', role: 'pawn' },
  a8: { color: 'black', role: 'king' },
};
const PROMOTION_BEFORE: GameState = {
  id: 'fow-rules-promotion',
  variant: 'fog-of-war',
  board: PROMOTION_BEFORE_BOARD,
  status: { type: 'playing', turn: 'white' },
  moveNumber: 30,
  castlingRights: [],
  halfmoveClock: 0,
};
const PROMOTION_AFTER = fogOfWarVariant.applyMove(PROMOTION_BEFORE, { from: 'g7', to: 'g8', promotion: 'queen' });
const PROMOTION_KING_MOVED = fogOfWarVariant.applyMove(PROMOTION_AFTER, { from: 'a8', to: 'b8' });
const PROMOTION_FINAL = fogOfWarVariant.applyMove(PROMOTION_KING_MOVED, { from: 'g8', to: 'b8' });
const PROMOTION_BEFORE_FOG_W = fogFor(PROMOTION_BEFORE, 'white');
const PROMOTION_BEFORE_FOG_B = fogFor(PROMOTION_BEFORE, 'black');
const PROMOTION_AFTER_FOG_W = fogFor(PROMOTION_AFTER, 'white');
const PROMOTION_AFTER_FOG_B = fogFor(PROMOTION_AFTER, 'black');
const PROMOTION_KING_MOVED_FOG_W = fogFor(PROMOTION_KING_MOVED, 'white');
const PROMOTION_KING_MOVED_FOG_B = fogFor(PROMOTION_KING_MOVED, 'black');
const PROMOTION_FINAL_FOG_W = PROMOTION_KING_MOVED_FOG_W;
const PROMOTION_FINAL_FOG_B = PROMOTION_KING_MOVED_FOG_B;

export const articles: Article[] = [
  {
    slug: 'draft960',
    title: 'Draft960: the end of opening theory in Fog of War',
    summary:
      'Fog of War already weakens memorized opening prep. Draft960 finishes the job — each player picks one of three offered Chess960 setups, hidden from the opponent. Choice within randomness, double-blind from move 1.',
    status: 'outline',
    audience:
      'Readers who have grokked Fog of War (start with the rules article if not). Curious chess players following the Mistboard OG card to learn what makes Draft960 unique.',
    tldr: [
      'Fog of War already devalues deep opening prep — you can\'t follow a memorized line when you can\'t see the opponent\'s pieces.',
      'But shared standard starting positions still allow shape and structure memorization. Draft960 attacks that residual weakness.',
      'Each player picks one of 3 random Chess960 setups, hidden from the opponent until both decide. Choice within randomness — the specific design innovation.',
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
              { pieces: startingPositionFromBackRank(DRAFT960_OFFER_A), label: 'A' },
              { pieces: startingPositionFromBackRank(DRAFT960_OFFER_B), label: 'B' },
              { pieces: startingPositionFromBackRank(DRAFT960_OFFER_C), label: 'C' },
            ],
            caption: "Pick one. Don't show your opponent.",
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              'Section TBD. Lead with the mechanic itself, not its history. Show what the player actually sees: three random valid Chess960 setups, choose one. Their pick stays hidden until the opponent has also chosen.',
          },
        ],
      },
      {
        heading: 'Fog of War already weakens openings',
        paragraphs: [
          '[VISUAL: prep-value-vs-move-number curves for standard chess and Fog of War, showing how memorized opening lines decay faster in FoW after the early moves once opponent pieces become invisible.]',
          'Section TBD. Cover: in standard chess, "Sicilian Najdorf line 12 moves deep" is a real prep advantage. In FoW, after move 3 you can\'t see opponent pieces — the deep-line edge collapses. The chess content economy is built on opening theory; that whole industry is partially defused by FoW.',
          'Cross-reference the FoW rules article for readers who need a refresher on visibility mechanics.',
        ],
      },
      {
        heading: 'What\'s left to memorize',
        paragraphs: [
          '[VISUAL: two boards, both standard starting position, showing what shape-memorization still buys you in FoW — typical pawn structures, piece deployments that work regardless of opponent\'s response.]',
          'Section TBD. Cover: even in FoW, both players start from the standard chess position. Shape and structure prep still has value — typical e4 e5 development, common pawn formations, classical piece coordination. The residual prep advantage lives in the shared starting position, not in deep lines.',
        ],
      },
      {
        heading: 'The design space',
        paragraphs: [
          '[VISUAL: two-axis diagram — agency (choice over starting position) on one axis, prep-resistance (how hard it is to memorize) on the other. Plot standard chess, Chess960, and Draft960. Each variant attacks the prep problem differently.]',
          'Section TBD. Cover: two natural moves to attack the remaining prep advantage. (1) Pure randomization — Chess960 hands each game a different starting position. Effective at killing memorization but removes agency entirely. (2) Choice within randomness — Draft960 offers a small random set and lets each player pick. Preserves agency while removing the shared starting position.',
        ],
      },
      {
        heading: 'Why three offers',
        paragraphs: [
          '[VISUAL: three columns — "1 offer (pure C960)", "3 offers (Draft960)", "960 offers (free pick)" — each with notes on what it costs.]',
          'Section TBD. The central design decision and the section a curious reader will pause on.',
          'One offer (pure Chess960): no agency. Some players have setups they understand better than others — denying that choice removes a layer of skill.',
          'All 960 offers (free pick): full agency, but players gravitate to their one favorite setup, which then becomes memorizable. Theory grows back.',
          'Three offers: enough constraint that you can\'t always pick your favorite, enough choice that picks reflect style. Three also makes the pick a real decision (not a glance) without making it a slog.',
        ],
      },
      {
        heading: 'Why hide the picks',
        paragraphs: [
          '[VISUAL: two-phase reveal — pick screen (hidden) → reveal-to-self → reveal-to-opponent-through-visibility-leakage as the game starts.]',
          'Section TBD. Cover: hidden picks compose with FoW\'s hidden-information theme. Both players reason about a setup they can\'t see — "what did they probably pick, given their playing style?" The reveal happens not as an announcement but gradually, as the first moves leak back-rank silhouettes through visibility.',
          'This means Draft960 doesn\'t just *add* hidden information to FoW — it extends the hidden window backwards into the pre-game.',
        ],
      },
      {
        heading: 'The taxonomy of picks',
        paragraphs: [
          '[INTERACTIVE CENTERPIECE: pick taxonomy gallery — 8-12 Chess960 setups grouped by archetype. Click or hover each for character description, strategic notes, sample games where it worked or failed.]',
          'Section TBD. Archetypes: standard-leaning (close to KRQK), bishop-pair aggressive (bishops central, diagonals open), knight-driven (knights ready to jump early), heavy-piece flank (queen or rook on the edge), bizarre (king on a-file, etc.).',
          'This is the section players will reference repeatedly. Aim for permanence: a complete strategic taxonomy of Draft960 picks.',
        ],
      },
      {
        heading: 'The composition with Fog of War',
        paragraphs: [
          '[VISUAL: first 4 moves of a Draft960+FoW game. Two boards per ply (W view, B view), showing how each move leaks one or two pieces of back-rank information through visibility.]',
          'Section TBD. Cover: how the asymmetric hidden starting positions interact with FoW visibility. Each early move reveals back-rank silhouettes one piece at a time. You learn the opponent\'s setup gradually, the way you learn about hidden mid-game pieces — but now it\'s structural information, not just tactical.',
          'Draft960 + FoW composes hidden information across two axes simultaneously: position (what they picked) and visibility (where their pieces have moved). Neither variant alone produces this compound.',
        ],
      },
      {
        heading: 'Worked example',
        blocks: [
          {
            kind: 'interactive',
            widget: 'stepper',
            spec: {
              layout: 'single',
              positions: [
                {
                  boards: [{ board: WORKED_EXAMPLE_START }],
                  narrative:
                    'Stepper dogfood — single-board layout, three placeholder positions. Real Worked-example content needs a dramatic Draft960+FoW game with triptych W view / truth / B view.',
                },
                {
                  boards: [{ board: WORKED_EXAMPLE_AFTER_E4 }],
                  narrative: '1.e4 — White pushes the king pawn.',
                },
                {
                  boards: [{ board: WORKED_EXAMPLE_AFTER_E4_E5 }],
                  narrative: '1...e5 — Black mirrors. Symmetric king-pawn opening.',
                },
              ],
            },
            caption: 'Stepper dogfood — placeholder until a real game is selected.',
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              'Section TBD. Pull a dramatic Draft960+FoW game from Mistboard. Annotate the moments where each player learned something about the other\'s pick, and where that knowledge changed their plan.',
          },
        ],
      },
      {
        heading: 'Try it',
        paragraphs: [
          '[VISUAL: setup-dialog screenshot showing the Draft960 picker.]',
          'CTA: during beta, Draft960 is available via friend-invite. Create a private room with the Draft960 variant, share the link, play.',
        ],
      },
    ],
  },
  {
    slug: 'fog-of-war-rules',
    title: 'Fog of War chess: the canonical reference',
    summary:
      'Regular chess with one rule change — you only see what your pieces can legally see — and one consequence change — captured kings end the game, not checkmate. This is the complete primer.',
    status: 'draft',
    audience:
      'Any chess player who has heard of Fog of War or wants to understand it from scratch.',
    tldr: [
      'You see your own pieces and every square those pieces could legally move to. That’s it.',
      'Kings are captured, not checkmated. You can walk into mate without knowing it.',
      'Visibility shifts every move. Scouting and deception are first-class strategic ideas.',
    ],
    sections: [
      {
        heading: 'The one rule',
        blocks: [
          {
            kind: 'paragraph',
            text: "Fog of War is regular chess with one change: you only see squares your pieces can see.",
          },
          {
            kind: 'paragraph',
            text:
              "What does a piece \"see\"? The squares it could legally move to. A knight on b1 sees a3 and c3. A bishop on c1 sees nothing because its diagonals are blocked. A queen behind the pawn line sees nothing past rank 2.",
          },
          {
            kind: 'paragraph',
            text:
              "You also see the squares your own pieces are on, always. A pinned piece can't move but you still know it's there.",
          },
          {
            kind: 'paragraph',
            text: "That's the rule. Visibility is your pieces' squares plus their legal destinations.",
          },
          {
            kind: 'static-boards',
            layout: 'pair',
            canvasWidth: 560,
            canvasHeight: 270,
            boardSize: 220,
            boardY: 36,
            gap: 60,
            labelY: 24,
            labelFill: '#4b5563',
            boards: [
              {
                pieces: boardToPieces(VISIBILITY_STATE.board),
                fogSquares: VISIBILITY_FOG_W,
                orientation: 'white',
                label: "WHITE'S VIEW",
              },
              {
                pieces: boardToPieces(VISIBILITY_STATE.board),
                orientation: 'white',
                label: 'TRUTH',
              },
            ],
            caption: "Knight on e4, king on h1. White sees every square it could legally move to, and nothing else. The black king in the corner stays hidden.",
          } as ArticleBlock,
        ],
      },
      {
        heading: 'The starting position',
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
              {
                pieces: FOW_START_PIECES,
                fogSquares: FOW_START_FOG_W,
                orientation: 'white',
                label: "WHITE'S VIEW",
              },
              {
                pieces: FOW_START_PIECES,
                orientation: 'white',
                label: 'TRUTH',
              },
              {
                pieces: FOW_START_PIECES,
                fogSquares: FOW_START_FOG_B,
                orientation: 'white',
                label: "BLACK'S VIEW",
              },
            ],
            caption: 'The board already looks different to each side, before either player has moved.',
          } as ArticleBlock,
        ],
      },
      {
        heading: 'The win condition: king capture, not checkmate',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Standard chess ends in checkmate: the side to move has no legal way to remove their king from attack, and the game ends before any king is captured. Fog of War can't announce mate — the check rule assumes both sides see all the threats — so the game ends one step later, when a king is actually captured.",
          },
          {
            kind: 'paragraph',
            text:
              "In practice: you can walk into mate without knowing it.",
          },
          {
            kind: 'interactive',
            widget: 'stepper',
            spec: {
              layout: 'triptych',
              positions: [
                {
                  narrative: "Sparse middlegame after a queen trade. Black's rook has slid down the open e-file to e8. White doesn't see it.",
                  boards: [
                    { board: MATE_BEFORE.board, fogSquares: MATE_BEFORE_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    { board: MATE_BEFORE.board, orientation: 'white', label: 'TRUTH' },
                    { board: MATE_BEFORE.board, fogSquares: MATE_BEFORE_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
                {
                  narrative: "1.Ke1. White centralizes the king. The move looks normal — but it lands the king on the e-file the rook is staring down.",
                  boards: [
                    { board: MATE_AFTER.board, fogSquares: MATE_AFTER_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    { board: MATE_AFTER.board, orientation: 'white', label: 'TRUTH' },
                    { board: MATE_AFTER.board, fogSquares: MATE_AFTER_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
                {
                  narrative: "1...Rxe1. The rook captures the king. White never saw the threat, and there was no announced check to warn them.",
                  outcome: { headline: 'Black wins', reason: 'king captured', tone: 'loss' },
                  boards: [
                    { board: MATE_FINAL.board, fogSquares: MATE_FINAL_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    { board: MATE_FINAL.board, orientation: 'white', label: 'TRUTH' },
                    { board: MATE_FINAL.board, fogSquares: MATE_FINAL_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
              ],
            },
            caption: 'Walked into mate without seeing the threat.',
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              "Capture-the-king isn't a Fog of War invention. Pre-1500s European chess and shatranj both ended in king capture; the checkmate rule was a later refinement that assumed shared information.",
          },
        ],
      },
      {
        heading: 'A worked game',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "The best way to grok the rules is to watch a real game. The stepper below walks through six key moments from a Mistboard game, showing each side's view alongside the truth. Watch what each side knows, watch what they don't, and watch how the gap between the two views drives the game.",
          },
          {
            kind: 'paragraph',
            text:
              "[INTERACTIVE CENTERPIECE: worked-game stepper — six key moments from a real Mistboard game, each shown as a triptych of White's view, the truth, and Black's view, with 1-2 sentences of narrative. Stepper widget exists; fog support and a real game are still pending.]",
          },
          {
            kind: 'paragraph',
            text:
              "Until the real game is wired in, the Draft960 article hosts a single-board stepper dogfood so the widget itself is visible.",
          },
        ],
      },
      {
        heading: 'Where it sits in the hidden-info chess family',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Fog of War isn't the first hidden-information chess variant. The family includes [Kriegspiel](https://en.wikipedia.org/wiki/Kriegspiel_(chess)) (umpire-mediated, 1700s), [Dark Chess / Banqi](https://en.wikipedia.org/wiki/Banqi) (face-down pieces, Asian origin), and [Reconnaissance Blind Chess](https://rbc.jhuapl.edu/) (Carnegie Mellon, 2017, with an explicit 3x3 scan action). Fog of War is the implicit version: no umpire, no scan action, visibility comes from where your pieces can move.",
          },
        ],
      },
      {
        heading: 'Rules in edge cases',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Fog of War inherits standard chess rules and applies them under partial information. Most cases are intuitive; a few have edges worth being precise about.",
          },
          { kind: 'sub-heading', text: 'Castling' },
          {
            kind: 'paragraph',
            text:
              "Fog of War drops every standard-chess castling restriction tied to check. The king can castle out of check, through an attacked square, and into check. None of those are filtered, because there is no check rule to enforce.",
          },
          {
            kind: 'paragraph',
            text:
              "Example 1. Black's rook on e8 puts the white king in check. White plays O-O anyway; the king lands on g1 with nothing attacking it. The castle escapes a threat white never saw.",
          },
          {
            kind: 'interactive',
            widget: 'stepper',
            spec: {
              layout: 'triptych',
              positions: [
                {
                  narrative: "Black's rook on e8 attacks the white king on e1 along the open e-file. White doesn't see the rook.",
                  boards: [
                    { board: CASTLING1_BEFORE.board, fogSquares: CASTLING1_BEFORE_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    { board: CASTLING1_BEFORE.board, orientation: 'white', label: 'TRUTH' },
                    { board: CASTLING1_BEFORE.board, fogSquares: CASTLING1_BEFORE_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
                {
                  narrative: "1.O-O. The king is on g1, the rook on f1. Nothing attacks g1. The castle was legal and lucky.",
                  boards: [
                    { board: CASTLING1_AFTER.board, fogSquares: CASTLING1_AFTER_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    { board: CASTLING1_AFTER.board, orientation: 'white', label: 'TRUTH' },
                    { board: CASTLING1_AFTER.board, fogSquares: CASTLING1_AFTER_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
              ],
            },
            caption: 'Example 1: castling out of check, into safety.',
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              "Example 2. Same setup, with one addition: a black knight on h3 attacks g1. White castles into the knight's reach and gets captured the next move. Legal does not mean wise.",
          },
          {
            kind: 'interactive',
            widget: 'stepper',
            spec: {
              layout: 'triptych',
              positions: [
                {
                  narrative: "Two hidden threats. The rook attacks the king on e1 (out of check) and the knight on h3 attacks g1 (into check). White sees neither.",
                  boards: [
                    { board: CASTLING2_BEFORE.board, fogSquares: CASTLING2_BEFORE_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    { board: CASTLING2_BEFORE.board, orientation: 'white', label: 'TRUTH' },
                    { board: CASTLING2_BEFORE.board, fogSquares: CASTLING2_BEFORE_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
                {
                  narrative: "1.O-O. Standard chess would have forbidden this move three times over: out of check, through attacked squares, into check. Fog of War allows it.",
                  boards: [
                    { board: CASTLING2_AFTER.board, fogSquares: CASTLING2_AFTER_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    { board: CASTLING2_AFTER.board, orientation: 'white', label: 'TRUTH' },
                    { board: CASTLING2_AFTER.board, fogSquares: CASTLING2_AFTER_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
                {
                  narrative: "1...Nxg1. The knight captures the king. White still can't see what just happened — only the result.",
                  outcome: { headline: 'Black wins', reason: 'king captured', tone: 'win' },
                  boards: [
                    { board: CASTLING2_FINAL.board, fogSquares: CASTLING2_FINAL_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    { board: CASTLING2_FINAL.board, orientation: 'white', label: 'TRUTH' },
                    { board: CASTLING2_FINAL.board, fogSquares: CASTLING2_FINAL_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
              ],
            },
            caption: 'Example 2: castling out of check, into check, into a loss.',
          } as ArticleBlock,
          { kind: 'sub-heading', text: 'En passant visibility' },
          {
            kind: 'paragraph',
            text:
              "En passant adds two squares to the capturing pawn's visibility: the diagonal target square (where your pawn lands) and the square behind it (where the captured pawn sits). The second is the unusual one — your pawn could never legally move there, but you see it because en passant captures it.",
          },
          {
            kind: 'interactive',
            widget: 'stepper',
            spec: {
              layout: 'triptych',
              positions: [
                {
                  narrative: "White pawn on a5, black pawn on b7. Black to move. Neither side sees the other's pawn yet.",
                  boards: [
                    { board: ENPASSANT_INITIAL.board, fogSquares: ENPASSANT_INITIAL_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    { board: ENPASSANT_INITIAL.board, orientation: 'white', label: 'TRUTH' },
                    { board: ENPASSANT_INITIAL.board, fogSquares: ENPASSANT_INITIAL_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
                {
                  narrative: "1...b5. Black plays a two-square pawn push next to white's pawn. White can now capture en passant — and gains visibility on b6 (the target) and b5 (the black pawn itself).",
                  boards: [
                    { board: ENPASSANT_AFTER_PUSH.board, fogSquares: ENPASSANT_PUSH_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    { board: ENPASSANT_AFTER_PUSH.board, orientation: 'white', label: 'TRUTH' },
                    { board: ENPASSANT_AFTER_PUSH.board, fogSquares: ENPASSANT_PUSH_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
                {
                  narrative: "2.axb6. White's pawn slides diagonally to b6 and the black pawn at b5 is removed. Standard en passant mechanics, with the Fog of War twist that the captured pawn was only visible because the capture was legal.",
                  boards: [
                    { board: ENPASSANT_AFTER_CAPTURE.board, fogSquares: ENPASSANT_CAPTURE_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    { board: ENPASSANT_AFTER_CAPTURE.board, orientation: 'white', label: 'TRUTH' },
                    { board: ENPASSANT_AFTER_CAPTURE.board, fogSquares: ENPASSANT_CAPTURE_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
              ],
            },
            caption: "En passant: the captured pawn is visible because the capture is legal, not because anyone could move to its square.",
          } as ArticleBlock,
          { kind: 'sub-heading', text: 'Promotion visibility' },
          {
            kind: 'paragraph',
            text:
              "A pawn that promotes occupies its promotion square. The promoted piece is part of your roster immediately and contributes its full visibility cone on the next turn — sometimes revealing a winning capture that wasn't visible before.",
          },
          {
            kind: 'interactive',
            widget: 'stepper',
            spec: {
              layout: 'triptych',
              positions: [
                {
                  narrative: "White pawn on g7, one move from promotion. White sees only the pawn's push square and the king's corner. The black king on a8 is in fog.",
                  boards: [
                    { board: PROMOTION_BEFORE.board, fogSquares: PROMOTION_BEFORE_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    { board: PROMOTION_BEFORE.board, orientation: 'white', label: 'TRUTH' },
                    { board: PROMOTION_BEFORE.board, fogSquares: PROMOTION_BEFORE_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
                {
                  narrative: "1.g8=Q. The new queen sees the entire rank 8, including the black king on a8. Promotion didn't just gain a piece; it gained the line.",
                  boards: [
                    { board: PROMOTION_AFTER.board, fogSquares: PROMOTION_AFTER_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    { board: PROMOTION_AFTER.board, orientation: 'white', label: 'TRUTH' },
                    { board: PROMOTION_AFTER.board, fogSquares: PROMOTION_AFTER_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
                {
                  narrative: "1...Kb8. Black moves the king to b8 — still on rank 8, still in the queen's reach.",
                  boards: [
                    { board: PROMOTION_KING_MOVED.board, fogSquares: PROMOTION_KING_MOVED_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    { board: PROMOTION_KING_MOVED.board, orientation: 'white', label: 'TRUTH' },
                    { board: PROMOTION_KING_MOVED.board, fogSquares: PROMOTION_KING_MOVED_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
                {
                  narrative: "2.Qxb8. The promoted queen captures the king.",
                  outcome: { headline: 'White wins', reason: 'king captured', tone: 'win' },
                  boards: [
                    { board: PROMOTION_FINAL.board, fogSquares: PROMOTION_FINAL_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                    { board: PROMOTION_FINAL.board, orientation: 'white', label: 'TRUTH' },
                    { board: PROMOTION_FINAL.board, fogSquares: PROMOTION_FINAL_FOG_B, orientation: 'white', label: "BLACK'S VIEW" },
                  ],
                },
              ],
            },
            caption: 'Promotion expands visibility: a queen on g8 sees what no pawn or king could.',
          } as ArticleBlock,
          { kind: 'sub-heading', text: 'Draws' },
          {
            kind: 'paragraph',
            text:
              "Mistboard auto-draws on two conditions: threefold repetition (the same position recurring three times with the same player to move and same castling and en-passant rights) and the 50-move rule (50 full moves without a pawn move or capture). Both are computed against the true position, not either player's view.",
          },
          {
            kind: 'paragraph',
            text:
              "Stalemate and insufficient-material draws are not separately detected. Mistboard lets games play out; the two mechanisms above eventually resolve them, or a player resigns.",
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
              "The full source is GPL-3.0. The visibility logic that powers every position in this article is the same code path Mistboard's servers run in production.",
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
          'Section TBD. Cover: implementation (particle filter, Tier-1 strategy), current strength positioning, specific failure modes encountered (filter extinction, etc.), open source under GPL-3.',
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
];

export function findArticle(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}
