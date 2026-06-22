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
  audience:
    'Mini Xiangqi and crazyhouse players who want a compact open-information drop variant.',
  intro: [
    {
      kind: 'paragraph',
      text: 'Drop Mini Xiangqi is [Mini Xiangqi](/rules/mini-xiangqi) with a reserve. The board is still 7 by 7, Red still moves first, and the general is protected by check and checkmate. The new rule is simple: captured pieces become yours, wait in your hand, and can return to the board as drops.',
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
          text: 'Instead of moving a board piece, you may drop one piece from your reserve onto an empty point outside the enemy palace. A dropped piece is live immediately and moves normally on later turns.',
        },
      ],
    },
    {
      heading: 'Drop restrictions',
      blocks: [
        {
          kind: 'paragraph',
          text: "Drops must land on empty points, and they cannot land inside the opponent's 3 by 3 palace. The current Mistboard rules allow chariots, horses, cannons, and soldiers in reserve, and the server rejects any drop that would violate the true board position.",
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
