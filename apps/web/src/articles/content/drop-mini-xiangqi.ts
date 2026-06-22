import type { Article, ArticleBlock } from '../types.js';

export const dropMiniXiangqiArticle: Article = {
  slug: 'drop-mini-xiangqi',
  boardFamily: 'xiangqi',
  kind: 'rules',
  playableOnMistboard: true,
  title: 'Drop Mini Xiangqi Rules',
  summary:
    'Mini Xiangqi with reserves: captured pieces enter your hand, then drop back outside the enemy palace.',
  showSummaryOnPage: false,
  status: 'published',
  publishedAt: '2026-06-21',
  updatedAt: '2026-06-22',
  audience:
    'Mini Xiangqi and crazyhouse players who want a compact open-information drop variant.',
  intro: [
    {
      kind: 'paragraph',
      text: 'Drop Mini Xiangqi is [Mini Xiangqi](/rules/mini-xiangqi) with a reserve. The board is still 7 by 7, Red still moves first, and the general is protected by check and checkmate. The new rule is simple: captured pieces become yours, wait in your hand, and can return to the board as drops.',
    },
    {
      kind: 'paragraph',
      text: 'That reserve turns captures into future initiative. A quiet exchange can become a cannon drop, a soldier screen, or a new chariot lane several moves later.',
    },
  ],
  sections: [
    {
      heading: 'Board and pieces',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The starting position, board, and movement are Mini Xiangqi. There are no advisors or elephants, no river, and each general remains inside its 3 by 3 palace.',
        },
        {
          kind: 'paragraph',
          text: 'This is open information. Both players see the whole board and both reserves. Unlike Dark Mini Xiangqi, there is no fog and no hidden move record.',
        },
      ],
    },
    {
      heading: 'Captures and reserves',
      blocks: [
        {
          kind: 'paragraph',
          text: 'When you capture a non-general piece, it leaves the board, changes to your color, and enters your reserve. Generals are never captured and never enter a reserve: attacks on the general are checks, and a player in check must answer the threat.',
        },
        {
          kind: 'paragraph',
          text: 'Instead of moving a board piece, you may drop one piece from your reserve onto an empty point outside the enemy palace. A dropped piece is live immediately: it can give check on the drop turn and moves normally on later turns.',
        },
      ],
    },
    {
      heading: 'Drop restrictions',
      blocks: [
        {
          kind: 'paragraph',
          text: "Drops must land on empty points, and they cannot land inside the opponent's 3 by 3 palace. The current Mistboard rules allow chariots, horses, cannons, and soldiers in reserve. Generals never enter reserve.",
        },
        {
          kind: 'paragraph',
          text: 'A dropped soldier follows Mini Xiangqi soldier movement after it lands: one point forward or sideways, never backward. Drops may give check immediately, and a drop is illegal if it leaves your own general in check.',
        },
      ],
    },
    {
      heading: 'Check and endings',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Win by checkmate. As in Mini Xiangqi, a player with no legal move loses rather than drawing by stalemate. Games can also end by repetition, the no-capture rule, timeout, resignation, or abandonment.',
        },
      ],
    },
    {
      heading: 'A sample game',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Step through this longer engine-lab game. It uses the current no-enemy-palace drop rule, shows both sides using reserves to defend and counterattack, and ends only after Black converts a late chariot attack.',
        },
        {
          kind: 'drop-mini-xiangqi-replay',
          spec: {
            red: 'FSF Red',
            black: 'FSF Black',
            event: 'Fairy-Stockfish lab, no-enemy-palace drops',
            moves:
              'b1b3 c6c5 a2b2 c7d5 d2d3 c5c4 e2e3 b7b4 f1f2 e6f6 f2d2 e7f5 g2f2 f7e7 e3f3 f6e6 f3e3 b4b5 a1a4 d5e3 d3e3 b5d5 e3d3 S@b4 H@b6 d6c6 b6c4 b4a4 d2d5 c6c5 S@f4 c5d5 g1g6 g7g6 C@f7 e7e1 f7a7 R@c5 c4e3 d7d6 R@b7 e1c1 e3f5 d5e5 H@f7 H@e7 b7e7 R@f1 H@e1 C@a1 d1d2 f1f2 S@e2 f2f4 e7c7 S@e7 c7e7 f4f5 e7d7 d6c6 S@b6 a6b6 a7a1 H@e4 C@e3 S@c7 f7e5 e6e5 d7d4 S@c4 d4c4 c5c4 S@d4 c4c5 S@a6 c6d6 a6b6 d6d7 S@b4 a4b4 a1a7 d7d6 d4e4 e5e4 b3a3 c5a5 H@f7 f5f7 a7f7 a5a3 e3a3 C@d5 R@d4 e4d4 d2d1 c1e1 a3a6 d6d7 a6a7 S@b7 f7c7 b7a7 R@f7 S@e7 f7f1 d4d3 e2d2 d3e3 d1e1 C@g1 f1g1 g6g1 C@f1 g1f1',
            resultText:
              'Black checkmates with 57...g1-f1. The final chariot capture beats Red\'s last defensive drop on f1.',
          },
        },
      ],
    },
    {
      heading: 'Play status',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Drop Mini Xiangqi is open for alpha play on Mistboard. Create an invite for a friend or queue for an open game from the homepage play panel by choosing Drop Mini Xiangqi in the Variant row.',
        },
        {
          kind: 'cta',
          buttons: [
            {
              label: 'Create invite',
              href: '/?play=friend&gameSpecId=drop-mini-xiangqi',
              emphasis: 'primary',
            },
            {
              label: 'Find opponent',
              href: '/?play=lobby&gameSpecId=drop-mini-xiangqi',
              emphasis: 'secondary',
            },
            { label: 'Back to all rules', href: '/rules', emphasis: 'secondary' },
          ],
        } as ArticleBlock,
      ],
    },
  ],
};
