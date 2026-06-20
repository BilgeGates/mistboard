import { BANQI_CONVERSION_GAME } from '../../banqi-engine-game.js';
import { BANQI_RULES_THUMBNAIL, playClosing } from '../diagrams.js';
import type { Article } from '../types.js';

// Player-facing companion to the Banqi rules page: how the engine you play
// actually works, and one honest blind spot you can use. The full engineering
// writeup (how each pathology was found and measured) lives on the author's
// blog; this page is the short, playable version. Sibling of the Misty (Fog of
// War) engine article.

export const banqiEngineArticle: Article = {
  slug: 'mistybanqi',
  kind: 'article',
  boardFamily: 'xiangqi',
  title: 'How MistyBanqi Plays',
  summary:
    'MistyBanqi is the engine you play in Banqi on Mistboard: a classical search engine with a hand-written evaluation. How it thinks, and the one blind spot worth knowing — it can draw a game it has already won.',
  showSummaryOnPage: false,
  status: 'draft',
  publishedAt: '2026-06-20',
  audience:
    'Banqi players curious about the bot they play against, and anyone who wants to know where a hand-written engine cracks.',
  thumbnail: { kind: 'svg', svg: BANQI_RULES_THUMBNAIL },
  intro: [
    {
      kind: 'paragraph',
      text:
        'MistyBanqi is the bot you play in [Banqi](/rules/banqi) on Mistboard. It is a classical engine: it searches ahead and scores positions with a hand-written evaluation, with no neural network, and it is open source. It will outplay most people. It also has a few honest blind spots, and the most useful one to know is that it can draw a game it has completely won.',
    },
  ],
  sections: [
    {
      heading: 'How it thinks',
      blocks: [
        {
          kind: 'paragraph',
          text:
            "Banqi hides information in its own particular way: every tile starts face-down, and flipping one reveals a random piece from the bag of what is left. So unlike chess, the engine's search tree mixes ordinary moves with chance events. MistyBanqi treats a flip as a chance node — it averages over the pieces the tile might turn out to be — and otherwise searches the way a classical chess engine does, looking ahead through the lines both sides could play and backing up the value of the best one.",
        },
        {
          kind: 'paragraph',
          text:
            'What it cannot do is judge a position by feel. Every leaf of that search is scored by a hand-written evaluation: material on a corrected value table (the cannon, which captures by jumping a screen, is the most dangerous piece on the board), how many squares each piece controls, how exposed the general is, and a handful of other terms. The engine is exactly as good as those terms are — which is the root of the weakness below.',
        },
      ],
    },
    {
      heading: 'It can draw a game it has won',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Step through a real game MistyBanqi played as Red. It reaches a position up ten pieces to two — there is nothing left to play for — and then draws it. Tiles flip to their dealt piece the first time they are turned over.',
        },
        {
          kind: 'banqi-replay',
          spec: {
            red: BANQI_CONVERSION_GAME.red,
            black: BANQI_CONVERSION_GAME.black,
            event: BANQI_CONVERSION_GAME.event,
            outcome: BANQI_CONVERSION_GAME.outcome,
            resultText: BANQI_CONVERSION_GAME.result,
            deal: BANQI_CONVERSION_GAME.deal,
            moves: BANQI_CONVERSION_GAME.moves,
          },
        },
        {
          kind: 'paragraph',
          text:
            'Nothing in the evaluation rewards converting a won position over simply holding material, so a position the engine is winning by a mile and a position it has actually won score about the same. With no term pushing it to make progress, it shuffles, and Banqi’s threefold-repetition rule ends the game a draw.',
        },
        {
          kind: 'paragraph',
          text:
            'The practical upshot for you: if you are losing on material, you are not necessarily lost. Herd one of its strong pieces into a perpetual chase, and MistyBanqi may walk into the draw it cannot see it should decline.',
        },
      ],
    },
    {
      heading: 'It can also lose its own general',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'A related blind spot: a soldier is the only piece that can capture the general, and the engine can be slow to make room for a general getting boxed into a corner — sometimes marching a piece off to the far side of the board while a lone enemy soldier walks up and traps it. It is the same kind of gap as the draw above: the evaluation has no strong sense of a slow, quiet threat building several moves away.',
        },
        {
          kind: 'paragraph',
          text:
            'The full set of these pathologies — how each one was found, reproduced, and measured — is written up in detail in the engineering post linked below.',
        },
      ],
    },
    {
      heading: 'Why these exist, and what’s next',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'These are the limits of a hand-written evaluation: it can only value what someone thought to encode, and conversion and slow king-hunts are exactly the long-horizon judgments that are hard to write down. The fix the strongest Dark Chess programs use is a learned evaluation, trained from game outcomes, which lets the engine judge these on its own. That is the eventual next step for MistyBanqi; until a learned version clears the current engine’s bar in testing, the hand-written one is what you play — strong, fast, and honest about where it cracks.',
        },
      ],
    },
    playClosing({
      heading: 'Play it',
      lead: 'MistyBanqi is live on Mistboard: take it on at the strength you pick, or read the full engineering writeup of how it was built and measured.',
      playLabel: 'Play MistyBanqi',
      playHref: '/?play=computer&gameSpecId=banqi',
      secondary: [
        {
          label: 'The engineering story',
          href: 'https://brianhliou.com/posts/tuning-a-banqi-engine/',
          emphasis: 'secondary',
          external: true,
        },
        { label: 'Banqi Rules', href: '/rules/banqi', emphasis: 'secondary' },
        { label: 'How Misty Plays', href: '/articles/misty', emphasis: 'secondary' },
        { label: 'All rules', href: '/rules', emphasis: 'secondary' },
      ],
    }),
  ],
};
