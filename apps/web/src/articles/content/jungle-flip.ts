import type { Article, ArticleBlock } from '../types.js';

export const jungleFlipArticle: Article = {
  slug: 'jungle-flip',
  kind: 'rules',
  title: 'Flip Jungle (兽棋)',
  summary:
    'The 4×4 flip version of Jungle. Every animal starts face-down, you flip to reveal, and equal ranks trade off the board.',
  showSummaryOnPage: false,
  status: 'draft',
  playableOnMistboard: false,
  audience:
    'Jungle players who want the flip variant, and anyone who grew up playing 翻翻棋 on a chalk grid.',
  intro: [
    {
      kind: 'paragraph',
      text: 'Flip Jungle (兽棋, also 翻翻棋) is the small, fast cousin of [Jungle](/rules/jungle). The same eight animals per side, shuffled face-down on a four-by-four grid, identities hidden until you turn them over. It is a casual favorite played on chalk grids and phone screens across China. No rivers, no dens, no traps, just the animals, the rank ladder, and a gamble on what sits under each tile.',
    },
  ],
  sections: [
    {
      heading: 'Setup',
      blocks: [
        {
          kind: 'paragraph',
          text: 'All sixteen pieces, one of each animal in two colors, are shuffled and placed face-down on the sixteen squares. Nobody knows which animal or which color sits under a tile until it is flipped. The first tile you flip sets your color for the rest of the game.',
        },
      ],
    },
    {
      heading: 'A turn',
      blocks: [
        {
          kind: 'paragraph',
          text: 'On your turn you either flip one face-down tile to reveal it, or move one of your own revealed animals one square up, down, left, or right. Early on, before pieces come up, flipping is all you can do.',
        },
      ],
    },
    {
      heading: 'Capturing',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Capture an adjacent enemy you outrank, with the same rat-beats-elephant exception as the full game. Equal ranks work differently here. When an animal meets an enemy of its own rank, both leave the board (同归于尽, “they perish together”), and neither side keeps the square. Because identities stay hidden until contact, every attack is a bet, and the mutual-destruction rule raises the price of guessing wrong.',
        },
      ],
    },
    {
      heading: 'Winning',
      blocks: [
        {
          kind: 'paragraph',
          text: 'You win when your opponent has nothing left to do: no piece to move and no tile to flip. In practice that means capturing or trading away everything they have.',
        },
      ],
    },
    {
      heading: 'Draws',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Games draw on threefold repetition, or after a long run with no flip and no capture.',
        },
      ],
    },
    {
      heading: 'Play status',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Flip Jungle is in development on Mistboard and not yet open for play. No set release date.',
        },
        {
          kind: 'cta',
          buttons: [{ label: 'Back to all rules', href: '/rules', emphasis: 'secondary' }],
        } as ArticleBlock,
      ],
    },
  ],
};
