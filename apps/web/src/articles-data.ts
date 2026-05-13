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
import { fogOfWarVariant, type Board, type PieceRole, type Square } from '@mistboard/game';

export type ParagraphBlock = { kind: 'paragraph'; text: string };

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

export type ArticleBlock = ParagraphBlock | StaticBoardsBlock | InteractiveBlock;

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
    status: 'outline',
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
        paragraphs: [
          '[INTERACTIVE CENTERPIECE: piece visibility-cone explorer. Click each piece type → see its visible squares from a sample square. 6 piece types, 6 panels.]',
          'Section TBD. Cover: the formal statement, the plain-English version, why "legal moves" and not "line of sight" (defended squares, blocking, en-passant nuances).',
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
                orientation: 'black',
                label: "BLACK'S VIEW",
              },
            ],
            caption: 'The board already looks different to each side, before either player has moved.',
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              "Section TBD. Cover: the board already looks different to each side, the first move makes nothing visible to opponent unless their pieces could attack the from-square or to-square.",
          },
        ],
      },
      {
        heading: 'The win condition: king capture, not checkmate',
        paragraphs: [
          '[VISUAL: side-by-side — would-be-checkmate position vs actual capture position, annotated.]',
          'Section TBD. Cover: standard rule (checkmate) vs Fog rule (capture).',
          'Sub-section: "You can walk into mate and not know." Real position visual.',
          'Sub-section: "You can miss a king you could have taken." Real visual.',
          'Sub-section: "What ‘check’ means here" — there is no announced check.',
          'Sidebar: capture-the-king variants in chess history.',
        ],
      },
      {
        heading: 'A worked game',
        paragraphs: [
          '[INTERACTIVE CENTERPIECE: worked-game stepper. 6 key moments from a real Mistboard game. Each moment: triptych of W view / truth / B view, plus 1-2 sentences narrative.]',
          'Section TBD. This is the centerpiece — the thing readers will screenshot. Pull a dramatic finished game from Mistboard. Annotate the turning points.',
        ],
      },
      {
        heading: 'Where it sits in the hidden-info chess family',
        paragraphs: [
          '[VISUAL: family-tree diagram — Kriegspiel (1700s), Reconnaissance Blind Chess, Dark Chess / Banqi (Asian variants), Fog of War. Capability/complexity axes positioning each.]',
          'Section TBD. Cover: Kriegspiel (umpire-mediated, audio cues), RBC (explicit scan action each move), Dark Chess (different rule surface), Fog of War (implicit visibility through piece movement). Why Fog of War is the cleanest extension.',
        ],
      },
      {
        heading: 'Strategy fundamentals',
        paragraphs: [
          '[Six sub-sections, each with a visual. Listed below as one paragraph per sub-section for the outline.]',
          '[VISUAL: scouting comparison — before/after a scouting pawn push.] Scouting and information gain. Some moves are worth making just for the information they buy.',
          '[VISUAL: a tucked rook on a supported square, invisible to opponent.] Hiding pieces behind your own pieces.',
          '[VISUAL: two candidate moves — one keeps pieces hidden, one gains info.] The tempo-information trade.',
          '[VISUAL: sparse endgame where information leaks easily, two boards.] The endgame asymmetry.',
          '[VISUAL: 3-4 actual blunder positions with captions.] Common blunders.',
        ],
      },
      {
        heading: 'Rules in edge cases',
        paragraphs: [
          '[Mini-diagram for each edge case below.]',
          'Castling visibility. En passant visibility. Promotion visibility. Threefold repetition (does it apply here?). Stalemate. Draws by insufficient material in fog.',
        ],
      },
      {
        heading: 'Try it',
        paragraphs: [
          '[VISUAL: play-button screenshot from the homepage.]',
          'CTA: click Find Opponent for the casual queue, or start a friend-invite.',
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
