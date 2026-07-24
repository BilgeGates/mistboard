import {
  FORTRESS_XIANGQI_ADVISOR_DIAGRAM,
  FORTRESS_XIANGQI_ADVISOR_DROP_DIAGRAM,
  FORTRESS_XIANGQI_CANNON_DIAGRAM,
  FORTRESS_XIANGQI_CHARIOT_DIAGRAM,
  FORTRESS_XIANGQI_ELEPHANT_DIAGRAM,
  FORTRESS_XIANGQI_ELEPHANT_DROP_DIAGRAM,
  FORTRESS_XIANGQI_GENERAL_DIAGRAM,
  FORTRESS_XIANGQI_HORSE_DIAGRAM,
  FORTRESS_XIANGQI_SOLDIER_DIAGRAM,
  FORTRESS_XIANGQI_START_BOARD,
  FORTRESS_XIANGQI_TREASURE_DIAGRAM,
} from '../../fortress-xiangqi-rules-diagrams.js';
import { playClosing } from '../diagrams.js';
import type { Article, ArticleBlock } from '../types.js';

export const fortressXiangqiArticle: Article = {
  slug: 'fortress-xiangqi',
  boardFamily: 'xiangqi',
  kind: 'rules',
  playableOnMistboard: true,
  title: 'Fortress Xiangqi Rules',
  summary:
    'A compact Xiangqi variant with captured pieces in reserve, piece drops, and one new piece: the Treasure.',
  showSummaryOnPage: false,
  status: 'published',
  publishedAt: '2026-07-01',
  updatedAt: '2026-07-23',
  audience: 'Xiangqi and crazyhouse players who want a compact, decisive drop variant.',
  thumbnail: { kind: 'svg', svg: FORTRESS_XIANGQI_START_BOARD },
  intro: [
    {
      kind: 'paragraph',
      text: 'Fortress Xiangqi is a compact [Xiangqi](/rules/xiangqi) variant designed by Brian H. Liou in 2026 as a Mistboard original. It keeps the familiar pieces, adds one new piece called the Treasure, and gives each player an open reserve. Capture an enemy piece and you can later drop it back as your own.',
    },
    {
      kind: 'paragraph',
      text: 'Captured material stays in the game, so every exchange changes both the board and the reserves. A defensive trade now may supply the attacker you need later.',
    },
  ],
  sections: [
    {
      heading: 'Board and setup',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The board is 7 files (a to g) by 8 ranks, with a river between ranks 4 and 5. Each side has a 3 by 3 palace, but the two palaces sit in opposite corners: Red holds the bottom left (a1 to c3) and Black holds the top right (e6 to g8). The whole setup has 180 degree rotational symmetry.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_START_BOARD,
          caption:
            'The starting position. Red holds the bottom-left palace, Black the top-right, and the Treasure starts on each palace corner.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'Red moves first. This is open information: both players see the whole board and both reserves.',
        },
      ],
    },
    {
      heading: 'The pieces',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The Chariot, Cannon, Horse, Elephant, Advisor, and General move as they do in [xiangqi](/rules/xiangqi). The Soldier is the one standard piece with a changed move, and the Treasure is new. In the diagrams below, a green dot marks a quiet destination, a green ring marks a capture, and a red cross marks a point the piece cannot reach.',
        },
        {
          kind: 'paragraph',
          text: '**Chariot:** slides any distance orthogonally, the strongest piece on the board. Here it can take the soldier on d7.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_CHARIOT_DIAGRAM,
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: '**Cannon:** moves like the Chariot on open lines, but captures only by jumping exactly one screen piece, friend or enemy. On the right, the cannon on d2 takes the chariot on d7 over its own soldier screen.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_CANNON_DIAGRAM,
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: '**Horse:** steps one point orthogonally, then one point diagonally outward. If the orthogonal step is occupied, that whole direction is blocked. On the right, the soldier on d5 takes away both forward destinations.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_HORSE_DIAGRAM,
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: '**Elephant:** moves exactly two points diagonally, is blocked by an occupied midpoint (the elephant eye), and can never cross the river.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_ELEPHANT_DIAGRAM,
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: '**Advisor:** moves one point diagonally and stays inside the palace.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_ADVISOR_DIAGRAM,
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: '**General:** moves one point orthogonally and stays inside the palace. One xiangqi rule retires itself here: because the palaces sit in opposite corners, the two generals never share a file, so the facing-generals rule never comes into play.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_GENERAL_DIAGRAM,
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: '**Soldier:** moves one point forward or sideways, never backward. Unlike a standard xiangqi soldier, it can move sideways from the opening move.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_SOLDIER_DIAGRAM,
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: '**Treasure:** the one new piece. It steps one point in any of the eight directions, is not confined to the palace, and never promotes. It is a flexible defender near the palace and an attacker after it advances or returns as a drop.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_TREASURE_DIAGRAM,
          caption:
            'The Treasure steps one point in any of the eight directions. Here it has eight moves, including the capture on e5.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'There are no promotions and no past-river changes. Soldiers move the same on both sides of the river; the river only stops the Elephant, which never crosses it.',
        },
      ],
    },
    {
      heading: 'Capture, hold, drop',
      blocks: [
        {
          kind: 'paragraph',
          text: 'When you capture any piece other than the General, it changes to your color and enters your reserve. Both reserves are open information, have no size limit, and keep pieces for as long as needed. On your turn, either move a piece on the board or drop one piece from your reserve onto an empty point. Generals are never captured or held in reserve.',
        },
        {
          kind: 'paragraph',
          text: 'Chariots, Horses, Cannons, Soldiers, and Treasures may drop on any empty point. Advisors and Elephants keep their normal territory restrictions.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_ADVISOR_DROP_DIAGRAM,
          caption: 'A captured Advisor drops only onto an empty point of your own palace.',
        } as ArticleBlock,
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_ELEPHANT_DROP_DIAGRAM,
          caption: 'A captured Elephant drops onto any empty point in your own half.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'A dropped piece is live immediately. A drop may give check or deliver checkmate, and a dropped Soldier can step sideways wherever it lands. The one limit is the usual one: no move, drop included, may leave your own general in check.',
        },
      ],
    },
    {
      heading: 'How games end',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Checkmate wins. A player with no legal move also loses, even when not in check. There is no fifty-move or no-progress draw.',
        },
        {
          kind: 'paragraph',
          text: 'On the third occurrence of the same position, a player who gave check on every one of their moves in the repeating cycle loses. If neither player was the sole perpetual checker, the repetition is drawn.',
        },
        {
          kind: 'paragraph',
          text: 'Games can also end by timeout, resignation, or abandonment.',
        },
      ],
    },
    {
      heading: 'A sample game',
      blocks: [
        {
          kind: 'paragraph',
          text: 'This engine game shows both uses of the reserve: an Advisor returns to defend its palace, then Red finishes with a mating Soldier drop.',
        },
        {
          kind: 'fortress-xiangqi-replay',
          spec: {
            red: 'Fairy-Stockfish',
            black: 'Fairy-Stockfish',
            event: 'Engine self-play · 450 ms per move',
            moves:
              'e1e4 b7b6 e4f4 d8f6 f2f3 c8d8 f1e3 b8c6 e3c4 c6e7 c4b6 a8b8 b6d7 b8b7 d7c5 b7c7 P@d7 c7c5 d7d8 N@c3 P@c2 c3e2 g1e1 c5e5 C@a8 e7c6 d8e8 f8e8 a8g8 e8f8 T@d6 e5e4 d6c6 f8g8 f4f7 f6d8 A@b3 P@a3 c6d5 e4e7 a2a3 C@a6 f7f4 a6a1 P@f8 g8f8 P@f7 f8g8 f7e7 e2f4 R@e8 P@f8 N@f6 C@f7 e8f8 g8f8 e7e8 f8g8 P@f8',
            resultText:
              'Red checkmates with the soldier drop P@f8. The dropped soldier attacks the general from the side, the soldier on e8 guards the drop point, and Black\'s own cannon and soldier block the escape squares.',
          },
        } as ArticleBlock,
      ],
    },
    playClosing({
      heading: 'Play on Mistboard',
      lead: 'Fortress Xiangqi is playable on Mistboard. Play against an engine or challenge a friend. No account required.',
      playLabel: 'Play vs computer',
      playHref: '/?play=computer&gameSpecId=fortress-xiangqi',
      secondary: [
        {
          label: 'Challenge a friend',
          href: '/?play=friend&gameSpecId=fortress-xiangqi',
          emphasis: 'secondary',
        },
      ],
    }),
  ],
};
