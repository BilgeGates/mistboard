import { JUNGLE_SAMPLE_GAME } from '../../jungle-sample-game.js';
import {
  JUNGLE_LION_JUMP,
  JUNGLE_RANK_LADDER,
  JUNGLE_RAT_BLOCKS,
  JUNGLE_RAT_ELEPHANT,
  JUNGLE_RAT_SWIMS,
  JUNGLE_START_BOARD,
  JUNGLE_TIGER_JUMP,
  JUNGLE_TRAP,
  playClosing,
} from '../diagrams.js';
import type { Article } from '../types.js';

export const jungleArticle: Article = {
  slug: 'jungle',
  kind: 'rules',
  title: 'Jungle Chess Rules',
  summary:
    "The classic animal-chess game on a 7 by 9 board. Eight ranked animals, rivers only the rat can cross, and a race to the opponent's den.",
  showSummaryOnPage: false,
  status: 'published',
  publishedAt: '2026-06-30',
  updatedAt: '2026-07-23',
  playableOnMistboard: true,
  audience:
    'Experienced Jungle Chess players who want a clear reference, plus chess and xiangqi players meeting it for the first time.',
  intro: [
    {
      kind: 'paragraph',
      text: 'Jungle Chess is a two-player strategy game about rank and terrain. Each side commands eight animals and tries to reach the enemy den or eliminate the enemy army.',
    },
    {
      kind: 'paragraph',
      text: 'Three rules give the game its character: the rat captures the elephant, only the rat can swim, and the lion and tiger leap the rivers.',
    },
  ],
  sections: [
    {
      heading: 'Board and setup',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The board is seven files wide and nine ranks deep. Your den sits at the center of your back rank, ringed by three trap squares. Two rivers, each a 2×3 block of water, split the middle of the board. Red moves first from the fixed starting position below.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_START_BOARD,
        },
      ],
    },
    {
      heading: 'How the animals move',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Every animal moves one square up, down, left, or right. Animals never move diagonally. Most animals stay on land, so they cannot enter a river. The rat, lion, and tiger are the three movement exceptions.',
        },
        { kind: 'sub-heading', text: 'Rat' },
        {
          kind: 'paragraph',
          text: 'The rat is the only animal that can enter water. A rat in a river can move and capture another rat there, but no piece can capture across the shoreline: a land rat cannot capture into water, and a water rat cannot capture onto land.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_RAT_SWIMS,
        },
        { kind: 'sub-heading', text: 'Lion' },
        {
          kind: 'paragraph',
          text: 'The lion can move one land square normally, or leap straight across a river horizontally or vertically. It lands on the first square beyond the water and may capture an animal there if rank allows.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_LION_JUMP,
        },
        { kind: 'sub-heading', text: 'Tiger' },
        {
          kind: 'paragraph',
          text: 'The tiger can move one land square normally or leap vertically across a river. Unlike the lion, it cannot leap horizontally. A rat of either color on any water square in the path blocks either animal’s jump.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_TIGER_JUMP,
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_RAT_BLOCKS,
          caption: 'A rat in the river blocks the leap.',
        },
      ],
    },
    {
      heading: 'Ranks and captures',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Each side has the same eight animals. Strongest to weakest: elephant, lion, tiger, leopard, wolf, dog, cat, rat. A piece captures an adjacent enemy of equal or lower rank.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_RANK_LADDER,
          caption: 'Strongest at the left, weakest at the right.',
        },
        {
          kind: 'paragraph',
          text: 'The rank exception connects the ends of the ladder: a rat on land can capture an elephant, while an elephant cannot capture a rat.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_RAT_ELEPHANT,
          caption: 'On land, the lowest-ranked rat can capture the highest-ranked elephant.',
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
      heading: 'Winning and draws',
      blocks: [
        {
          kind: 'paragraph',
          text: 'You win immediately by moving any piece into the enemy den, capturing every enemy piece, or leaving your opponent with no legal move. You cannot move into your own den.',
        },
        {
          kind: 'paragraph',
          text: 'Games draw on threefold repetition, or when 100 half-moves (50 by each player) pass with no capture.',
        },
      ],
    },
    {
      heading: 'A sample game',
      blocks: [
        {
          kind: 'paragraph',
          text: 'This engine game shows a lion leap, a rat swim and capture an elephant, and the final entry into Blue’s den.',
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
      heading: 'Play on Mistboard',
      lead: 'Jungle Chess is playable on Mistboard. Play against an engine or challenge a friend. No account required.',
      playLabel: 'Play vs computer',
      playHref: '/?play=computer&gameSpecId=jungle',
      secondary: [
        { label: 'Challenge a friend', href: '/?play=friend&gameSpecId=jungle', emphasis: 'secondary' },
      ],
    }),
  ],
};
