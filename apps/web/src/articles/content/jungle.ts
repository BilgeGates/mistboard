import { JUNGLE_SAMPLE_GAME } from '../../jungle-sample-game.js';
import {
  JUNGLE_LION_JUMP,
  JUNGLE_RANK_LADDER,
  JUNGLE_RAT_BLOCKS,
  JUNGLE_RAT_ELEPHANT,
  JUNGLE_RAT_SWIMS,
  JUNGLE_START_BOARD,
  JUNGLE_TRAP,
  playClosing,
} from '../diagrams.js';
import type { Article } from '../types.js';

export const jungleArticle: Article = {
  slug: 'jungle',
  kind: 'rules',
  title: 'Jungle Chess Rules',
  summary:
    "The classic Chinese animal-chess game, traditionally Dou Shou Qi (斗兽棋), on a 7×9 board. Eight ranked animals, rivers only the rat can cross, and a race to the opponent's den.",
  showSummaryOnPage: false,
  status: 'published',
  publishedAt: '2026-06-30',
  playableOnMistboard: true,
  audience:
    'Anyone who knows Jungle Chess, Dou Shou Qi, or Animal Chess and wants the rules clearly, plus chess and xiangqi players meeting it for the first time.',
  intro: [
    {
      kind: 'paragraph',
      text: 'Jungle Chess is Mistboard\'s public name for Dou Shou Qi (斗兽棋), also called Animal Chess. It is a two-player game played across much of East Asia. Each side commands eight animals of different rank. You win by marching a piece into your opponent’s den, or by capturing all of their pieces.',
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
        {
          kind: 'raw-svg',
          svg: JUNGLE_START_BOARD,
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
        {
          kind: 'raw-svg',
          svg: JUNGLE_RANK_LADDER,
          caption: 'Strongest at the left, weakest at the right.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_RAT_ELEPHANT,
        },
      ],
    },
    {
      heading: 'Traps',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Step a piece onto one of your opponent’s three trap squares and it loses all rank while it stands there, so any defending piece can take it, down to a rat capturing a trapped elephant. Only an enemy’s traps do this: a piece can sit on one of its own traps and keeps its full rank.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_TRAP,
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
          kind: 'raw-svg',
          svg: JUNGLE_RAT_SWIMS,
        },
        {
          kind: 'paragraph',
          text: 'The lion and tiger jump a river in a straight line and land on the far bank, capturing anything they outrank there. The tiger jumps vertically; the lion jumps vertically or horizontally. A rat anywhere in the water, either color, blocks the jump.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_LION_JUMP,
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_RAT_BLOCKS,
        },
      ],
    },
    {
      heading: 'Winning',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Move any piece into your opponent’s den and you win immediately. You also win by capturing every enemy piece. You can never move a piece onto your own den, so the only den you can enter is the enemy’s.',
        },
      ],
    },
    {
      heading: 'Draws',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Games draw on threefold repetition, or when 100 half-moves (50 by each player) pass with no capture.',
        },
      ],
    },
    {
      heading: 'A full game',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Step through a real game between two strengths of our bot. Watch the lion leap the river, the rat swim up the far lane and take the elephant in the open, and Red march the rest of the way into Black’s den.',
        },
        {
          kind: 'jungle-replay',
          spec: {
            red: JUNGLE_SAMPLE_GAME.red,
            black: JUNGLE_SAMPLE_GAME.black,
            event: JUNGLE_SAMPLE_GAME.event,
            outcome: JUNGLE_SAMPLE_GAME.outcome,
            resultText: JUNGLE_SAMPLE_GAME.result,
            moves: JUNGLE_SAMPLE_GAME.moves,
          },
        },
      ],
    },
    playClosing({
      heading: 'Where to next',
      lead: 'Jungle Chess is playable on Mistboard: take on Misty Jungle at the strength you pick, or challenge a friend. Flip Jungle is the small face-down cousin on a four-by-four grid.',
      playLabel: 'Play Misty Jungle',
      playHref: '/?play=computer&gameSpecId=jungle',
      secondary: [
        { label: 'Challenge a friend', href: '/?play=friend&gameSpecId=jungle', emphasis: 'secondary' },
        { label: 'Flip Jungle', href: '/rules/jungle-flip', emphasis: 'secondary' },
        { label: 'All rules', href: '/rules', emphasis: 'secondary' },
      ],
    }),
  ],
};
