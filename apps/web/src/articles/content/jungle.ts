import type { Article, ArticleBlock } from '../types.js';

export const jungleArticle: Article = {
  slug: 'jungle',
  kind: 'rules',
  title: 'Jungle (Dou Shou Qi)',
  summary:
    "The classic Chinese animal-chess game on a 7×9 board. Eight ranked animals, rivers only the rat can cross, and a race to the opponent's den.",
  showSummaryOnPage: false,
  status: 'draft',
  playableOnMistboard: false,
  audience:
    'Anyone who knows Jungle / Animal Chess and wants the rules clearly, plus chess and xiangqi players meeting it for the first time.',
  intro: [
    {
      kind: 'paragraph',
      text: 'Jungle, also called Dou Shou Qi (斗兽棋) or Animal Chess, is a two-player game played across much of East Asia. Each side commands eight animals of different rank. You win by marching a piece into your opponent’s den, or by capturing all of their pieces.',
    },
    {
      kind: 'paragraph',
      text: 'Three rules give the game its character: the rat captures the elephant, only the rat can swim, and the lion and tiger leap the rivers.',
    },
  ],
  sections: [
    {
      heading: 'The board',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Seven files wide, nine ranks deep. Your den sits at the center of your back rank, ringed by three trap squares. Two rivers, each a 2×3 block of water, split the middle of the board, with land lanes down both edges and the center. Every piece moves one square up, down, left, or right. No diagonals.',
        },
      ],
    },
    {
      heading: 'The animals',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Strongest to weakest: elephant, lion, tiger, leopard, wolf, dog, cat, rat. A piece captures any adjacent enemy of equal or lower rank. The exception runs the other way: the rat captures the elephant, and the elephant can never capture the rat.',
        },
      ],
    },
    {
      heading: 'Traps',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Step a piece onto one of your opponent’s three trap squares and it loses all rank while it stands there. Any defending piece can take it, down to a rat capturing a trapped elephant. Your own traps never weaken your pieces.',
        },
      ],
    },
    {
      heading: 'The rivers',
      blocks: [
        {
          kind: 'paragraph',
          text: "Only the rat enters the water. A rat in the river is safe from every land piece and can be taken only by another rat in the water. It also can't capture from the water onto land, so the rat needs dry ground to take the elephant.",
        },
        {
          kind: 'paragraph',
          text: 'The lion and tiger jump a river in a straight line and land on the far bank, capturing anything they outrank there. The tiger jumps vertically; the lion jumps vertically or horizontally. A rat anywhere in the water, either color, blocks the jump.',
        },
      ],
    },
    {
      heading: 'Winning',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Move any piece into your opponent’s den and you win immediately. You also win by capturing every enemy piece. You can never enter your own den.',
        },
      ],
    },
    {
      heading: 'Draws',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Games draw on threefold repetition, or after a long run with no capture.',
        },
      ],
    },
    {
      heading: 'Play status',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Jungle is in development on Mistboard and not yet open for play. No set release date.',
        },
        {
          kind: 'cta',
          buttons: [{ label: 'Back to all rules', href: '/rules', emphasis: 'secondary' }],
        } as ArticleBlock,
      ],
    },
  ],
};
