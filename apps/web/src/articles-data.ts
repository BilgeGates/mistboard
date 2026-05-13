// Scaffolding for the three canonical articles. Each section's body is a
// placeholder pending the full draft per docs-private/articles-plan.md.
// Visual specs live in [VISUAL: ...] notes that should be replaced with
// rendered assets when sections are written.

export type ArticleSection = {
  heading: string;
  paragraphs: string[];
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

export const articles: Article[] = [
  {
    slug: 'draft960',
    title: 'Draft960: a Chess960 twist for Fog of War',
    summary:
      'Draft960 replaces the standard chess starting position with a hidden pre-game draft of Chess960 setups — killing memorized openings and composing with Fog of War’s information asymmetry.',
    status: 'outline',
    audience:
      'Chess players curious about the variant; Chess960 enthusiasts; clickthrough from the Standard-vs-Draft960 OG card.',
    tldr: [
      'Modern chess at high level is partly an opening-memorization arms race.',
      'Chess960 randomizes the back rank — 960 valid positions, no memorized theory.',
      'Draft960 takes it a step further: each player drafts their setup independently, picks are hidden until both decide. Result: asymmetric starting positions, double-blind to start.',
    ],
    sections: [
      {
        heading: 'The opening problem',
        paragraphs: [
          '[VISUAL: chart of opening theory page-count or "moves of theory before novelty" across decades. Should feel visceral.]',
          'Section TBD. Cover: modern chess as a prep arms race, memorization burden at 1800/2000/2200 levels, brief history (Walter Browne, Sicilian Najdorf, Stockfish-aided prep).',
        ],
      },
      {
        heading: 'Chess960 in one glance',
        paragraphs: [
          '[VISUAL: gallery of 12 distinctive Chess960 starting positions, annotated with their numbers.]',
          'Section TBD. Cover: Fischer’s 1996 invention, the 960 number (how it’s computed, what makes a position valid), the mirror rule (Draft960 breaks this).',
          'Sidebar candidate: Chess960 castling rules and why they trip people up.',
        ],
      },
      {
        heading: 'Why Chess960 didn’t win',
        paragraphs: [
          '[VISUAL: chart of top-played C960 positions showing how a few positions dominate and accumulate their own theory.]',
          'Section TBD. Cover: Chess960 solved the problem only partially, Fischer Random tournament scene, shared random + repeated play = new theory grows.',
        ],
      },
      {
        heading: 'Mistboard’s Draft960',
        paragraphs: [
          '[VISUAL: 4-panel diagram — offer → pick → reveal → play.]',
          'Section TBD. Cover: each player drafts independently, picks hidden until both decide, asymmetric starting positions, this is unique to Mistboard.',
        ],
      },
      {
        heading: 'The taxonomy of picks',
        paragraphs: [
          '[INTERACTIVE CENTERPIECE: pick taxonomy gallery — 8-12 Chess960 setups grouped by archetype, click/hover each for character description, strategic notes, example games.]',
          'Section TBD. Archetypes to cover: standard-leaning, bishop-pair aggressive, knight-driven, heavy-piece flank, bizarre. This is the section players will reference repeatedly.',
        ],
      },
      {
        heading: 'The composition with Fog of War',
        paragraphs: [
          '[VISUAL: first 4 moves of a Draft960+FoW game with W and B views overlaid, showing what each side learns about the other’s pick through visibility leakage.]',
          'Section TBD. Cover: each move slightly reveals back-rank silhouettes through visibility, you learn opponent’s setup gradually (like learning about hidden mid-game pieces), composition across two axes (position + visibility).',
        ],
      },
      {
        heading: 'The meta-game of picking',
        paragraphs: [
          '[VISUAL: decision tree or 2x2 of pick strategies vs opponent expectations.]',
          'Section TBD. Cover: pick what suits your style vs pick to maximize opponent confusion, close-to-standard for safety vs weird to throw them off, psychological angle (pick defensively against expected prep).',
        ],
      },
      {
        heading: 'Worked example',
        paragraphs: [
          '[INTERACTIVE CENTERPIECE: worked Draft960+FoW game stepper — 5-6 snapshots from a real game with prev/next navigation and narrative per moment.]',
          'Section TBD. Pull a dramatic Draft960+FoW game from Mistboard. Annotate each turning point.',
        ],
      },
      {
        heading: 'Try it',
        paragraphs: [
          '[VISUAL: setup dialog screenshot showing the Draft960 picker.]',
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
        paragraphs: [
          '[VISUAL: triptych — W view / truth / B view at move 0.]',
          'Section TBD. Cover: the board already looks different to each side, the first move makes nothing visible to opponent unless their pieces could attack the from-square or to-square.',
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
