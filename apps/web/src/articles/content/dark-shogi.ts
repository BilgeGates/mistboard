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
      text: 'Dark Shogi is the Fog of War version of [shogi](/rules/shogi): pieces keep their shogi movement and the drop rule still puts captured pieces back in play, but unseen enemy pieces stay hidden, each side\'s reserve is private, and danger is never announced. Capture the king to win.',
    },
    {
      kind: 'paragraph',
      text: 'If shogi is new to you, start with [Shogi Rules](/rules/shogi). If you already play shogi, the sections below explain only what fog changes.',
    },
  ],
  sections: [
    {
      heading: 'The starting position',
      blocks: [
        {
          kind: 'paragraph',
          text: 'At the start you see your own 20 pieces and every square they reach. Everything past that is fog. The board below is Black\'s view of the opening: the front rank of pawns and the squares just ahead of them are lit, and the whole far side, including all of White\'s army, is dark.',
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
          text: 'You see a square if one of your pieces could move to it. A slider sees up to the first piece in its path and stops there, so you see the piece you can hit but nothing behind it. Vision is recomputed from the true position after every move, so opening a line, dropping a piece, or advancing a pawn instantly changes what you know.',
        },
        {
          kind: 'paragraph',
          text: 'In the board below, Black\'s rook looks straight up an open file. It sees the White pawn it can capture, but the White king sheltering one square behind that pawn is still in the fog. Slide the pawn away and the king would appear.',
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
          text: 'Captured pieces still join your hand and can still be dropped, but your reserve is yours alone to see. In open shogi both hands sit face-up beside the board; under fog you see only your own. You never know exactly which pieces your opponent is holding, so a drop can come out of the fog as a genuine surprise.',
        },
        {
          kind: 'paragraph',
          text: 'You can drop into the fog as well. A piece dropped onto a square your opponent cannot see simply will not appear for them until one of their pieces looks at it. The two-pawn rule and the dead-square rule still apply, judged against the true board.',
        },
      ],
    },
    {
      heading: 'Win condition: king capture',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Capture the king to win. There is no check and no checkmate: the server never tells you your king is attacked, and it will happily let you move into danger or leave a threat unanswered. You have to read the threat yourself from what your own pieces can see.',
        },
        {
          kind: 'paragraph',
          text: 'Because there is no checkmate, the drop-pawn-mate restriction from open shogi is gone. A dropped pawn that takes the king next move is just a winning move like any other.',
        },
      ],
    },
    {
      heading: 'Draws',
      blocks: [
        {
          kind: 'paragraph',
          text: 'A game auto-draws on repetition, judged from the true position rather than either player\'s view. There is no stalemate draw: a side with no legal move loses, and with no check to freeze a king in place, that almost never happens.',
        },
      ],
    },
    {
      heading: 'Play status',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Dark Shogi is in development on Mistboard and not playable yet. There is no set release date.',
        },
        {
          kind: 'cta',
          buttons: [
            { label: 'Shogi Rules', href: '/rules/shogi', emphasis: 'secondary' },
            { label: 'Back to all rules', href: '/rules', emphasis: 'secondary' },
          ],
        } as ArticleBlock,
      ],
    },
  ],
};
