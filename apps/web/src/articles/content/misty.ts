import type { Article } from '../types.js';

export const mistyArticle: Article = {
    slug: 'misty',
    kind: 'article',
    title: 'How Misty Plays',
    summary:
      "Misty is the engine you play on Mistboard, built for Fog of War chess. How it thinks, what's hard, and where it stands.",
    thumbnail: {
      kind: 'image',
      src: '/article-thumbs/misty.jpg',
      alt: 'An ethereal presence rising in mist from a chessboard — the Misty engine.',
    },
    showSummaryOnPage: false,
    status: 'published',
    publishedAt: '2026-06-21',
    audience:
      'Dark chess players and chess-engine builders curious about how the Mistboard engine works.',
    intro: [
      {
        kind: 'paragraph',
        text:
          'Misty is the bot you play on Mistboard, an engine built for Fog of War chess.',
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
              'A classical chess engine like Stockfish has one advantage: it can see the whole board. It picks its move by searching the game tree, looking ahead through the lines both sides could play and backing up the best line (minimax). The search assumes a single true position and a single true continuation.',
          },
          {
            kind: 'paragraph',
            text:
              "Under fog there is no single position to search. Misty can't see the opponent's pieces, so the board it has to reason about is really a set of boards: every arrangement consistent with what it has observed. A move that's winning on one board can hang a piece on another. So Misty weighs the whole set at once and looks for a move that holds up across it.",
          },
        ],
      },
      {
        heading: "What's hard",
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Two things. The first is the possible-board set itself. A few plies into a foggy middlegame, "every consistent board" blows up fast. Misty has to keep that uncertainty under control inside a live-game time budget.',
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
        // Strength claim is deliberately rating-free: we gate any number on a
        // human match we'd stand behind, and don't have one yet. The king-hang
        // catastrophes that earlier blocked this are fixed in the shipped default
        // (commit backstop, adaptive prune, carryover + castle-into-check), so the
        // read below is of the current prod engine. Add a number only after a human
        // match earns it; imply Obscuro-class play without claiming parity.
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Misty plays the strongest Fog of War chess we've seen. The yardstick that matters is human play, and we won't put a rating on it until a serious human match earns one.",
          },
        ],
      },
      {
        heading: "What's next",
        blocks: [
          {
            kind: 'paragraph',
            text:
              "The machinery generalizes past chess. It already plays a second game on Mistboard, Dark Mini Xiangqi, with the full-size board, Dark Xiangqi, next. New hidden-information games are mostly a matter of wiring up the rules.",
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
};
