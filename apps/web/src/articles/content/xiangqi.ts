import {
  playClosing,
  XQ_PRIMER_ADVISOR_BOARD,
  XQ_PRIMER_CANNON_PAIR,
  XQ_PRIMER_CHARIOT_BOARD,
  XQ_PRIMER_ELEPHANT_PAIR,
  XQ_PRIMER_FACING_PAIR,
  XQ_PRIMER_GENERAL_BOARD,
  XQ_PRIMER_HORSE_PAIR,
  XQ_PRIMER_SOLDIER_PAIR,
  XQ_RULES_PRIMER_START_BOARD,
  XQ_RULES_PRIMER_THUMBNAIL,
} from '../diagrams.js';
import type { Article, ArticleBlock } from '../types.js';

export const xiangqiArticle: Article = {
    slug: 'xiangqi',
    boardFamily: 'xiangqi',
    kind: 'rules',
    playableOnMistboard: true,
    title: 'Xiangqi Rules',
    summary:
      'The rules of xiangqi (Chinese chess): palaces, the river, cannon screens, facing generals, and a famous game to play through. Now playable on Mistboard against the Pikafish engine or a friend.',
    showSummaryOnPage: false,
    status: 'published',
    publishedAt: '2026-05-26',
    updatedAt: '2026-07-04',
    audience:
      'Players new to xiangqi, and chess players who want to learn Chinese chess and play it on Mistboard.',
    thumbnail: { kind: 'svg', svg: XQ_RULES_PRIMER_THUMBNAIL },
    intro: [
      {
        kind: 'paragraph',
        text:
          '[Xiangqi](https://en.wikipedia.org/wiki/Xiangqi), or Chinese chess, is a two-player strategy game with roots in China going back many centuries. Its modern form, including the cannon, took shape around the Song dynasty (960 to 1279).',
      },
      {
        kind: 'paragraph',
        text:
          'Red and Black alternate moves, with Red first. Each side begins with 16 pieces: one general, two advisors, two elephants, two horses, two chariots, two cannons, and five soldiers. The goal is to checkmate the opposing general.',
      },
    ],
    sections: [
      {
        heading: 'The board',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The board has 9 files and 10 ranks, but pieces sit on the intersections of the lines, not inside squares.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_RULES_PRIMER_START_BOARD,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              'The **palace** is the 3 by 3 box on each player\'s back side. Generals and advisors must stay inside their own palace. The **river** divides the board in half. Elephants cannot cross it, and soldiers gain sideways movement after crossing it.',
          },
        ],
      },
      {
        heading: 'The pieces',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'A piece captures by landing on an enemy-occupied point, and no piece may move through an occupied point. The cannon\'s capturing jump is the only exception. The pieces are listed below in the traditional order.',
          },
          {
            kind: 'paragraph',
            text:
              '**General:** moves one point horizontally or vertically and can never leave its own palace. The two generals may never face each other along an open file with nothing between them: a move that would expose that line is illegal. In effect, a general guards the file in front of it like a chariot.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_PRIMER_GENERAL_BOARD,
          } as ArticleBlock,
          {
            kind: 'raw-svg',
            svg: XQ_PRIMER_FACING_PAIR,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Advisor:** moves one point diagonally and, like the general, stays inside the palace.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_PRIMER_ADVISOR_BOARD,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Elephant:** moves exactly two points diagonally and cannot cross the river, so it never leaves its own half. It does not jump: a piece on the midpoint of the diagonal, the elephant\'s eye, blocks the move.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_PRIMER_ELEPHANT_PAIR,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Horse:** moves one point orthogonally and then one point diagonally outward, like a chess knight, but it does not jump. If the orthogonal point it steps through, the horse\'s leg, is occupied, the horse cannot move in that direction.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_PRIMER_HORSE_PAIR,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Chariot:** moves any distance horizontally or vertically and cannot jump, exactly like a rook. It is the strongest piece on the board.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_PRIMER_CHARIOT_BOARD,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Cannon:** moves like a chariot when it is not capturing. To capture, it jumps over exactly one piece, friend or foe, called the screen, and lands on an enemy piece beyond it.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_PRIMER_CANNON_PAIR,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Soldier:** moves one point straight forward and never backward. After crossing the river it may also move one point sideways. It never promotes.',
          },
          {
            kind: 'raw-svg',
            svg: XQ_PRIMER_SOLDIER_PAIR,
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Check, checkmate, and endings',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'A general is in check when an enemy piece attacks it, and the player in check must answer the threat. If there is no legal answer, it is checkmate and the checked player loses.',
          },
          {
            kind: 'paragraph',
            text:
              'A player who has no legal move at all also loses. This is the opposite of Western chess, where having no legal move is a stalemate draw.',
          },
          {
            kind: 'paragraph',
            text:
              'Xiangqi also restricts endless forcing cycles. Perpetual check and perpetual chase are not allowed: a player who repeats an endless attack loses rather than forcing a draw. Tournament rules spell out detailed repetition procedures for exactly when a cycle counts as perpetual.',
          },
          {
            kind: 'paragraph',
            text:
              'A game is drawn when neither side has enough material to checkmate, by a repetition that breaks none of those rules, or when a long run of moves passes with no capture. The no-capture limit depends on the rule set: the World Xiangqi Federation rules use a fifty-move rule, while the Chinese (CXA) rules require at least sixty plies before a draw can be claimed.',
          },
        ],
      },
      {
        heading: 'A famous game',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'To see the pieces work together in a real game, step through this 1990 championship between two of xiangqi\'s greatest grandmasters. Playing Black, Liu Dahua checkmates Hu Ronghua, the most dominant champion of the era, in 31 moves.',
          },
          {
            kind: 'xq-replay',
            spec: {
              iccs: 'h2e2 h9g7 h0g2 i9h9 c3c4 g6g5 b0c2 c9e7 i0i1 b9c7 i1f1 h7i7 f1f4 d9e8 b2a2 a9b9 a0b0 h9h3 e2d2 h3g3 c0e2 g5g4 f4g4 g3g4 e2g4 b7b5 g4e2 g7f5 b0b4 c6c5 c4c5 e7c5 a3a4 c5e7 d0e1 b9d9 a2a0 i7f7 a0d0 d9b9 g2f4 b5c5 b4b9 c7b9 f4d5 b9c7 c2b4 c7d5 b4d5 c5c1 d2a2 c1a1 e2c4 f7g7 d0d1 g7g5 d5b6 g5g8 a2e2 f5g7 i3i4 g8g0',
              red: 'Hu Ronghua',
              black: 'Liu Dahua',
              event: '5 Ram Cup, 1990',
              resultText: 'Checkmate. Liu Dahua (Black) defeats Hu Ronghua.',
            },
          } as ArticleBlock,
        ],
      },
      playClosing({
        heading: 'Play it',
        lead: 'Xiangqi is live on Mistboard. Play the Pikafish engine at three strengths, or challenge a friend. For a twist, add Fog of War for dark xiangqi, where enemy pieces outside your vision disappear and the general falls by capture.',
        playLabel: 'Play Xiangqi',
        playHref: '/?play=computer&gameSpecId=xiangqi',
        secondary: [
          { label: 'Challenge a friend', href: '/?play=friend&gameSpecId=xiangqi', emphasis: 'secondary' },
          { label: 'Dark Xiangqi', href: '/rules/dark-xiangqi', emphasis: 'secondary' },
          { label: 'All rules', href: '/rules', emphasis: 'secondary' },
        ],
      }),
    ],
};
