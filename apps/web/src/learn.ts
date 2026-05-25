import { boardFen, hiddenSquareClasses, mountBoard } from '@mistboard/board-render/interactive';
import {
  type Board,
  darkChessVariant,
  type GameState,
  type Move,
  type PlayerView,
  type Square,
} from '@mistboard/game';
import type { Api } from 'chessground/api';
import type * as cg from 'chessground/types';
import { primaryNavItems, utilityNavItems } from './nav-items.js';

const GITHUB_URL = 'https://github.com/brianhliou/mistboard';
const boardFiles = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

type Uci = `${Square}${Square}`;

type TutorialStep = {
  teach: string;
  challenge: string;
  targets: Square[];
  afterTargets: Square[];
  accepted: Uci[];
  softFailures: Partial<Record<Uci, string>>;
  success: string;
  opponentReply?: Uci;
};

type DemoMove = {
  by: 'white' | 'black';
  uci: Uci;
  say: string;
};

// Node kinds for the research-derived lessons (Endgames). 'legacy' chapters keep
// the original step-based tutorial behavior and leave `mode` unset.
type ChapterMode = 'practice' | 'play' | 'demo' | 'teach';

type TutorialChapter = {
  id: string;
  title: string;
  lesson: string;
  goal: string;
  board: Board;
  castlingRights?: Square[];
  enPassantSquare?: Square;
  halfmoveClock?: number;
  moveNumber?: number;
  steps: TutorialStep[];
  reveal?: {
    scout: Square;
    revealed: Square;
    text: string;
  };
  revealTruthOnSuccess?: boolean;
  interaction?: 'reveal';

  // --- Endgames node model (only set on non-legacy chapters) ---
  mode?: ChapterMode;
  // practice: free White moves with no Black reply. play: vs a heuristic defender.
  playMoveCap?: number;
  playCoachCap?: string;
  // demo: a scripted line walked on the truth board with narration.
  demoIntro?: string;
  demoMoves?: DemoMove[];
  demoConclusion?: string;
  // teach: static position + copy.
  teachText?: string;
  // overlays (shown on the final demo beat / teach node)
  safePair?: Square[];
  unsafeSquares?: Square[];
  // teach/demo chapters normally show the truth board. Some scaffold chapters
  // intentionally keep fog on to preview the eventual interaction.
  fogPreview?: boolean;
  // CTA label for advancing past this chapter.
  nextLabel?: string;
};

type ChapterStatus = 'ready' | 'success' | 'soft-failure';

type LearnModuleStatus = 'available' | 'wip' | 'planned';

type LearnModuleGroup = 'WIP' | 'Exploratory';

type LearnModule = {
  id: string;
  group: LearnModuleGroup;
  status: LearnModuleStatus;
  title: string;
  summary: string;
  chapterIds?: string[];
  outlineChapters?: string[];
  cta: string;
  source: string;
};

const learnModules: LearnModule[] = [
  {
    id: 'queen-vs-king',
    group: 'WIP',
    status: 'wip',
    title: 'K+Q vs K',
    summary:
      'Starting outline for turning the drawn lone-king chase into a forced queen hunt under fog.',
    chapterIds: [
      'kqk-free-queen-vision',
      'kqk-random-king',
      'kqk-punish-scouting',
      'kqk-perfect-defender',
      'kqk-superposition-corner',
    ],
    cta: 'Open queen endgame',
    source: 'Endgame continuation from K vs K scaffold',
  },
  {
    id: 'rook-vs-king',
    group: 'WIP',
    status: 'wip',
    title: 'K+R vs K',
    summary:
      'Starting outline for the harder rook hunt: build rook walls, protect the rook, and drive belief states to the edge.',
    chapterIds: [
      'krk-free-rook-vision',
      'krk-random-king',
      'krk-punish-rook',
      'krk-perfect-defender',
      'krk-superposition-edge',
    ],
    cta: 'Open rook endgame',
    source: 'Endgame continuation from K vs K scaffold',
  },
  {
    id: 'basics',
    group: 'Exploratory',
    status: 'available',
    title: 'Dark Chess Basics',
    summary:
      'Learn how vision moves, why king capture replaces checkmate, and how a move can happen entirely in your fog.',
    chapterIds: ['tutorial-vision', 'tutorial-king-capture', 'tutorial-hidden-move'],
    cta: 'Start basics',
    source: 'Current interactive tutorial',
  },
  {
    id: 'endgames',
    group: 'WIP',
    status: 'wip',
    title: 'The Two Kings Standoff',
    summary:
      'Try to catch a lone hidden king, then walk through why two kings draw in the open and only corners change the story.',
    chapterIds: [
      'kvk-chase',
      'kvk-attack-a',
      'kvk-attack-b',
      'kvk-draw',
      'kvk-corner',
      'kvk-close',
    ],
    cta: 'Open endgame',
    source: 'Research endgame scaffold',
  },
  {
    id: 'fog-pieces',
    group: 'Exploratory',
    status: 'planned',
    title: 'Fog Pieces',
    summary:
      'Practice each piece as a vision shape before danger, tactics, or hidden enemy moves enter the course.',
    outlineChapters: [
      'Rook lantern',
      'Bishop beam',
      'Queen floodlight',
      'King bubble',
      'Knight jump',
      'Pawn eyes',
      'First reveal',
    ],
    cta: 'Open preview',
    source: 'Beginner tutorial curriculum',
  },
  {
    id: 'unknown-is-not-empty',
    group: 'Exploratory',
    status: 'planned',
    title: 'Unknown Is Not Empty',
    summary:
      'Correct the beginner mistake of treating fogged squares as safe by revealing traps, safe squares, and truth replay.',
    outlineChapters: [
      'Friendly vision recap',
      'First enemy reveal',
      'The tempting empty square',
      'Safe square, unsafe square',
      'Unknown capture',
      'Truth reveal',
    ],
    cta: 'Open preview',
    source: 'Beginner tutorial curriculum',
  },
  {
    id: 'no-check-capture-king',
    group: 'Exploratory',
    status: 'planned',
    title: 'No Check, Capture The King',
    summary:
      'Replace normal checkmate intuition with Fog rules: there may be no warning, and king capture ends the game.',
    outlineChapters: [
      'Check is not the signal',
      'Find the king',
      'Capture to win',
      'Your king can be captured too',
      'Race condition',
    ],
    cta: 'Open preview',
    source: 'Beginner tutorial curriculum',
  },
  {
    id: 'scout-before-you-grab',
    group: 'Exploratory',
    status: 'planned',
    title: 'Scout Before You Grab',
    summary:
      'Teach the Fog habit of valuing information, king safety, and relevant vision before obvious material.',
    outlineChapters: [
      'Two good-looking moves',
      'The bait piece',
      'Vision before value',
      'Safe capture test',
      'Review label',
    ],
    cta: 'Open preview',
    source: 'Beginner tutorial curriculum',
  },
  {
    id: 'last-seen-is-a-clue',
    group: 'Exploratory',
    status: 'planned',
    title: 'Last Seen Is A Clue',
    summary:
      'Introduce memory markers as stale clues, not facts, so players can reason after pieces disappear into fog.',
    outlineChapters: [
      'See it, lose it',
      'Faded marker',
      'Could it still be there?',
      'Cover likely squares',
      'Bad memory trap',
    ],
    cta: 'Open preview',
    source: 'Beginner tutorial curriculum',
  },
  {
    id: 'opponent-moved-but-where',
    group: 'Exploratory',
    status: 'planned',
    title: 'Opponent Moved, But Where?',
    summary:
      'Make hidden opponent moves legible: a move can happen, consume a turn, and still change nothing visible.',
    outlineChapters: [
      'Hidden move placeholder',
      'What changed?',
      'Legal movement narrows it',
      'No visible change matters too',
      'Respond under uncertainty',
    ],
    cta: 'Open preview',
    source: 'Beginner tutorial curriculum',
  },
  {
    id: 'hide-your-king',
    group: 'Exploratory',
    status: 'planned',
    title: 'Hide Your King',
    summary:
      'Show that your own visibility is a resource: scout without opening lines, relocate, and deny useful vision.',
    outlineChapters: [
      'What can they see?',
      'Do not reveal the king',
      'Screening piece',
      'King relocation',
      'Tradeoff',
    ],
    cta: 'Open preview',
    source: 'Beginner tutorial curriculum',
  },
  {
    id: 'why-did-that-piece-appear',
    group: 'Exploratory',
    status: 'planned',
    title: 'Why Did That Piece Appear?',
    summary:
      'Teach reveal attribution: which friendly piece, blocker change, or opponent move caused new information.',
    outlineChapters: [
      'Reveal by movement',
      'Identify the scout',
      'Reveal by blocker removal',
      'Reveal by enemy movement',
      'Reveal log',
    ],
    cta: 'Open preview',
    source: 'Beginner tutorial curriculum',
  },
  {
    id: 'pawn-vision-is-strange',
    group: 'Exploratory',
    status: 'planned',
    title: 'Pawn Vision Is Strange',
    summary:
      'Handle the Fog-specific pawn confusion: forward moves, diagonal captures, empty diagonals, en passant, and promotion.',
    outlineChapters: [
      'Forward move, diagonal sight',
      'Empty diagonal stays hidden',
      'Double move changes vision',
      'En passant edge case',
      'Promotion reveal',
    ],
    cta: 'Open preview',
    source: 'Beginner tutorial curriculum',
  },
  {
    id: 'hunt-the-king',
    group: 'Exploratory',
    status: 'planned',
    title: 'Hunt The King',
    summary:
      'Turn winning into a search exercise: shrink the possible king region, use the right scout, and capture once found.',
    outlineChapters: [
      'Small search zone',
      'Use the right scout',
      'Cut off escape squares',
      'Capture once found',
      'Fewest moves challenge',
    ],
    cta: 'Open preview',
    source: 'Beginner tutorial curriculum',
  },
  {
    id: 'fog-forks',
    group: 'Exploratory',
    status: 'planned',
    title: 'Fog Forks',
    summary:
      'Translate a familiar chess tactic into hidden information: forks can target vision, safety, and likely king zones.',
    outlineChapters: [
      'Classical fork refresher',
      'Information fork',
      'King plus material',
      'Wrong fork',
      'Choose the Fog fork',
    ],
    cta: 'Open preview',
    source: 'Beginner tutorial curriculum',
  },
  {
    id: 'edge-of-vision',
    group: 'Exploratory',
    status: 'planned',
    title: 'Edge Of Vision',
    summary:
      'Make the boundary between known and unknown space actionable: expand toward the right frontier without overextending.',
    outlineChapters: [
      'Find the frontier',
      'Expand toward danger',
      'Expand without overextending',
      'Bad expansion',
      'Good frontier move',
    ],
    cta: 'Open preview',
    source: 'Beginner tutorial curriculum',
  },
  {
    id: 'what-can-they-see',
    group: 'Exploratory',
    status: 'planned',
    title: 'What Can They See?',
    summary:
      'Teach perspective asymmetry by comparing White view, Black view, truth, and moves that deny useful information.',
    outlineChapters: [
      'White view',
      'Black view',
      'Same square, different meaning',
      'Move with empathy',
      'Replay comparison',
    ],
    cta: 'Open preview',
    source: 'Beginner tutorial curriculum',
  },
  {
    id: 'postgame-truth-reveal',
    group: 'Exploratory',
    status: 'planned',
    title: 'Postgame Truth Reveal',
    summary:
      'Use perspective replay to explain a tiny Fog line from each player view and then the canonical truth view.',
    outlineChapters: [
      'Play a tiny line',
      'White view replay',
      'Black view replay',
      'Truth view',
      'Find the missed fact',
    ],
    cta: 'Open preview',
    source: 'Beginner tutorial curriculum',
  },
  {
    id: 'first-real-fog-decision',
    group: 'Exploratory',
    status: 'planned',
    title: 'First Real Fog Decision',
    summary:
      'Bridge tutorial boards into a normal game position where the player weighs vision, safety, and tempo.',
    outlineChapters: [
      'Opening information',
      'Choose a developing scout',
      'Spot the unsafe plan',
      'Commit under uncertainty',
      'Play handoff',
    ],
    cta: 'Open preview',
    source: 'Beginner tutorial curriculum',
  },
  {
    id: 'belief-state-basics',
    group: 'Exploratory',
    status: 'planned',
    title: 'Belief State Basics',
    summary:
      'Explain why hidden-information chess is not one position, but a distribution of possible true boards.',
    outlineChapters: [
      'Why Stockfish does not transfer',
      'The belief state',
      'Observation constraints',
      'Belief collapse',
      'Player-facing intuition',
    ],
    cta: 'Open preview',
    source: 'Engine belief-state article outline',
  },
  {
    id: 'particle-filters',
    group: 'Exploratory',
    status: 'planned',
    title: 'Particle Filters',
    summary:
      'Turn the engine article into an interactive explanation of sampling, weighting, resampling, and particle count tradeoffs.',
    outlineChapters: [
      'Sample candidate worlds',
      'Weight by observation',
      'Resample and drift',
      'Particle count tradeoff',
      'Degeneracy late game',
    ],
    cta: 'Open preview',
    source: 'Engine belief-state article outline',
  },
  {
    id: 'move-selection-under-uncertainty',
    group: 'Exploratory',
    status: 'planned',
    title: 'Move Selection Under Uncertainty',
    summary:
      'Show how candidate moves are judged across many plausible worlds, including risk, information gain, and terminal vetoes.',
    outlineChapters: [
      'Evaluate across particles',
      'Least valuable attacker',
      'Hidden defender risk',
      'Terminal king safety',
      'Information gain',
    ],
    cta: 'Open preview',
    source: 'Engine roadmap and belief bug notes',
  },
  {
    id: 'latent-slider-danger',
    group: 'Exploratory',
    status: 'planned',
    title: 'Latent Slider Danger',
    summary:
      'Teach the research lesson behind unseen queen, rook, and bishop rays that matter even when belief mass is low.',
    outlineChapters: [
      'Absent dangerous worlds',
      'King-target rays',
      'Low-belief probes',
      'Blocking moves',
      'Danger-probe particles',
    ],
    cta: 'Open preview',
    source: 'Belief Particle Engine rung-3 notes',
  },
  {
    id: 'engine-lab-loop',
    group: 'Exploratory',
    status: 'planned',
    title: 'Engine Lab Loop',
    summary:
      'Expose the research workflow: saved games, belief artifacts, annotation queues, replay gates, and named failure classes.',
    outlineChapters: [
      'Saved bake-off artifacts',
      'Belief snapshots',
      'Annotation queue',
      'Replay target',
      'Failure class becomes a test',
    ],
    cta: 'Open preview',
    source: 'Engine architecture roadmap',
  },
];

const chapters: TutorialChapter[] = [
  {
    id: 'tutorial-vision',
    lesson: 'Vision',
    title: 'Move and watch',
    goal: 'Move the rook anywhere. Watch how the fog changes.',
    board: {
      e1: { color: 'white', role: 'king' },
      d1: { color: 'white', role: 'rook' },
      h8: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach:
          'You see the squares your pieces can reach — plus the squares they stand on. Move the rook anywhere; the fog will update to match its new vision.',
        challenge: 'Move the rook anywhere.',
        targets: [],
        afterTargets: [],
        accepted: ['d1d2', 'd1d3', 'd1d4', 'd1d5', 'd1d6', 'd1d7', 'd1d8', 'd1a1', 'd1b1', 'd1c1'],
        softFailures: {},
        success:
          'Vision moves with the piece. Squares your rook can reach are now bright; squares it left behind may be dark.',
      },
    ],
  },
  {
    id: 'tutorial-king-capture',
    lesson: 'King Capture',
    title: 'Take the king',
    goal: "The black king is in your rook's sight. Capture it.",
    board: {
      e1: { color: 'white', role: 'king' },
      h1: { color: 'white', role: 'rook' },
      h8: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach:
          'In dark chess there is no check or checkmate. When an enemy king is in your line of sight, you can take it and end the game. Capture the black king on h8.',
        challenge: 'Capture the king on h8.',
        targets: ['h8'],
        afterTargets: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8'],
        accepted: ['h1h8'],
        softFailures: {
          h1h7: 'Go all the way — capture the king on h8.',
          h1h2: 'The king is at the end of the file. Push the rook straight to h8.',
          h1h3: 'The king is at the end of the file. Push the rook all the way to h8.',
        },
        success:
          'You captured the king. In dark chess there is no check or checkmate — when an enemy king is in your line of sight, you can take it and end the game.',
      },
    ],
  },
  {
    id: 'tutorial-hidden-move',
    lesson: 'Hidden Moves',
    title: 'What just happened?',
    goal: 'Your opponent just moved. Look at the board — anything different?',
    interaction: 'reveal',
    board: {
      a1: { color: 'white', role: 'rook' },
      b1: { color: 'white', role: 'knight' },
      c1: { color: 'white', role: 'bishop' },
      d1: { color: 'white', role: 'queen' },
      e1: { color: 'white', role: 'king' },
      f1: { color: 'white', role: 'bishop' },
      h1: { color: 'white', role: 'rook' },
      a2: { color: 'white', role: 'pawn' },
      b2: { color: 'white', role: 'pawn' },
      c2: { color: 'white', role: 'pawn' },
      d2: { color: 'white', role: 'pawn' },
      f2: { color: 'white', role: 'pawn' },
      g2: { color: 'white', role: 'pawn' },
      h2: { color: 'white', role: 'pawn' },
      f3: { color: 'white', role: 'knight' },
      e4: { color: 'white', role: 'pawn' },
      e5: { color: 'black', role: 'pawn' },
      c6: { color: 'black', role: 'knight' },
      a7: { color: 'black', role: 'pawn' },
      b7: { color: 'black', role: 'pawn' },
      c7: { color: 'black', role: 'pawn' },
      d7: { color: 'black', role: 'pawn' },
      f7: { color: 'black', role: 'pawn' },
      g7: { color: 'black', role: 'pawn' },
      h7: { color: 'black', role: 'pawn' },
      a8: { color: 'black', role: 'rook' },
      c8: { color: 'black', role: 'bishop' },
      d8: { color: 'black', role: 'queen' },
      e8: { color: 'black', role: 'king' },
      f8: { color: 'black', role: 'bishop' },
      g8: { color: 'black', role: 'knight' },
      h8: { color: 'black', role: 'rook' },
    },
    revealTruthOnSuccess: true,
    reveal: {
      scout: 'b8',
      revealed: 'c6',
      text: '',
    },
    steps: [
      {
        teach:
          "Your opponent just moved. You see your own pieces and the squares your pieces reach — but most of the board past rank 5 is in your fog. Look at the board for a moment. When you're ready, reveal what they did.",
        challenge: "Click 'Reveal what happened' when you're ready.",
        targets: [],
        afterTargets: [],
        accepted: [],
        softFailures: {},
        success:
          'Black developed a knight from b8 to c6 — entirely in your fog. No white piece reaches b8 or c6, so you saw nothing change. In dark chess, an opponent move that happens fully in your fog is invisible to you. You only ever see the parts of their moves that touch your vision.',
      },
    ],
  },

  // --- Endgames: The Two Kings Standoff (K vs K) ---
  // Source: Zhang & Sandholm, Obscuro (2025), Appendix E.8. Framing from
  // Gehnen & Stannat, Fog of War Chess (2026).
  {
    id: 'kvk-chase',
    lesson: 'The Two Kings Standoff',
    title: 'The chase',
    goal: 'You are a lone king. So is your opponent, hidden in the fog. Try to catch it.',
    mode: 'play',
    playMoveCap: 12,
    playCoachCap:
      'Twelve moves, and no capture. You can glimpse it when you get close, but it always slips back into the fog before you can arrive. Let us see why.',
    nextLabel: 'Why?',
    board: {
      d2: { color: 'white', role: 'king' },
      d6: { color: 'black', role: 'king' },
    },
    steps: [],
  },
  {
    id: 'kvk-attack-a',
    lesson: 'The Two Kings Standoff',
    title: 'Why you cannot attack',
    goal: 'Now in full view. The hidden king sits on one of two touching squares, e5 or e6, and you cannot tell which.',
    mode: 'demo',
    demoIntro: 'Suppose it is on e5. Watch what happens when you step in to attack.',
    demoMoves: [
      { by: 'white', uci: 'e3e4', say: 'You step next to it.' },
      {
        by: 'black',
        uci: 'e5e4',
        say: 'There is no check in dark chess. It is the hidden king to move, and it simply takes you. You lose.',
      },
    ],
    demoConclusion:
      'That is one of the two possible worlds. The king was on e5, and attacking cost you the game.',
    safePair: ['e5', 'e6'],
    nextLabel: 'The other world',
    board: {
      e3: { color: 'white', role: 'king' },
      e5: { color: 'black', role: 'king' },
    },
    steps: [],
  },
  {
    id: 'kvk-attack-b',
    lesson: 'The Two Kings Standoff',
    title: 'The other world',
    goal: 'Same position, but suppose the king was really on the other square, e6.',
    mode: 'demo',
    demoIntro: 'You make the exact same move, because you cannot tell where it is.',
    demoMoves: [
      { by: 'white', uci: 'e3e4', say: 'You step in, just like before.' },
      {
        by: 'black',
        uci: 'e6e7',
        say: 'This time it was on e6, out of reach. Your move did nothing. It just drifts away.',
      },
    ],
    demoConclusion:
      'Two worlds, the same move from you, and no way to tell them apart. In one you are captured. In the other you gain nothing.',
    safePair: ['e5', 'e6'],
    nextLabel: 'So what?',
    board: {
      e3: { color: 'white', role: 'king' },
      e6: { color: 'black', role: 'king' },
    },
    steps: [],
  },
  {
    id: 'kvk-draw',
    lesson: 'The Two Kings Standoff',
    title: 'A losing coin flip',
    goal: 'Put the two worlds together.',
    mode: 'teach',
    teachText:
      'The king hides between two touching squares and you cannot see which one. Step next to it and, half the time, it is there and takes you. The other half, you gain nothing. Attacking is a coin flip you lose, so you never dare. Two lone kings just drift around each other forever. In the open, it is a draw.',
    safePair: ['e5', 'e6'],
    nextLabel: 'The corner',
    board: {
      e3: { color: 'white', role: 'king' },
      e5: { color: 'black', role: 'king' },
    },
    steps: [],
  },
  {
    id: 'kvk-corner',
    lesson: 'The Two Kings Standoff',
    title: 'The corner',
    goal: 'The draw works because the king always has two safe touching squares to hide between. In the corner, it does not.',
    mode: 'teach',
    teachText:
      'From the corner a8, the king has only three moves, and two of them, a7 and b7, step right next to you. Only b8 is safe. The safe pair is gone. With nowhere safe to dodge, the king can no longer survive your coin-flip attack, so a cornered king can be hunted down and caught. The corner is the only place a lone king can lose.',
    unsafeSquares: ['a7', 'b7'],
    safePair: ['b8'],
    nextLabel: 'The limit',
    board: {
      b6: { color: 'white', role: 'king' },
      a8: { color: 'black', role: 'king' },
    },
    steps: [],
  },
  {
    id: 'kvk-close',
    lesson: 'The Two Kings Standoff',
    title: 'The limit',
    goal: 'The lesson is the limit of a lone king.',
    mode: 'teach',
    teachText:
      'Two kings in the open is a draw you cannot break. Only a cornered king can lose, and even then you win by guessing right, not by force. The real limit: a lone king reaches nothing across the board, so it can never trap what it cannot see. Add one piece that does reach across the board, a queen, and the guessing disappears. That is next.',
    nextLabel: 'Queen endgame',
    board: {
      d4: { color: 'white', role: 'king' },
      e6: { color: 'black', role: 'king' },
    },
    steps: [],
  },

  // --- Endgames: King and queen versus lone king (K+Q vs K) ---
  {
    id: 'kqk-free-queen-vision',
    lesson: 'K+Q vs K',
    title: 'Free queen vision',
    goal: 'Only the White king and queen are on the board. Fog is on, and White practices moving them.',
    mode: 'practice',
    teachText:
      'Starting interaction: no Black pieces yet. Let White move the king and queen freely with fog enabled, so the player can feel how queen vision blooms, collapses, and differs from king vision before any defender is added.',
    fogPreview: true,
    safePair: ['d8', 'h4', 'a4'],
    nextLabel: 'Random king',
    board: {
      d3: { color: 'white', role: 'king' },
      d4: { color: 'white', role: 'queen' },
    },
    steps: [],
  },
  {
    id: 'kqk-random-king',
    lesson: 'K+Q vs K',
    title: 'Random hidden king',
    goal: 'Add a Black king that makes random moves while White practices hunting it.',
    mode: 'teach',
    teachText:
      'Starting interaction: after each White move, the Black king chooses a random legal king move. White sees only what the king and queen reveal. This should teach search and containment before the defender becomes adversarial.',
    fogPreview: true,
    safePair: ['h7'],
    nextLabel: 'Punish mistakes',
    board: {
      e3: { color: 'white', role: 'king' },
      d4: { color: 'white', role: 'queen' },
      h7: { color: 'black', role: 'king' },
    },
    steps: [],
  },
  {
    id: 'kqk-punish-scouting',
    lesson: 'K+Q vs K',
    title: 'Punish loose scouting',
    goal: 'The Black king punishes poor White moves, especially unprotected queen scouting or exposed kings.',
    mode: 'teach',
    teachText:
      "Starting interaction: the defender is still simple, but tactical. If White sends the queen where the king cannot protect it, Black should take it when possible. If White exposes the king, Black should capture the king. This chapter teaches that queen reach is not permission to scout carelessly.",
    fogPreview: true,
    safePair: ['g7', 'h7'],
    unsafeSquares: ['h6'],
    nextLabel: 'Optimal defence',
    board: {
      e2: { color: 'white', role: 'king' },
      h6: { color: 'white', role: 'queen' },
      g8: { color: 'black', role: 'king' },
    },
    steps: [],
  },
  {
    id: 'kqk-perfect-defender',
    lesson: 'K+Q vs K',
    title: 'Perfect defender',
    goal: 'The Black king now defends optimally while knowing exactly where White is.',
    mode: 'teach',
    teachText:
      'Starting interaction: Black gets the full truth board and chooses the best defensive move, not a random move. It should preserve distance, avoid corners, punish loose pieces, and use perfect information about White king and queen placement.',
    fogPreview: true,
    safePair: ['h8', 'h7', 'g8'],
    nextLabel: 'Superpositions',
    board: {
      f4: { color: 'white', role: 'king' },
      e5: { color: 'white', role: 'queen' },
      h8: { color: 'black', role: 'king' },
    },
    steps: [],
  },
  {
    id: 'kqk-superposition-corner',
    lesson: 'K+Q vs K',
    title: 'Corner the superpositions',
    goal: 'Show every possible Black king square at once, then make White demonstrate the cornering and capture plan.',
    mode: 'teach',
    teachText:
      'Starting interaction: render the Black king as a superposition across all legal belief-state candidates. White must use queen walls and king support to shrink the possible set into the corner, then choose a move that captures every remaining world.',
    fogPreview: true,
    safePair: ['h8', 'h7', 'g8', 'g7'],
    nextLabel: 'Rook endgame',
    board: {
      f6: { color: 'white', role: 'king' },
      g4: { color: 'white', role: 'queen' },
      h8: { color: 'black', role: 'king' },
    },
    steps: [],
  },

  // --- Endgames: King and rook versus lone king (K+R vs K) ---
  {
    id: 'krk-free-rook-vision',
    lesson: 'K+R vs K',
    title: 'Free rook vision',
    goal: 'Only the White king and rook are on the board. Fog is on, and White practices moving them.',
    mode: 'practice',
    teachText:
      'Starting interaction: no Black pieces yet. Let White move the king and rook freely with fog enabled, so the player can feel the rook as a rank-and-file wall before any defender is added.',
    fogPreview: true,
    safePair: ['d8', 'a4', 'h4'],
    nextLabel: 'Random king',
    board: {
      d3: { color: 'white', role: 'king' },
      d4: { color: 'white', role: 'rook' },
    },
    steps: [],
  },
  {
    id: 'krk-random-king',
    lesson: 'K+R vs K',
    title: 'Random hidden king',
    goal: 'Add a Black king that makes random moves while White practices building rook walls.',
    mode: 'teach',
    teachText:
      'Starting interaction: after each White move, the Black king chooses a random legal king move. White sees only what the king and rook reveal. This should teach how rook lines cut files and ranks but do not cover diagonals.',
    fogPreview: true,
    safePair: ['h7'],
    nextLabel: 'Punish mistakes',
    board: {
      e3: { color: 'white', role: 'king' },
      d4: { color: 'white', role: 'rook' },
      h7: { color: 'black', role: 'king' },
    },
    steps: [],
  },
  {
    id: 'krk-punish-rook',
    lesson: 'K+R vs K',
    title: 'Punish loose rooks',
    goal: 'The Black king punishes poor White moves, especially unprotected rook scouting or exposed kings.',
    mode: 'teach',
    teachText:
      "Starting interaction: the defender is still simple, but tactical. If White sends the rook beyond king support, Black should take it when possible. If White exposes the king, Black should capture the king. This chapter teaches that the rook's wall only matters while the rook survives.",
    fogPreview: true,
    safePair: ['g7', 'h7'],
    unsafeSquares: ['h6'],
    nextLabel: 'Optimal defence',
    board: {
      e2: { color: 'white', role: 'king' },
      h6: { color: 'white', role: 'rook' },
      g8: { color: 'black', role: 'king' },
    },
    steps: [],
  },
  {
    id: 'krk-perfect-defender',
    lesson: 'K+R vs K',
    title: 'Perfect defender',
    goal: 'The Black king now defends optimally while knowing exactly where White is.',
    mode: 'teach',
    teachText:
      'Starting interaction: Black gets the full truth board and chooses the best defensive move. It should avoid the edge, stay near diagonal escape routes, punish loose rooks, and use perfect information about White king and rook placement.',
    fogPreview: true,
    safePair: ['h8', 'h7', 'g8'],
    nextLabel: 'Superpositions',
    board: {
      f4: { color: 'white', role: 'king' },
      e5: { color: 'white', role: 'rook' },
      h8: { color: 'black', role: 'king' },
    },
    steps: [],
  },
  {
    id: 'krk-superposition-edge',
    lesson: 'K+R vs K',
    title: 'Edge the superpositions',
    goal: 'Show every possible Black king square at once, then make White demonstrate the edge-and-capture plan.',
    mode: 'teach',
    teachText:
      'Starting interaction: render the Black king as a superposition across all legal belief-state candidates. White must use rook walls and king support to compress the possible set against an edge, then find the capture once every remaining world is covered.',
    fogPreview: true,
    safePair: ['h8', 'h7', 'g8', 'g7'],
    nextLabel: 'Modules',
    board: {
      f6: { color: 'white', role: 'king' },
      g4: { color: 'white', role: 'rook' },
      h8: { color: 'black', role: 'king' },
    },
    steps: [],
  },
];

export function mountLearn(root: HTMLElement): void {
  const state = createTutorialState();
  root.replaceChildren();
  root.classList.add('landing-page', 'learn-route');
  root.append(buildNav(), buildShell(state), buildFooter());
  applyLearnRoute(state);
  window.addEventListener('hashchange', () => applyLearnRoute(state));
}

type LearnView = 'home' | 'chapter' | 'module';

type TutorialState = {
  api: Api | null;
  boardEl: HTMLElement | null;
  view: LearnView;
  activeModuleId: string | null;
  chapterIndex: number;
  stepIndex: number;
  status: ChapterStatus;
  activeState: GameState;
  message: string;
  shell: HTMLElement | null;
  // Endgames node state.
  demoIndex: number; // moves applied so far in a demo chapter
  whiteMoves: number; // white moves played in a play chapter
  playDone: boolean; // play chapter reached its cap / ended
  busy: boolean; // ignore input while the defender reply is pending
};

function createTutorialState(): TutorialState {
  const first = chapters[0]!;
  return {
    api: null,
    boardEl: null,
    view: 'home',
    activeModuleId: null,
    chapterIndex: 0,
    stepIndex: 0,
    status: 'ready',
    activeState: gameStateFromBoard(first.id, first.board),
    message: first.steps[0]!.teach,
    shell: null,
    demoIndex: 0,
    whiteMoves: 0,
    playDone: false,
    busy: false,
  };
}

function buildShell(state: TutorialState): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'learn-shell';
  state.shell = shell;
  return shell;
}

function render(state: TutorialState): void {
  const shell = state.shell;
  if (!shell) return;

  if (state.view === 'home') {
    shell.className = 'learn-shell learn-home-shell';
    shell.replaceChildren(buildLearnHome(state));
    state.api = null;
    state.boardEl = null;
    return;
  }

  if (state.view === 'module') {
    renderPlannedModule(state);
    return;
  }

  shell.className = 'learn-shell learn-tutorial-shell';
  const chapter = chapters[state.chapterIndex]!;
  const view = darkChessVariant.getPlayerView(state.activeState, 'white');
  const menu = buildLearnMenu(state);
  const boardPanel = document.createElement('section');
  boardPanel.className = 'learn-board-panel';
  const boardEl = document.createElement('div');
  boardEl.className = 'board learn-board';
  boardEl.setAttribute('aria-label', 'Dark chess tutorial board');
  boardPanel.append(boardEl);

  const panel = buildPanel(state, chapter);
  shell.replaceChildren(menu, boardPanel, panel);
  state.boardEl = boardEl;
  state.api = createTutorialBoard(boardEl, view, chapter, state);
  updateBoard(state, chapter, view);
}

function buildLearnHome(state: TutorialState): HTMLElement {
  const page = document.createElement('section');
  page.className = 'learn-home';
  page.setAttribute('aria-labelledby', 'learn-home-title');

  const intro = document.createElement('div');
  intro.className = 'learn-home-intro';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'learn-progress';
  eyebrow.textContent = 'Learning modules';

  const title = document.createElement('h1');
  title.id = 'learn-home-title';
  title.className = 'learn-heading';
  title.textContent = 'Learn dark chess';

  const copy = document.createElement('p');
  copy.className = 'learn-copy';
  copy.textContent =
    'Short interactive modules for the parts of dark chess that normal chess does not teach: vision, hidden moves, king capture, and information mistakes.';

  intro.append(eyebrow, title, copy);

  const grid = document.createElement('div');
  grid.className = 'learn-module-grid';
  for (const group of moduleGroups()) {
    grid.append(buildLearnModuleSection(state, group));
  }

  page.append(intro, grid);
  return page;
}

function buildLearnModuleSection(state: TutorialState, group: LearnModuleGroup): HTMLElement {
  const section = document.createElement('section');
  section.className = 'learn-module-section';

  const header = document.createElement('div');
  header.className = 'learn-module-section-header';

  const title = document.createElement('h2');
  title.textContent = group;

  const count = document.createElement('span');
  const modules = modulesForGroup(group);
  count.textContent = `${modules.length} ${modules.length === 1 ? 'module' : 'modules'}`;

  header.append(title, count);

  const list = document.createElement('div');
  list.className = 'learn-module-section-list';
  for (const module of modules) {
    list.append(buildLearnModuleCard(state, module));
  }

  section.append(header, list);
  return section;
}

function buildLearnModuleCard(state: TutorialState, module: LearnModule): HTMLElement {
  const card = document.createElement('article');
  card.className = `learn-module-card is-${module.status}`;

  const number = document.createElement('div');
  number.className = 'learn-module-number';
  number.textContent = moduleNumberLabel(module);

  const body = document.createElement('div');
  body.className = 'learn-module-body';

  const top = document.createElement('div');
  top.className = 'learn-module-top';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'learn-module-eyebrow';
  eyebrow.textContent = moduleEyebrow(module);

  const meta = document.createElement('span');
  meta.className = 'learn-module-meta';
  meta.textContent = `${moduleChapterCount(module)} chapters · ${moduleStatusLabel(module)}`;

  top.append(eyebrow, meta);

  const title = document.createElement('h2');
  title.textContent = module.title;

  const copy = document.createElement('p');
  copy.textContent = module.summary;

  const action = document.createElement('button');
  action.type = 'button';
  action.className =
    module.status === 'available' ? 'landing-cta-primary' : 'landing-cta-secondary';
  action.textContent = module.status === 'planned' ? 'Open preview' : module.cta;
  action.addEventListener('click', () => openModule(state, module.id));

  body.append(top, title, copy, action);
  card.append(number, body);
  return card;
}

function renderPlannedModule(state: TutorialState): void {
  const shell = state.shell;
  if (!shell) return;

  const module =
    learnModules.find((candidate) => candidate.id === state.activeModuleId) ?? learnModules[0]!;
  const moduleState = plannedModuleState(module);
  const view = darkChessVariant.getPlayerView(moduleState, 'white');

  shell.className = 'learn-shell learn-tutorial-shell';
  const menu = buildPlannedModuleMenu(state, module);
  const boardPanel = document.createElement('section');
  boardPanel.className = 'learn-board-panel';

  const boardEl = document.createElement('div');
  boardEl.className = 'board learn-board';
  boardEl.setAttribute('aria-label', `${module.title} preview board`);
  boardPanel.append(boardEl);

  const panel = buildPlannedModulePanel(module);
  shell.replaceChildren(menu, boardPanel, panel);
  state.boardEl = boardEl;
  state.activeState = moduleState;
  state.api = createStaticLearnBoard(boardEl, view);
}

function buildPlannedModuleMenu(state: TutorialState, module: LearnModule): HTMLElement {
  const menu = document.createElement('aside');
  menu.className = 'learn-menu';
  menu.setAttribute('aria-label', 'Module outline');

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'learn-menu-back';
  back.textContent = 'All modules';
  back.addEventListener('click', () => showLearnHome(state));

  const header = document.createElement('header');
  header.className = 'learn-menu-header';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'learn-menu-eyebrow';
  eyebrow.textContent = moduleEyebrow(module);

  const title = document.createElement('h2');
  title.textContent = module.title;

  const meta = document.createElement('p');
  meta.textContent = `${moduleChapterCount(module)} planned chapters`;

  header.append(eyebrow, title, meta);

  const chaptersList = document.createElement('ol');
  chaptersList.className = 'learn-menu-chapters';
  const chapterTitles = moduleChapterTitles(module);
  for (let localIndex = 0; localIndex < chapterTitles.length; localIndex += 1) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `learn-menu-chapter${localIndex === 0 ? ' is-current' : ''}`;
    button.disabled = true;

    const index = document.createElement('span');
    index.className = 'learn-menu-chapter-index';
    index.textContent = String(localIndex + 1);

    const text = document.createElement('span');
    text.className = 'learn-menu-chapter-text';

    const chapterTitle = document.createElement('span');
    chapterTitle.className = 'learn-menu-chapter-title';
    chapterTitle.textContent = chapterTitles[localIndex]!;

    const subtitle = document.createElement('span');
    subtitle.className = 'learn-menu-chapter-subtitle';
    subtitle.textContent = 'Planned';

    text.append(chapterTitle, subtitle);
    button.append(index, text);
    item.append(button);
    chaptersList.append(item);
  }

  menu.append(back, header, chaptersList);
  return menu;
}

function buildPlannedModulePanel(module: LearnModule): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'learn-panel learn-tutorial-panel';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'learn-progress';
  eyebrow.textContent = `${moduleEyebrow(module)} · ${moduleStatusLabel(module)}`;

  const title = document.createElement('h1');
  title.className = 'learn-heading';
  title.textContent = module.title;

  const chapterTitle = document.createElement('h2');
  chapterTitle.className = 'learn-chapter-title';
  chapterTitle.textContent = 'Planned module';

  const copy = document.createElement('p');
  copy.className = 'learn-copy';
  copy.textContent = module.summary;

  const source = document.createElement('p');
  source.className = 'learn-module-source';
  source.textContent = module.source;

  const prompt = document.createElement('div');
  prompt.className = 'learn-tutorial-message ready';
  prompt.textContent =
    'This parked module opens in the lesson board shell now. The board is a static preview until the authored interaction lands.';

  const actions = document.createElement('div');
  actions.className = 'learn-actions';
  const hint = document.createElement('p');
  hint.className = 'learn-hint';
  hint.textContent = 'The chapter outline is in the left rail.';
  actions.append(hint);

  panel.append(eyebrow, title, chapterTitle, copy, source, prompt, actions);
  return panel;
}

function buildLearnMenu(state: TutorialState): HTMLElement {
  const module = moduleForChapterIndex(state.chapterIndex) ?? learnModules[0]!;
  const menu = document.createElement('aside');
  menu.className = 'learn-menu';
  menu.setAttribute('aria-label', 'Learn menu');

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'learn-menu-back';
  back.textContent = 'All modules';
  back.addEventListener('click', () => showLearnHome(state));

  const header = document.createElement('header');
  header.className = 'learn-menu-header';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'learn-menu-eyebrow';
  eyebrow.textContent = moduleEyebrow(module);

  const title = document.createElement('h2');
  title.textContent = module.title;

  const meta = document.createElement('p');
  meta.textContent = `${moduleChapterCount(module)} chapters`;

  header.append(eyebrow, title, meta);

  const chaptersList = document.createElement('ol');
  chaptersList.className = 'learn-menu-chapters';
  const chapterIds = module.chapterIds ?? [];
  for (let localIndex = 0; localIndex < chapterIds.length; localIndex += 1) {
    const chapter = chapterById(chapterIds[localIndex]!);
    if (!chapter) continue;
    chaptersList.append(buildMenuChapterButton(state, module, chapter, localIndex));
  }

  menu.append(back, header, chaptersList);
  return menu;
}

function buildPanel(state: TutorialState, chapter: TutorialChapter): HTMLElement {
  if (chapter.mode) return buildEndgamePanel(state, chapter);
  const step = currentStep(state, chapter);
  const panel = document.createElement('section');
  panel.className = 'learn-panel learn-tutorial-panel';

  const progress = document.createElement('div');
  progress.className = 'learn-progress';
  progress.textContent = chapterProgress(state.chapterIndex);

  const heading = document.createElement('h1');
  heading.className = 'learn-heading';
  heading.textContent = chapter.lesson;

  const chapterTitle = document.createElement('h2');
  chapterTitle.className = 'learn-chapter-title';
  chapterTitle.textContent = chapter.title;

  const goal = document.createElement('p');
  goal.className = 'learn-copy';
  goal.textContent = chapter.goal;

  const prompt = document.createElement('div');
  prompt.className = `learn-tutorial-message ${state.status}`;
  prompt.textContent = state.message;

  const targetList = document.createElement('div');
  targetList.className = 'learn-target-list';
  for (const target of step.targets) {
    const item = document.createElement('span');
    item.textContent = target;
    targetList.append(item);
  }

  const actions = document.createElement('div');
  actions.className = 'learn-actions';

  if (state.status === 'success') {
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'landing-cta-primary';
    next.textContent = nextChapterLabel(state.chapterIndex);
    next.addEventListener('click', () => goNextChapter(state));
    actions.append(next);
  } else if (chapter.interaction === 'reveal') {
    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.className = 'landing-cta-primary';
    reveal.textContent = 'Reveal what happened';
    reveal.addEventListener('click', () => triggerReveal(state));
    actions.append(reveal);
  } else if (state.status === 'soft-failure') {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'landing-cta-primary';
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => resetChapter(state));
    actions.append(retry);
  } else {
    const hint = document.createElement('p');
    hint.className = 'learn-hint';
    hint.textContent = step.challenge;
    actions.append(hint);
  }

  panel.append(progress, heading, chapterTitle, goal, prompt, targetList, actions);
  return panel;
}

function createTutorialBoard(
  el: HTMLElement,
  view: PlayerView,
  chapter: TutorialChapter,
  state: TutorialState,
): Api {
  const interactive = chapter.mode
    ? (chapter.mode === 'practice' || chapter.mode === 'play') && !state.playDone && !state.busy
    : chapter.interaction !== 'reveal';
  const api = mountBoard(el, {
    animation: { enabled: false, duration: 0 },
    coordinates: true,
    coordinatesOnSquares: false,
    fen: boardFen(renderBoardFor(chapter, state, view)),
    orientation: 'white',
    movable: {
      free: false,
      color: interactive ? 'white' : undefined,
      dests: interactive ? legalDests(view) : new Map(),
    },
    draggable: { enabled: interactive },
    selectable: { enabled: interactive },
    premovable: { enabled: false },
    highlight: { custom: tutorialSquareClasses(view, chapter, state), lastMove: false },
    events: {
      move: (from, to) => handleMove(state, `${from}${to}` as Uci),
    },
    disableContextMenu: true,
  });
  return api;
}

function createStaticLearnBoard(el: HTMLElement, view: PlayerView): Api {
  return mountBoard(el, {
    animation: { enabled: false, duration: 0 },
    coordinates: true,
    coordinatesOnSquares: false,
    fen: boardFen(view.board),
    orientation: 'white',
    movable: {
      free: false,
      color: undefined,
      dests: new Map(),
    },
    draggable: { enabled: false },
    selectable: { enabled: false },
    premovable: { enabled: false },
    highlight: { custom: hiddenSquareClasses(view, 'white'), lastMove: false },
    disableContextMenu: true,
  });
}

function handleMove(state: TutorialState, uci: Uci): void {
  const chapter = chapters[state.chapterIndex]!;
  if (chapter.mode === 'practice') {
    handlePracticeMove(state, uci);
    return;
  }
  if (chapter.mode === 'play') {
    handlePlayMove(state, uci);
    return;
  }
  if (chapter.mode) return;
  if (chapter.interaction === 'reveal') return;
  const step = currentStep(state, chapter);
  if (state.status !== 'ready') return;

  const view = darkChessVariant.getPlayerView(state.activeState, 'white');
  const move = moveFromUci(uci);
  const resolvedMove = resolveUiMove(view, move);
  if (!resolvedMove) {
    state.message = 'That move is not legal from this position.';
    render(state);
    return;
  }

  const resolvedUci = moveToUci(resolvedMove);
  const isAccepted = step.accepted.includes(uci) || step.accepted.includes(resolvedUci);

  const nextState = darkChessVariant.applyMove(state.activeState, resolvedMove);

  if (isAccepted && step.opponentReply) {
    // Two-phase reveal: render the truth board with white's move applied and the
    // opponent's piece still sitting on its origin square (the "oh, that's where it
    // was" moment), then apply the scripted capture after a short pause so the
    // player sees the threat before it lands.
    const oppReply = step.opponentReply;
    state.activeState = { ...nextState, lastMove: resolvedMove };
    state.status = 'success';
    state.message = chapter.reveal ? `${step.success} ${chapter.reveal.text}` : step.success;
    render(state);
    setTimeout(() => {
      if (state.chapterIndex !== chapters.indexOf(chapter)) return;
      const oppMove = moveFromUci(oppReply);
      const captured = darkChessVariant.applyMove(state.activeState, oppMove);
      state.activeState = { ...captured, lastMove: oppMove };
      render(state);
    }, 1500);
    return;
  }

  state.activeState = {
    ...nextState,
    status: { type: 'playing', turn: 'white' },
    lastMove: resolvedMove,
  };

  if (isAccepted) {
    const isFinalStep = state.stepIndex === chapter.steps.length - 1;
    if (isFinalStep) {
      state.status = 'success';
      state.message = chapter.reveal ? `${step.success} ${chapter.reveal.text}` : step.success;
    } else {
      state.stepIndex += 1;
      state.status = 'ready';
      state.message = `${step.success} ${currentStep(state, chapter).teach}`;
    }
  } else {
    state.status = 'soft-failure';
    state.message = step.softFailures[uci] ?? 'That is legal, but it does not solve this chapter.';
  }
  render(state);
}

function showTruthBoard(chapter: TutorialChapter, state: TutorialState): boolean {
  if (chapter.fogPreview) return false;
  if (chapter.mode === 'demo' || chapter.mode === 'teach') return true;
  return state.status === 'success' && (chapter.revealTruthOnSuccess ?? false);
}

function renderBoardFor(chapter: TutorialChapter, state: TutorialState, view: PlayerView): Board {
  return showTruthBoard(chapter, state) ? state.activeState.board : view.board;
}

function resetChapter(state: TutorialState): void {
  const chapter = chapters[state.chapterIndex]!;
  state.activeState = gameStateFromBoard(chapter.id, chapter.board);
  state.stepIndex = 0;
  state.status = 'ready';
  state.demoIndex = 0;
  state.whiteMoves = 0;
  state.playDone = false;
  state.busy = false;
  if (chapter.mode === 'practice') state.message = chapter.teachText ?? '';
  else if (chapter.mode === 'demo') state.message = chapter.demoIntro ?? '';
  else if (chapter.mode === 'teach') state.message = chapter.teachText ?? '';
  else if (chapter.mode === 'play') state.message = '';
  else state.message = chapter.steps[0]!.teach;
  render(state);
}

function goToChapter(state: TutorialState, chapterIndex: number): void {
  if (!chapters[chapterIndex]) return;
  const nextHash = hashForChapter(chapterIndex);
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
    return;
  }
  openChapter(state, chapterIndex);
}

function updateBoard(state: TutorialState, chapter: TutorialChapter, view: PlayerView): void {
  const interactive = chapter.mode
    ? (chapter.mode === 'practice' || chapter.mode === 'play') && !state.playDone && !state.busy
    : chapter.interaction !== 'reveal' && state.status === 'ready';
  state.api?.set({
    fen: boardFen(renderBoardFor(chapter, state, view)),
    movable: {
      color: interactive ? 'white' : undefined,
      dests: interactive ? legalDests(view) : new Map(),
    },
    highlight: { custom: tutorialSquareClasses(view, chapter, state), lastMove: false },
  });
}

function triggerReveal(state: TutorialState): void {
  const chapter = chapters[state.chapterIndex]!;
  if (chapter.interaction !== 'reveal') return;
  if (state.status !== 'ready') return;
  const step = chapter.steps[0]!;
  state.status = 'success';
  state.message = chapter.reveal ? `${step.success} ${chapter.reveal.text}` : step.success;
  render(state);
}

function tutorialSquareClasses(
  view: PlayerView,
  chapter: TutorialChapter,
  state: TutorialState,
): cg.SquareClasses {
  if (chapter.mode) return endgameSquareClasses(view, chapter);
  const classes: cg.SquareClasses = showTruthBoard(chapter, state)
    ? new Map()
    : hiddenSquareClasses(view, 'white');
  const step = currentStep(state, chapter);
  const activeTargets = step.targets;
  for (const square of activeTargets) {
    classes.set(square as cg.Key, `${classes.get(square as cg.Key) ?? ''} learn-highlight`.trim());
  }
  if (state.status === 'success') {
    for (const square of step.afterTargets) {
      if (step.targets.includes(square)) continue;
      classes.set(
        square as cg.Key,
        `${classes.get(square as cg.Key) ?? ''} learn-explained`.trim(),
      );
    }
  }
  if (chapter.reveal && state.status === 'success') {
    for (const square of [chapter.reveal.scout, chapter.reveal.revealed]) {
      classes.set(square as cg.Key, `${classes.get(square as cg.Key) ?? ''} learn-reveal`.trim());
    }
  }
  return classes;
}

function currentStep(state: TutorialState, chapter: TutorialChapter): TutorialStep {
  return chapter.steps[state.stepIndex] ?? chapter.steps[chapter.steps.length - 1]!;
}

function buildMenuChapterButton(
  state: TutorialState,
  module: LearnModule,
  chapter: TutorialChapter,
  localIndex: number,
): HTMLElement {
  const item = document.createElement('li');
  const chapterIndex = chapters.indexOf(chapter);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = `learn-menu-chapter${chapterIndex === state.chapterIndex ? ' is-current' : ''}`;
  if (chapterIndex === state.chapterIndex) button.setAttribute('aria-current', 'step');

  const index = document.createElement('span');
  index.className = 'learn-menu-chapter-index';
  index.textContent = String(localIndex + 1);

  const text = document.createElement('span');
  text.className = 'learn-menu-chapter-text';

  const title = document.createElement('span');
  title.className = 'learn-menu-chapter-title';
  title.textContent = chapter.title;

  const subtitle = document.createElement('span');
  subtitle.className = 'learn-menu-chapter-subtitle';
  subtitle.textContent = chapter.lesson === module.title ? chapter.goal : chapter.lesson;

  text.append(title, subtitle);
  button.append(index, text);
  button.addEventListener('click', () => goToChapter(state, chapterIndex));
  item.append(button);
  return item;
}

function modulesForGroup(group: LearnModuleGroup): LearnModule[] {
  return learnModules.filter((module) => module.group === group);
}

function moduleGroups(): LearnModuleGroup[] {
  const groups: LearnModuleGroup[] = [];
  for (const module of learnModules) {
    if (!groups.includes(module.group)) groups.push(module.group);
  }
  return groups;
}

function moduleNumberLabel(module: LearnModule): string {
  return String(learnModules.indexOf(module) + 1).padStart(2, '0');
}

function moduleEyebrow(module: LearnModule): string {
  return `Module ${learnModules.indexOf(module) + 1}`;
}

function moduleStatusLabel(module: LearnModule): string {
  if (module.status === 'available') return 'Playable';
  if (module.status === 'wip') return 'WIP';
  return 'Planned';
}

function moduleChapterTitles(module: LearnModule): string[] {
  if (module.chapterIds) {
    return module.chapterIds
      .map((chapterId) => chapterById(chapterId)?.title)
      .filter((title): title is string => Boolean(title));
  }
  return module.outlineChapters ?? [];
}

function moduleChapterCount(module: LearnModule): number {
  return moduleChapterTitles(module).length;
}

function routeForModule(
  module: LearnModule,
): { view: 'module'; moduleId: string } | { view: 'chapter'; chapterIndex: number } {
  const chapterId = module.chapterIds?.[0];
  const chapterIndex = chapterId ? chapterIndexForId(chapterId) : -1;
  if (chapterIndex >= 0) return { view: 'chapter', chapterIndex };
  return { view: 'module', moduleId: module.id };
}

function applyLearnRoute(state: TutorialState): void {
  const route = parseLearnHash();
  if (route.view === 'home') {
    state.view = 'home';
    state.activeModuleId = null;
    render(state);
    return;
  }
  if (route.view === 'module') {
    state.view = 'module';
    state.activeModuleId = route.moduleId;
    render(state);
    return;
  }
  openChapter(state, route.chapterIndex);
}

function parseLearnHash():
  | { view: 'home' }
  | { view: 'module'; moduleId: string }
  | { view: 'chapter'; chapterIndex: number } {
  const rawHash = decodeURIComponent(window.location.hash.replace(/^#\/?/, '').trim());
  if (!rawHash) return { view: 'home' };

  const [first, second] = rawHash.split('/').filter(Boolean);
  const numericModule = Number.parseInt(first ?? '', 10);
  if (Number.isInteger(numericModule) && numericModule > 0) {
    const module = learnModules[numericModule - 1];
    if (module) return routeForModule(module);
  }

  const module = learnModules.find((candidate) => candidate.id === first);
  if (module) {
    const chapterIds = module.chapterIds ?? [];
    const chapterId = second && chapterIds.includes(second) ? second : chapterIds[0];
    const chapterIndex = chapterId ? chapterIndexForId(chapterId) : -1;
    if (chapterIndex >= 0) return { view: 'chapter', chapterIndex };
    return { view: 'module', moduleId: module.id };
  }

  const chapterIndex = chapterIndexForId(first ?? '');
  if (chapterIndex >= 0) return { view: 'chapter', chapterIndex };

  return { view: 'home' };
}

function showLearnHome(state: TutorialState): void {
  if (window.location.hash) {
    window.location.hash = '';
    return;
  }
  state.view = 'home';
  state.activeModuleId = null;
  render(state);
}

function openModule(state: TutorialState, moduleId: string): void {
  const module = learnModules.find((candidate) => candidate.id === moduleId);
  if (!module) return;
  const chapterId = module.chapterIds?.[0];
  const chapterIndex = chapterId ? chapterIndexForId(chapterId) : -1;
  if (chapterIndex >= 0) {
    goToChapter(state, chapterIndex);
    return;
  }
  const nextHash = hashForModule(module);
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
    return;
  }
  state.view = 'module';
  state.activeModuleId = module.id;
  render(state);
}

function openChapter(state: TutorialState, chapterIndex: number): void {
  if (!chapters[chapterIndex]) return;
  state.view = 'chapter';
  state.activeModuleId = null;
  state.chapterIndex = chapterIndex;
  resetChapter(state);
}

function chapterIndexForId(id: string): number {
  return chapters.findIndex((chapter) => chapter.id === id);
}

function chapterById(id: string): TutorialChapter | null {
  return chapters.find((chapter) => chapter.id === id) ?? null;
}

function moduleForChapterIndex(chapterIndex: number): LearnModule | null {
  const chapter = chapters[chapterIndex];
  if (!chapter) return null;
  return learnModules.find((module) => module.chapterIds?.includes(chapter.id)) ?? null;
}

function hashForChapter(chapterIndex: number): string {
  const chapter = chapters[chapterIndex]!;
  const module = moduleForChapterIndex(chapterIndex);
  return module ? `#/${module.id}/${chapter.id}` : `#/${chapter.id}`;
}

function hashForModule(module: LearnModule): string {
  return `#/${module.id}`;
}

function chapterProgress(chapterIndex: number): string {
  const chapter = chapters[chapterIndex];
  const module = moduleForChapterIndex(chapterIndex);
  if (!chapter || !module) return '';
  const chapterIds = module.chapterIds ?? [];
  const localIndex = chapterIds.indexOf(chapter.id);
  if (localIndex < 0) return '';
  return `Chapter ${localIndex + 1} of ${chapterIds.length}`;
}

function nextChapterLabel(chapterIndex: number): string {
  const currentModule = moduleForChapterIndex(chapterIndex);
  const nextIndex = chapterIndex + 1;
  if (!chapters[nextIndex]) return 'Modules';
  const nextModule = moduleForChapterIndex(nextIndex);
  if (currentModule && nextModule && currentModule.id !== nextModule.id) return 'Next module';
  return 'Next';
}

function legalDests(view: PlayerView): cg.Dests {
  const dests: cg.Dests = new Map();
  for (const move of view.legalMoves) {
    const list = dests.get(move.from as cg.Key) ?? [];
    list.push(move.to as cg.Key);
    dests.set(move.from as cg.Key, list);
  }
  addCastlingDestinationAliases(view, dests);
  return dests;
}

function resolveUiMove(view: PlayerView, move: Move): Move | null {
  const castlingAlias = view.legalMoves.find(
    (candidate) =>
      candidate.from === move.from && castlingKingDestinationFromView(view, candidate) === move.to,
  );
  if (castlingAlias) return castlingAlias;
  return view.legalMoves.find((candidate) => movesMatch(candidate, move)) ?? null;
}

function addCastlingDestinationAliases(view: PlayerView, dests: cg.Dests): void {
  for (const move of view.legalMoves) {
    const alias = castlingKingDestinationFromView(view, move);
    if (!alias) continue;
    const from = move.from as cg.Key;
    const current = dests.get(from) ?? [];
    if (!current.includes(alias as cg.Key)) dests.set(from, [...current, alias as cg.Key]);
  }
}

function castlingKingDestinationFromView(view: PlayerView, move: Move): Square | null {
  const piece = view.board[move.from];
  const rook = view.board[move.to];
  if (
    !piece ||
    piece.role !== 'king' ||
    !rook ||
    rook.role !== 'rook' ||
    rook.color !== piece.color
  )
    return null;
  if (rankOf(move.from) !== rankOf(move.to)) return null;
  return `${squareFileIndex(move.to) > squareFileIndex(move.from) ? 'g' : 'c'}${rankOf(move.from)}` as Square;
}

function squareFileIndex(square: Square): number {
  return boardFiles.indexOf(square[0] as (typeof boardFiles)[number]);
}

function rankOf(square: Square): string {
  return square[1] ?? '';
}

function gameStateFromBoard(id: string, board: Board): GameState {
  const chapter = chapters.find((candidate) => candidate.id === id);
  return {
    ...darkChessVariant.createInitialState(`learn-${id}`),
    board,
    status: { type: 'playing', turn: 'white' },
    castlingRights: chapter?.castlingRights ?? [],
    enPassantSquare: chapter?.enPassantSquare,
    halfmoveClock: chapter?.halfmoveClock ?? 0,
    moveNumber: chapter?.moveNumber ?? 1,
  };
}

function plannedModuleState(module: LearnModule): GameState {
  return {
    ...darkChessVariant.createInitialState(`learn-preview-${module.id}`),
    board: plannedModuleBoard(module),
    status: { type: 'playing', turn: 'white' },
    castlingRights: [],
    halfmoveClock: 0,
    moveNumber: 1,
  };
}

const researchPreviewModuleIds = new Set([
  'belief-state-basics',
  'particle-filters',
  'move-selection-under-uncertainty',
  'latent-slider-danger',
  'engine-lab-loop',
]);

function plannedModuleBoard(module: LearnModule): Board {
  if (researchPreviewModuleIds.has(module.id)) {
    return {
      e1: { color: 'white', role: 'king' },
      d2: { color: 'white', role: 'queen' },
      c3: { color: 'white', role: 'knight' },
      e4: { color: 'white', role: 'pawn' },
      a5: { color: 'black', role: 'bishop' },
      c6: { color: 'black', role: 'knight' },
      h8: { color: 'black', role: 'king' },
    };
  }
  return {
    e1: { color: 'white', role: 'king' },
    a1: { color: 'white', role: 'rook' },
    c1: { color: 'white', role: 'bishop' },
    f3: { color: 'white', role: 'knight' },
    e4: { color: 'white', role: 'pawn' },
    e5: { color: 'black', role: 'pawn' },
    c6: { color: 'black', role: 'knight' },
    h8: { color: 'black', role: 'king' },
  };
}

function moveFromUci(uci: Uci): Move {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
  };
}

function moveToUci(move: Move): Uci {
  return `${move.from}${move.to}` as Uci;
}

function movesMatch(left: Move, right: Move): boolean {
  return left.from === right.from && left.to === right.to;
}

// --- Endgames node runtime ---

const CENTER_SQUARES: Square[] = ['d4', 'd5', 'e4', 'e5'];

function handlePracticeMove(state: TutorialState, uci: Uci): void {
  const view = darkChessVariant.getPlayerView(state.activeState, 'white');
  const resolvedMove = resolveUiMove(view, moveFromUci(uci));
  if (!resolvedMove) {
    state.message = 'That move is not legal from this position.';
    render(state);
    return;
  }

  const nextState = darkChessVariant.applyMove(state.activeState, resolvedMove);
  state.activeState = {
    ...nextState,
    status: { type: 'playing', turn: 'white' },
    lastMove: resolvedMove,
  };
  state.message =
    'Move made. There is no Black move in this chapter; keep moving the king and queen to study how the fog changes.';
  render(state);
}

function findKing(board: Board, color: 'white' | 'black'): Square | null {
  for (const [square, piece] of Object.entries(board)) {
    if (piece && piece.role === 'king' && piece.color === color) return square as Square;
  }
  return null;
}

function kingNeighbors(square: Square): Square[] {
  const fileIndex = squareFileIndex(square);
  const rank = Number.parseInt(rankOf(square), 10);
  const out: Square[] = [];
  for (let df = -1; df <= 1; df += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      if (df === 0 && dr === 0) continue;
      const nf = fileIndex + df;
      const nr = rank + dr;
      if (nf < 0 || nf > 7 || nr < 1 || nr > 8) continue;
      out.push(`${boardFiles[nf]}${nr}` as Square);
    }
  }
  return out;
}

function chebyshev(a: Square, b: Square): number {
  return Math.max(
    Math.abs(squareFileIndex(a) - squareFileIndex(b)),
    Math.abs(Number.parseInt(rankOf(a), 10) - Number.parseInt(rankOf(b), 10)),
  );
}

function centerDistance(square: Square): number {
  return Math.min(...CENTER_SQUARES.map((c) => chebyshev(square, c)));
}

// Open-board lone-king defender. Keeps Chebyshev distance >= 2 from the white
// king (so White can never reach its square next move), otherwise maximizes
// distance and drifts toward the center to stay off the edge. Provably drawing
// in the open, which is the only place the play chapter uses it.
function evaderReply(gs: GameState): Move | null {
  const board = gs.board;
  const black = findKing(board, 'black');
  const white = findKing(board, 'white');
  if (!black || !white) return null;
  const empty = kingNeighbors(black).filter((sq) => !board[sq]);
  if (empty.length === 0) return null;
  const safe = empty.filter((sq) => chebyshev(sq, white) >= 2);
  const pool = safe.length > 0 ? safe : empty;
  pool.sort((a, b) => {
    const byDistance = chebyshev(b, white) - chebyshev(a, white);
    if (byDistance !== 0) return byDistance;
    return centerDistance(a) - centerDistance(b);
  });
  return { from: black, to: pool[0]! };
}

function handlePlayMove(state: TutorialState, uci: Uci): void {
  const chapter = chapters[state.chapterIndex]!;
  if (state.busy || state.playDone) return;

  const view = darkChessVariant.getPlayerView(state.activeState, 'white');
  const resolved = resolveUiMove(view, moveFromUci(uci));
  if (!resolved) {
    state.message = 'That move is not legal from this position.';
    render(state);
    return;
  }

  const afterWhite = darkChessVariant.applyMove(state.activeState, resolved);
  state.activeState = { ...afterWhite, lastMove: resolved };
  state.whiteMoves += 1;

  // White should never actually catch the evader on an open board, but guard.
  if (afterWhite.status.type !== 'playing') {
    state.playDone = true;
    state.message =
      'You caught it. On an open board that takes luck, not force. Try again and watch how it slips away.';
    render(state);
    return;
  }

  const cap = chapter.playMoveCap ?? 12;
  // Render the glimpse (the black king may now sit on a square White can see),
  // then let the defender slip back into the fog.
  state.busy = true;
  render(state);
  const chapterAtMove = chapter;
  setTimeout(() => {
    if (chapters[state.chapterIndex] !== chapterAtMove) return;
    if (state.whiteMoves >= cap) {
      state.playDone = true;
      state.busy = false;
      state.message = chapter.playCoachCap ?? 'No capture. It always slips away.';
      render(state);
      return;
    }
    const reply = evaderReply(state.activeState);
    if (reply) {
      const afterBlack = darkChessVariant.applyMove(state.activeState, reply);
      state.activeState = {
        ...afterBlack,
        status: { type: 'playing', turn: 'white' },
        lastMove: reply,
      };
    }
    state.busy = false;
    render(state);
  }, 700);
}

function advanceDemo(state: TutorialState): void {
  const chapter = chapters[state.chapterIndex]!;
  const moves = chapter.demoMoves ?? [];
  const beat = state.demoIndex;
  if (beat < moves.length) {
    const move = moveFromUci(moves[beat]!.uci);
    const applied = darkChessVariant.applyMove(state.activeState, move);
    state.activeState = { ...applied, lastMove: move };
    state.message = moves[beat]!.say;
    state.demoIndex = beat + 1;
  } else if (beat === moves.length) {
    // Conclusion beat: reset to the start position so the overlay sits on the
    // original kings.
    state.activeState = gameStateFromBoard(chapter.id, chapter.board);
    state.message = chapter.demoConclusion ?? state.message;
    state.demoIndex = beat + 1;
  } else {
    goNextChapter(state);
    return;
  }
  render(state);
}

function goNextChapter(state: TutorialState): void {
  const nextIndex = state.chapterIndex + 1;
  if (!chapters[nextIndex]) {
    showLearnHome(state);
    return;
  }
  goToChapter(state, nextIndex);
}

function endgameSquareClasses(
  view: PlayerView,
  chapter: TutorialChapter,
): cg.SquareClasses {
  const classes: cg.SquareClasses =
    chapter.mode === 'practice' || chapter.mode === 'play' || chapter.fogPreview
      ? hiddenSquareClasses(view, 'white')
      : new Map();
  const showOverlays = chapter.mode === 'teach' || chapter.mode === 'demo';
  if (showOverlays) {
    for (const sq of chapter.safePair ?? []) {
      classes.set(sq as cg.Key, `${classes.get(sq as cg.Key) ?? ''} learn-highlight`.trim());
    }
    for (const sq of chapter.unsafeSquares ?? []) {
      classes.set(sq as cg.Key, `${classes.get(sq as cg.Key) ?? ''} learn-reveal`.trim());
    }
  }
  return classes;
}

function buildEndgamePanel(state: TutorialState, chapter: TutorialChapter): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'learn-panel learn-tutorial-panel';

  const progress = document.createElement('div');
  progress.className = 'learn-progress';
  progress.textContent = chapterProgress(state.chapterIndex);

  const heading = document.createElement('h1');
  heading.className = 'learn-heading';
  heading.textContent = chapter.lesson;

  const chapterTitle = document.createElement('h2');
  chapterTitle.className = 'learn-chapter-title';
  chapterTitle.textContent = chapter.title;

  const goal = document.createElement('p');
  goal.className = 'learn-copy';
  goal.textContent = chapter.goal;

  const prompt = document.createElement('div');
  prompt.className = 'learn-tutorial-message ready';
  prompt.textContent = state.message;

  const actions = document.createElement('div');
  actions.className = 'learn-actions';

  const moves = chapter.demoMoves ?? [];
  if (chapter.mode === 'practice') {
    const hint = document.createElement('p');
    hint.className = 'learn-hint';
    hint.textContent = 'Move the White king or queen. Black has no pieces and makes no reply.';
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'landing-cta-primary';
    next.textContent = chapter.nextLabel ?? 'Next';
    next.addEventListener('click', () => goNextChapter(state));
    actions.append(hint, next);
  } else if (chapter.mode === 'play' && !state.playDone) {
    const hint = document.createElement('p');
    hint.className = 'learn-hint';
    const cap = chapter.playMoveCap ?? 12;
    hint.textContent = `Move your king. ${state.whiteMoves} of ${cap} moves used.`;
    actions.append(hint);
  } else if (chapter.mode === 'demo' && state.demoIndex <= moves.length) {
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'landing-cta-primary';
    next.textContent = state.demoIndex === 0 ? 'Begin' : 'Next';
    next.addEventListener('click', () => advanceDemo(state));
    actions.append(next);
  } else {
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'landing-cta-primary';
    next.textContent = chapter.nextLabel ?? 'Next';
    next.addEventListener('click', () => goNextChapter(state));
    actions.append(next);
  }

  panel.append(progress, heading, chapterTitle, goal, prompt, actions);
  return panel;
}

function buildNav(): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  nav.setAttribute('aria-label', 'Primary');

  const brand = document.createElement('a');
  brand.className = 'site-nav-brand';
  brand.href = '/';

  const brandLogo = document.createElement('img');
  brandLogo.className = 'site-nav-logo';
  brandLogo.src = '/logo.svg';
  brandLogo.alt = '';
  brandLogo.width = 28;
  brandLogo.height = 28;

  const brandText = document.createElement('span');
  brandText.textContent = 'MISTBOARD';
  brand.append(brandLogo, brandText);

  const links = document.createElement('div');
  links.className = 'site-nav-links';
  for (const item of primaryNavItems()) {
    links.append(navLink(item.label, item.href));
  }

  const utilities = document.createElement('div');
  utilities.className = 'site-nav-utilities';
  for (const item of utilityNavItems()) {
    utilities.append(navLink(item.label, item.href));
  }
  utilities.append(navLink('Account', '/account'));

  nav.append(brand, links, utilities);
  return nav;
}

function navLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.className = 'site-nav-link';
  link.textContent = label;
  if (currentPath() === href) {
    link.classList.add('active');
    link.setAttribute('aria-current', 'page');
  }
  return link;
}

function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

function buildFooter(): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';

  const left = document.createElement('div');
  left.className = 'site-footer-left';
  left.textContent = '© 2026 Mistboard';

  const right = document.createElement('div');
  right.className = 'site-footer-right';

  const license = document.createElement('span');
  license.textContent = 'AGPL-3.0';

  const sep = document.createElement('span');
  sep.className = 'site-footer-sep';
  sep.textContent = '·';

  const about = document.createElement('a');
  about.href = '/about';
  about.textContent = 'About';

  const sep2 = document.createElement('span');
  sep2.className = 'site-footer-sep';
  sep2.textContent = '·';

  const gh = document.createElement('a');
  gh.href = GITHUB_URL;
  gh.target = '_blank';
  gh.rel = 'noreferrer noopener';
  gh.textContent = 'GitHub';

  const source = document.createElement('a');
  source.href = '/source';
  source.textContent = 'Source';

  const sep3 = document.createElement('span');
  sep3.className = 'site-footer-sep';
  sep3.textContent = '·';

  right.append(license, sep, about, sep2, source, sep3, gh);
  footer.append(left, right);
  return footer;
}
