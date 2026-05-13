// Stub content for canonical articles. Bodies are draft outlines —
// rewrite each section's paragraphs in place to produce the published version.

export type ArticleSection = {
  heading: string;
  paragraphs: string[];
};

export type Article = {
  slug: string;
  title: string;
  summary: string;
  status: 'draft' | 'published';
  audience: string;
  sections: ArticleSection[];
};

export const articles: Article[] = [
  {
    slug: 'draft960',
    title: 'Draft960: a Chess960 twist for Fog of War',
    summary:
      'Draft960 replaces the standard chess starting position with a pre-game draft of Chess960 setups, kept hidden from the opponent — killing memorized openings and composing naturally with Fog of War.',
    status: 'draft',
    audience: 'Chess players curious about the variant; clickthrough from the Standard-vs-Draft960 OG card.',
    sections: [
      {
        heading: 'The problem with standard openings',
        paragraphs: [
          'Modern chess at any serious level is partly an opening-memorization arms race. At club level, whoever knows their Sicilian deeper wins moves 1-15. This rewards study time, not chess strength.',
          'The board itself is fine. What rots the genre is the prep — a player who has lived inside a particular opening for years has an advantage that doesn’t come from out-calculating the opponent, just from having seen this position before.',
        ],
      },
      {
        heading: 'Chess960 in 60 seconds',
        paragraphs: [
          'Bobby Fischer’s 1996 fix was to randomize the back rank. There are 960 valid starting positions — bishops must sit on opposite colors, the king must sit between the rooks, pawns stay on rank 2, and both sides mirror.',
          'Theory becomes useless. Calculation and position evaluation take over. The drawback is that over time, the most-played Chess960 positions accumulate their own theory.',
        ],
      },
      {
        heading: 'Mistboard’s Draft960 twist',
        paragraphs: [
          'Instead of a single shared random position, each player drafts. The server offers a small set of valid Chess960 setups; each player picks one — that becomes their starting back rank.',
          'The picks stay hidden until both have decided. You don’t know what your opponent chose, and they don’t know what you chose. The first few moves reveal piece silhouettes through visibility, the same way pieces emerge from fog mid-game.',
        ],
      },
      {
        heading: 'Why hide the picks',
        paragraphs: [
          'Hiding the draft composes with Fog of War’s information asymmetry. It also adds a pre-game meta-layer: pick the setup you understand best, knowing your opponent doesn’t know what you picked.',
          'A player who has spent time with unusual piece configurations can lean into them; a player who wants something close to standard can pick a setup that resembles a familiar opening. Neither knows what the other is doing until the game starts.',
        ],
      },
      {
        heading: 'Strategy implications',
        paragraphs: [
          'Memorization is structurally impossible. Position evaluation skill becomes the dominant variable.',
          'The pick itself matters. Do you go familiar — closer to standard — or weird, to maximize asymmetry against an opponent who might have prepped one specific Chess960 line?',
        ],
      },
      {
        heading: 'Try it',
        paragraphs: [
          'During beta, Draft960 is available via friend-invite. Create a private room with the Draft960 variant selected, share the link, and play.',
        ],
      },
    ],
  },
  {
    slug: 'fog-of-war-rules',
    title: 'Fog of War chess: the rules',
    summary:
      'Regular chess with one rule change — you only see what your pieces can legally see — and one consequence change — captured kings end the game, not checkmate.',
    status: 'draft',
    audience: '1000-2200 chess players who landed from outreach or the OG card and want to understand the variant in 5 minutes.',
    sections: [
      {
        heading: 'The one-rule version',
        paragraphs: [
          'You see your own pieces and every square those pieces could legally move to. That’s it.',
          'At the start of a game, that means ranks 1-4 are visible to White and the rest of the board is dark. Visibility recomputes after every move. As your pieces advance, your sight shifts.',
        ],
      },
      {
        heading: 'What changes about play',
        paragraphs: [
          'You don’t see opponent pieces unless they’re sitting on a square one of your pieces could move to. A black pawn defended by another black piece on a square you don’t attack is invisible to you.',
          'Scouting becomes a thing. Pushing a piece forward gives sight of new ranks and diagonals. Some moves are worth making just for the information they buy.',
        ],
      },
      {
        heading: 'The win condition: king capture, not checkmate',
        paragraphs: [
          'Standard chess: checkmate ends the game. Fog of War: actually capturing the king ends it.',
          'This is a meaningful difference. You can move your king into an attack you can’t see. You can leave it attacked and not know. If you spot the opponent’s king, you can try to take it — and if you miss, they get to respond.',
        ],
      },
      {
        heading: 'How it differs from Kriegspiel and RBC',
        paragraphs: [
          'Kriegspiel (1700s) uses an umpire who tells you when you’ve captured something or when your king is in check. Fog of War has no umpire — you just see what your pieces can see.',
          'Reconnaissance Blind Chess (RBC) has an explicit "scan" action before each move. Fog of War’s scouting is implicit in piece movement.',
          'The rule surface in Fog of War is the cleanest of the three. It’s the most natural extension of standard chess to hidden information.',
        ],
      },
      {
        heading: 'Practical first-game advice',
        paragraphs: [
          'Develop pieces forward early. The information you gain is often worth more than the position you’d hold by waiting.',
          'Don’t assume you’re safe. Your king may be attacked by a piece you can’t see.',
          'When in doubt, try to capture the king. A missed capture costs you a tempo. A successful one wins the game.',
          'After the game, the reveal mode shows the full board. Use it to see what you missed.',
        ],
      },
      {
        heading: 'Try it',
        paragraphs: [
          'Click "Find opponent" on the homepage to enter the casual queue, or start a friend-invite challenge.',
        ],
      },
    ],
  },
  {
    slug: 'engine-belief-state',
    title: 'Building an engine for hidden-information chess',
    summary:
      'Stockfish-class engines don’t transfer to Fog of War because they assume perfect information. The relevant technique is belief-state search with particle-filter approximations.',
    status: 'draft',
    audience: 'Chess engine developers, AI/ML people, software engineers curious about belief-state methods.',
    sections: [
      {
        heading: 'Why Stockfish doesn’t work',
        paragraphs: [
          'Alpha-beta search assumes a single ground-truth position to evaluate. Stockfish’s heuristics — piece values, mobility, king safety — all assume you can see the board.',
          'In Fog of War, "the board" isn’t a single position. It’s a distribution over every possible truth consistent with what you’ve observed. Search trees explode if you naively enumerate them.',
        ],
      },
      {
        heading: 'Belief state: the right abstraction',
        paragraphs: [
          'A belief state is a probability distribution over true game states. It’s constrained by everything you’ve observed: each visible square narrows the set, and every move you’ve made constrains where opponent pieces can be.',
          'At move 1 the belief is huge. Mid-game it concentrates as observations accumulate. Late-game it can collapse to one or two possibilities — at which point the engine plays close to optimally.',
        ],
      },
      {
        heading: 'Particle filters: a tractable approximation',
        paragraphs: [
          'Maintain N candidate positions ("particles") that are consistent with your observations. Each turn, replay the latest observations through each particle, drop those that no longer fit, and resample to refill the population.',
          'For move selection, simulate candidate moves on the particle set and aggregate expected outcomes. More particles → better belief, more compute per move. The trade-off is the central engineering knob.',
        ],
      },
      {
        heading: 'The RBC family',
        paragraphs: [
          'Reconnaissance Blind Chess (RBC) is the academic neighbor. Public engines include StrangeFish (CMU), ReBeL (Facebook AI Research), and Penumbra (Georgia Tech).',
          'Obscuro (CMU, February 2026) is the first published superhuman FOW chess engine — closed source. It establishes the technical upper bound. Most of the methods that transfer are particle-filter variants, opponent move-distribution learning, and sensing-policy networks.',
        ],
      },
      {
        heading: 'What Mistboard’s engine currently does',
        paragraphs: [
          'Open-source under GPL-3, runs in-room as a PvE opponent. The current implementation is a particle filter with a Tier-1 strategy — basic move selection over the particle set.',
          'Status: beatable but coherent. Not yet competitive with humans at 2000+ chess Elo. Roadmap: deeper search, opponent modeling, scaled particle counts.',
        ],
      },
      {
        heading: 'Plug your own engine in (planned)',
        paragraphs: [
          'FUCI — Fog UCI — is a planned protocol for external engine authors. It plays the role UCI plays for Stockfish, Lc0, and friends in regular chess. The aim is a public ladder for FOW engines, with Mistboard as the play surface and arbiter.',
        ],
      },
      {
        heading: 'How to contribute',
        paragraphs: [
          'The repo is at github.com/brianhliou/mistboard. Engine code lives under apps/server (Tier-1 strategy) and the research sidecar is in research/python-fow-lab.',
        ],
      },
    ],
  },
];

export function findArticle(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}
