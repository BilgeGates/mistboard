import type { Board, Square } from '@mistboard/game';

export type Uci = `${Square}${Square}`;

export type TutorialStep = {
  teach: string;
  challenge: string;
  targets: Square[];
  afterTargets: Square[];
  accepted: Uci[];
  softFailures: Partial<Record<Uci, string>>;
  success: string;
  opponentReply?: Uci;
};

export type DemoMove = {
  by: 'white' | 'black';
  uci: Uci;
  say: string;
};

// Node kinds for the research-derived lessons (Endgames). 'legacy' chapters keep
// the original step-based tutorial behavior and leave `mode` unset.
export type ChapterMode = 'practice' | 'play' | 'demo' | 'teach' | 'superposition';
export type PlayDefender = 'open-king' | 'wandering-king';

export type TutorialChapter = {
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
  playCaptureText?: string;
  playDefeatText?: string;
  playMaterialLossText?: string;
  playMoveHint?: string;
  playDefender?: PlayDefender;
  // demo: a scripted line walked on the truth board with narration.
  demoIntro?: string;
  demoMoves?: DemoMove[];
  demoConclusion?: string;
  // teach: static position + copy.
  teachText?: string;
  // overlays (shown on the final demo beat / teach node)
  safePair?: Square[];
  unsafeSquares?: Square[];
  candidateSquares?: Square[];
  wallSquares?: Square[];
  // teach/demo chapters normally show the truth board. Some scaffold chapters
  // intentionally keep fog on to preview the eventual interaction.
  fogPreview?: boolean;
  // CTA label for advancing past this chapter.
  nextLabel?: string;
};

export type ChapterStatus = 'ready' | 'success' | 'soft-failure';

export type LearnModuleStatus = 'available' | 'wip' | 'planned';

export type LearnModuleGroup = 'WIP' | 'Exploratory';

export type LearnModule = {
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

export const learnModules: LearnModule[] = [
  {
    id: 'always-take-the-king',
    group: 'Exploratory',
    status: 'available',
    title: 'Always Take The King',
    summary:
      'Build the first dark-chess reflex: if the enemy king is visible and legal to capture, take it immediately.',
    chapterIds: [
      'king-capture-rook-file',
      'king-capture-bishop-diagonal',
      'king-capture-queen-ray',
      'king-capture-knight-jump',
      'king-capture-pawn-eye',
      'king-capture-king-step',
    ],
    cta: 'Practice king captures',
    source: 'First dark-chess beginner lesson',
  },
  {
    id: 'queen-vs-king',
    group: 'WIP',
    status: 'wip',
    title: 'K+Q vs K',
    summary:
      'Use the queen as a floodlight, keep her protected, and turn scattered hidden-king candidates into a corner net.',
    chapterIds: [
      'kqk-free-queen-vision',
      'kqk-random-king',
      'kqk-punish-scouting',
      'kqk-perfect-defender',
      'kqk-known-start-superposition',
      'kqk-superposition-corner',
    ],
    cta: 'Open queen endgame',
    source: 'Playable endgame lab from the K vs K scaffold',
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
    source: 'Engine research preview',
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
    source: 'Engine research preview',
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
    source: 'Engine research preview',
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
    source: 'Engine research preview',
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
    source: 'Engine research preview',
  },
];

export const chapters: TutorialChapter[] = [
  {
    id: 'king-capture-rook-file',
    lesson: 'Always Take The King',
    title: 'Rook on the same file',
    goal: "The black king is in your rook's sight. Capture it now.",
    board: {
      e1: { color: 'white', role: 'king' },
      h1: { color: 'white', role: 'rook' },
      h8: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach:
          'This is the first dark-chess reflex: if you see the enemy king and can capture it, ALWAYS take it. Start with the simple rook file.',
        challenge: 'Capture the king on h8.',
        targets: ['h8'],
        afterTargets: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8'],
        accepted: ['h1h8'],
        softFailures: {
          h1h7: 'Go all the way. The king is on h8, and king capture ends the game.',
          h1h2: 'Do not spend a tempo when the king is visible. Push the rook to h8.',
          h1h3: 'Do not improve first. Capture the king on h8 now.',
          h1h4: 'The rule is immediate: visible king, legal capture, take it.',
        },
        success:
          'Correct. The game ends as soon as the king is captured, so there is no better move than taking a visible king.',
      },
    ],
  },
  {
    id: 'king-capture-bishop-diagonal',
    lesson: 'Always Take The King',
    title: 'Bishop on the diagonal',
    goal: 'The bishop can see the black king on g8. Follow the diagonal and take it.',
    board: {
      e1: { color: 'white', role: 'king' },
      c4: { color: 'white', role: 'bishop' },
      g8: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach:
          'The rule is the same on diagonals. If the enemy king is on a square your bishop can reach, do not make a waiting move.',
        challenge: 'Capture the king on g8.',
        targets: ['g8'],
        afterTargets: ['c4', 'd5', 'e6', 'f7', 'g8'],
        accepted: ['c4g8'],
        softFailures: {
          c4f7: 'Keep going. The king is one more diagonal square away on g8.',
          c4e6: 'The bishop already sees the king. Finish the capture on g8.',
          c4d5: 'Do not inch forward. A visible king should be captured immediately.',
        },
        success:
          'Correct. A visible king is not a threat to announce later; it is the target to remove now.',
      },
    ],
  },
  {
    id: 'king-capture-queen-ray',
    lesson: 'Always Take The King',
    title: 'King over material',
    goal: 'The queen sees a rook and a king. Ignore the material and capture the king.',
    board: {
      e1: { color: 'white', role: 'king' },
      d3: { color: 'white', role: 'queen' },
      d8: { color: 'black', role: 'rook' },
      h7: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach:
          'Sometimes a normal chess move looks profitable. In dark chess, material is irrelevant if you can end the game by taking the king.',
        challenge: 'Capture the king on h7.',
        targets: ['h7'],
        afterTargets: ['d3', 'e4', 'f5', 'g6', 'h7'],
        accepted: ['d3h7'],
        softFailures: {
          d3d8: 'The rook can wait. Capturing the king wins immediately.',
          d3g6: 'Keep going along the diagonal. The king is on h7.',
          d3h3: 'Sideways pressure is too slow. The visible king on h7 is the move.',
        },
        success:
          'Correct. A king capture is worth more than any material capture because it ends the game.',
      },
    ],
  },
  {
    id: 'king-capture-knight-jump',
    lesson: 'Always Take The King',
    title: 'Knight jump',
    goal: 'The knight has two captures. Choose the king.',
    board: {
      e1: { color: 'white', role: 'king' },
      f5: { color: 'white', role: 'knight' },
      d6: { color: 'black', role: 'queen' },
      h6: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach:
          'Knights make the lesson easy to miss because their vision jumps. If one of those jumps lands on the king, take that square.',
        challenge: 'Capture the king on h6.',
        targets: ['h6'],
        afterTargets: ['f5', 'h6'],
        accepted: ['f5h6'],
        softFailures: {
          f5d6: 'The queen is tempting, but the king capture wins immediately.',
          f5g7: 'That is legal, but it leaves a visible king on the board.',
          f5e7: 'Do not reposition. The knight already attacks h6.',
        },
        success: 'Correct. The knight jump to h6 captures the king and ends the game.',
      },
    ],
  },
  {
    id: 'king-capture-pawn-eye',
    lesson: 'Always Take The King',
    title: 'Pawn capture eye',
    goal: 'The pawn sees the king diagonally. Capture it with the pawn.',
    board: {
      e1: { color: 'white', role: 'king' },
      e5: { color: 'white', role: 'pawn' },
      d6: { color: 'black', role: 'queen' },
      f6: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach:
          'Pawn vision is capture vision: diagonals matter. If one diagonal holds the king, that is the move.',
        challenge: 'Capture the king on f6.',
        targets: ['f6'],
        afterTargets: ['e5', 'f6'],
        accepted: ['e5f6'],
        softFailures: {
          e5d6: 'The queen is not the priority. The pawn can capture the king on f6.',
          e5e6: 'Forward is legal, but it ignores the visible king. Capture on f6.',
        },
        success: 'Correct. Even a pawn ends the game when it captures the king.',
      },
    ],
  },
  {
    id: 'king-capture-king-step',
    lesson: 'Always Take The King',
    title: 'Your king can take it too',
    goal: 'The kings are adjacent. Capture the black king with your king.',
    board: {
      e4: { color: 'white', role: 'king' },
      d5: { color: 'black', role: 'queen' },
      e5: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach:
          'Normal chess teaches you to think about check. Dark chess is simpler here: if your king can step onto the enemy king, take it.',
        challenge: 'Capture the king on e5.',
        targets: ['e5'],
        afterTargets: ['e4', 'e5'],
        accepted: ['e4e5'],
        softFailures: {
          e4d5: 'Even a queen is the wrong capture when the king is available.',
          e4f5: 'Do not dodge away. Step onto e5 and capture the king.',
          e4e3: 'The winning square is e5, not a safer-looking retreat.',
        },
        success:
          'Correct. If the enemy king is visible and your king can capture it, the game is over.',
      },
    ],
  },
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
    title: 'Queen floodlight',
    goal: 'Start with only your king and queen. Aim the queen and watch how much map one move can reveal.',
    mode: 'practice',
    teachText:
      "The queen is both a weapon and a sensor. Move her on a file, rank, or diagonal, then move the king and compare the small king bubble with the queen's long beams.",
    fogPreview: true,
    nextLabel: 'Add a hidden king',
    board: {
      d3: { color: 'white', role: 'king' },
      d4: { color: 'white', role: 'queen' },
    },
    steps: [],
  },
  {
    id: 'kqk-random-king',
    lesson: 'K+Q vs K',
    title: 'Find before chasing',
    goal: 'A lone Black king is in the fog. Use queen lines to find it before it drifts away.',
    mode: 'play',
    playDefender: 'wandering-king',
    playMoveCap: 10,
    playMoveHint: 'Move your king or queen. The hidden king will drift after each White move.',
    playCaptureText:
      'King captured. The queen found a line, and Fog rules let you take the king as soon as it is in sight.',
    playDefeatText:
      'The hidden king captured yours. The queen can search quickly, but your king still needs a safe square.',
    playMaterialLossText:
      'The hidden king took the queen. In this endgame the queen must search from squares your king can eventually support.',
    playCoachCap:
      'Ten moves, no capture. Try using the queen to cut a rank or file first; chasing with the king alone lets the defender keep slipping away.',
    teachText:
      'You do not need to know exactly where the king starts. First make the queen cover useful lines, then bring the king closer so the net can tighten.',
    fogPreview: true,
    nextLabel: 'Loose queen',
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
    title: 'Loose queen',
    goal: 'The queen is strong, but Fog does not protect her from a king she failed to respect.',
    mode: 'demo',
    demoIntro:
      'This position is shown in truth view. The queen has reached far into the fog, but the White king is nowhere near her.',
    demoMoves: [
      {
        by: 'white',
        uci: 'e2e3',
        say: 'White makes a quiet king move. The queen is still sitting alone on h6.',
      },
      {
        by: 'black',
        uci: 'g7h6',
        say: 'Black simply takes the unsupported queen. There is no check warning and no special queen immunity.',
      },
    ],
    demoConclusion:
      'Queen reach is not permission to scout carelessly. If the king cannot support the queen soon, the defender can trade the whole hunt for one capture.',
    teachText:
      'Keep the queen close enough that a king capture of the queen becomes losing for the defender on the next turn.',
    unsafeSquares: ['h6'],
    nextLabel: 'Build the box',
    board: {
      e2: { color: 'white', role: 'king' },
      h6: { color: 'white', role: 'queen' },
      g7: { color: 'black', role: 'king' },
    },
    steps: [],
  },
  {
    id: 'kqk-perfect-defender',
    lesson: 'K+Q vs K',
    title: 'Build the box',
    goal: 'Do not chase one square. Use the queen to cut space, then bring the king up behind the wall.',
    mode: 'demo',
    demoIntro:
      'A queen wins this endgame by making areas impossible, not by guessing the exact hidden square immediately.',
    demoMoves: [
      {
        by: 'white',
        uci: 'd4g4',
        say: 'The queen takes the fourth rank and points a long file upward. The board is already smaller.',
      },
      {
        by: 'black',
        uci: 'h7h8',
        say: 'The defender retreats toward the corner because crossing the queen wall would reveal too much.',
      },
      {
        by: 'white',
        uci: 'e3f4',
        say: 'Now the king follows. Queen first, king behind it: that is the shape of the net.',
      },
    ],
    demoConclusion:
      'The queen draws the boundary; the king makes the boundary matter. Keep repeating that pattern until every candidate is stuck near the edge.',
    teachText: 'Build a box before looking for the final capture.',
    wallSquares: ['g4', 'g5', 'g6', 'g7', 'g8', 'h4'],
    nextLabel: 'Known start',
    board: {
      e3: { color: 'white', role: 'king' },
      d4: { color: 'white', role: 'queen' },
      h7: { color: 'black', role: 'king' },
    },
    steps: [],
  },
  {
    id: 'kqk-known-start-superposition',
    lesson: 'K+Q vs K',
    title: 'Known start net',
    goal: 'Black starts on h8. After every White move, the possible worlds grow only from that known start.',
    mode: 'superposition',
    teachText:
      'This is the paper assumption: White knows the initial Black king square. The single king on h8 is the whole belief state; after each White move it grows to the connected hidden squares the king could have reached.',
    candidateSquares: ['h8'],
    playCaptureText:
      'All paths from the known start are gone. Under this belief model, the real Black king has no surviving hidden history.',
    nextLabel: 'Unknown start',
    board: {
      a1: { color: 'white', role: 'king' },
      b1: { color: 'white', role: 'queen' },
    },
    steps: [],
  },
  {
    id: 'kqk-superposition-corner',
    lesson: 'K+Q vs K',
    title: 'Unknown start net',
    goal: 'Every hidden square is a possible initial Black king. Move your cornered king and queen to test the stronger toy.',
    mode: 'superposition',
    teachText:
      'Each Black king is a possible world, not an extra piece. Unlike the paper setup, the initial square is unknown, so the belief state starts on every hidden square. After every White move, connected hidden worlds survive.',
    playCaptureText:
      'All candidate worlds are gone. Whichever square held the real Black king, your net has forced the capture.',
    nextLabel: 'Rook endgame',
    board: {
      a1: { color: 'white', role: 'king' },
      b1: { color: 'white', role: 'queen' },
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
