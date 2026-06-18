import {
  createInitialShogiState,
  createShogiPiece,
  getShogiPlayerView,
  type ShogiBoard,
  type ShogiGameState,
} from '@mistboard/game';
import { renderShogiBoardSvg } from '../../shogi-render.js';
import type { Article, ArticleBlock } from '../types.js';

// ── Fog diagram builders ─────────────────────────────────────────────────────
// Baked once from the real fog view (getShogiPlayerView) + the real renderer, so
// the diagrams show exactly what the server would send a player.

function fogView(state: ShogiGameState): string {
  return renderShogiBoardSvg(getShogiPlayerView(state, 'black'), { showFog: true });
}

const START_FOG_SVG = fogView(createInitialShogiState('diagram'));

// Black rook on an open file: it sees up to the first enemy piece (the pawn on
// 5c) and no further, so the king hiding behind it on 5a stays in the fog.
const FIELD_OF_FIRE_BOARD: ShogiBoard = {
  '5i': createShogiPiece('black', 'K'),
  '5e': createShogiPiece('black', 'R'),
  '5c': createShogiPiece('white', 'P'),
  '5a': createShogiPiece('white', 'K'),
};
const FIELD_OF_FIRE_SVG = renderShogiBoardSvg(
  getShogiPlayerView(
    {
      id: 'diagram',
      board: FIELD_OF_FIRE_BOARD,
      hands: { black: {}, white: {} },
      status: { type: 'playing', turn: 'black' },
      moveNumber: 1,
    },
    'black',
  ),
  { showFog: true },
);

export const darkShogiArticle: Article = {
  slug: 'dark-shogi',
  kind: 'rules',
  title: 'Dark Shogi (Fog of War) Rules',
  summary:
    'Shogi under Fog of War: each side sees only the squares its pieces reach, captured-piece hands are private, there are no check warnings, and the king falls by capture.',
  showSummaryOnPage: false,
  status: 'draft',
  publishedAt: '2026-06-18',
  audience:
    'Shogi players, dark chess players, and anyone who wants a clean first explanation of shogi under fog.',
  thumbnail: { kind: 'svg', svg: START_FOG_SVG },
  intro: [
    {
      kind: 'paragraph',
      text: 'Dark Shogi is [shogi](/rules/shogi) under Fog of War. Pieces keep their shogi movement, and the drop rule still puts captured pieces back in play, but enemy pieces outside your vision are hidden, each side\'s reserve is private, and nothing warns you about danger. Capture the king to win.',
    },
    {
      kind: 'paragraph',
      text: 'For the base game, read [Shogi Rules](/rules/shogi). If you already play, the sections below cover only what fog changes.',
    },
  ],
  sections: [
    {
      heading: 'The starting position',
      blocks: [
        {
          kind: 'paragraph',
          text: 'At the start you see your own 20 pieces and every square they reach. Everything past that is fog. The board below is Black\'s view of the opening: the rank of pawns and the squares just ahead of them are lit, and the whole far half of the board, including all of White\'s army, is dark.',
        },
        {
          kind: 'raw-svg',
          svg: START_FOG_SVG,
          caption: "Black's view of the starting position. White's pieces are all in the fog.",
        } as ArticleBlock,
      ],
    },
    {
      heading: 'Vision is field of fire',
      blocks: [
        {
          kind: 'paragraph',
          text: 'You see a square when one of your pieces reaches it. A rook, bishop, or lance sees up to the first piece in its path and stops there, so you see the piece you can hit but nothing behind it. Vision is recomputed from the true board after every move, so opening a line, advancing a pawn, or dropping a piece changes what you know on the spot.',
        },
        {
          kind: 'paragraph',
          text: 'Below, Black\'s rook looks straight up an open file. It sees the White pawn it can capture, but the White king sheltering one square behind that pawn stays in the fog. Move the pawn aside and the king appears.',
        },
        {
          kind: 'raw-svg',
          svg: FIELD_OF_FIRE_SVG,
          caption: 'The rook sees the pawn it can reach; the king behind it stays hidden.',
        } as ArticleBlock,
      ],
    },
    {
      heading: 'Hands are private',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Captured pieces still join your hand, and you can still drop them, but your reserve is yours alone to see. In open shogi both hands sit face-up beside the board. Under fog you see only your own, so you never know exactly what your opponent is holding, and a drop can come out of nowhere as a real surprise.',
        },
        {
          kind: 'paragraph',
          text: 'You can drop into the fog too. A piece dropped onto a square your opponent cannot see stays invisible to them until one of their pieces reaches it. The two-pawn rule (no second unpromoted pawn on a file) and the dead-piece rule (no pawn or lance on the last rank, no knight on the last two) still apply, checked against the true board.',
        },
      ],
    },
    {
      heading: 'Win condition: king capture',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Capture the king and you win on the spot. There is no check and no checkmate. The server never tells you your king is attacked, and it will let you walk into danger or leave a threat unanswered. You read the threats yourself, from what your own pieces can see.',
        },
        {
          kind: 'paragraph',
          text: 'With no checkmate, the drop-pawn-mate ban from open shogi is gone. A pawn dropped where it captures the king next move is just a winning move like any other.',
        },
      ],
    },
    {
      heading: 'How a game ends',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Almost every Dark Shogi game ends when a king is captured. The other endings are the ordinary ones for a timed online game: running out of time, resigning, or abandoning the board. There is no checkmate to call the game early, so play runs until a king actually comes off.',
        },
      ],
    },
    {
      heading: 'Play status',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Dark Shogi is in development on Mistboard and not playable yet, with no set release date. For the open-information base game, read Shogi Rules. For chess under the same fog, read Dark Chess.',
        },
        {
          kind: 'cta',
          buttons: [
            { label: 'Shogi Rules', href: '/rules/shogi', emphasis: 'secondary' },
            { label: 'Dark Chess', href: '/rules/dark-chess', emphasis: 'secondary' },
            { label: 'All rules', href: '/rules', emphasis: 'secondary' },
          ],
        } as ArticleBlock,
      ],
    },
  ],
};
