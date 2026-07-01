import type { Article } from '../types.js';

export const fortressXiangqiArticle: Article = {
  slug: 'fortress-xiangqi',
  boardFamily: 'xiangqi',
  kind: 'rules',
  playableOnMistboard: true,
  title: 'Fortress Xiangqi Rules',
  summary:
    'Xiangqi with a pocket: every piece moves as in Chinese chess, plus crazyhouse-style drops and one new piece, the Treasure.',
  showSummaryOnPage: false,
  status: 'published',
  publishedAt: '2026-07-01',
  updatedAt: '2026-07-01',
  audience: 'Xiangqi and crazyhouse players who want a compact, decisive drop variant.',
  intro: [
    {
      kind: 'paragraph',
      text: 'Fortress Xiangqi is Chinese chess with a reserve. Every familiar piece moves exactly as it does in xiangqi, and one new piece, the Treasure, joins the back rank. The new rule is the crazyhouse loop: capture a piece, hold it in hand, and drop it back into the fight.',
    },
    {
      kind: 'paragraph',
      text: 'Captured material never leaves the game, so trades stay loaded and a cornered position can be broken open by a piece parachuted from reserve. The result is fair, decisive, comeback-rich, and short.',
    },
  ],
  sections: [
    {
      heading: 'Board and palaces',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The board is 7 files (a to g) by 8 ranks, with a river between ranks 4 and 5. Each side has a 3 by 3 palace, but the two palaces sit in opposite corners: Red holds the bottom left (a1 to c3) and Black holds the top right (e6 to g8). The whole setup has 180 degree rotational symmetry.',
        },
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
          text: 'Every standard piece moves exactly as in xiangqi. The Chariot slides any distance orthogonally. The Cannon moves like the Chariot but captures only by jumping exactly one screen piece. The Horse steps one point orthogonally then one diagonally out, and is blocked if the orthogonal step is occupied. The Elephant moves two points diagonally, is blocked by an occupied midpoint, and cannot cross the river. The Advisor moves one point diagonally and stays inside the palace. The General moves one point orthogonally inside the palace, and the two generals may not face each other on an open file.',
        },
        {
          kind: 'paragraph',
          text: 'The Soldier moves one point forward, gains a sideways step after crossing the river, and never moves backward.',
        },
        {
          kind: 'paragraph',
          text: 'The Treasure is the one new piece. It steps one point in any of the eight directions, all game. It never promotes and is never confined. Think of it as a queen that only steps one square: a strong palace defender early, and a flexible attacker once it advances or is dropped.',
        },
        {
          kind: 'paragraph',
          text: 'There are no promotions. The only past-river effect is the Soldier gaining its sideways step, which is the ordinary xiangqi rule.',
        },
      ],
    },
    {
      heading: 'Captures and drops',
      blocks: [
        {
          kind: 'paragraph',
          text: 'When you capture an enemy piece, it changes to your color and enters your hand. On your turn you may move a piece on the board, or instead drop one piece from your hand onto an empty point.',
        },
        {
          kind: 'paragraph',
          text: 'Attackers drop anywhere, including the enemy half: the Chariot, Horse, Cannon, Soldier, and Treasure. Defenders may drop only where they could legally stand: the Advisor drops inside its own palace, and the Elephant drops only in its own half. A drop may give check or deliver checkmate, and a Soldier dropped past the river has its sideways move at once.',
        },
      ],
    },
    {
      heading: 'How games end',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Checkmate wins. A player left with no legal move loses by stalemate, the xiangqi convention. There is no move-count or length draw: games are played to a result.',
        },
        {
          kind: 'paragraph',
          text: 'You cannot escape a lost game by repeating forever. A perpetual check is a loss for the checker. An honest repetition that neither side is forcing is a draw.',
        },
      ],
    },
    {
      heading: 'What makes it Fortress',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Most chess variants trade fairness for decisiveness. Drops break that tradeoff: they keep the game fair while cutting draws and shortening play, and your captured material comes back at your own king, so every exchange is a real decision. Cheap pieces parachuted behind enemy lines deliver many of the finishes, which is the good kind of explosive.',
        },
      ],
    },
  ],
};
