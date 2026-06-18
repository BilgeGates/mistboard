import {
  applyCrazyhouseMove,
  createInitialCrazyhouseState,
  type Color,
  type CrazyhouseGameState,
  getCrazyhousePlayerView,
} from '@mistboard/game';
import { renderCrazyhouseBoardSvg } from '../../crazyhouse-render.js';
import type { Article, ArticleBlock } from '../types.js';

// ── Fog diagram builders ─────────────────────────────────────────────────────
// Baked once from the real fog view (getCrazyhousePlayerView) + the real live
// renderer (renderCrazyhouseBoardSvg), so every board shows exactly what the
// server would send that player. All boards render white-at-bottom to match the
// dark-chess house style; the perspective arg only sets orientation, not whose
// view it is (the view comes from getCrazyhousePlayerView).

function fogSvg(state: CrazyhouseGameState, viewer: Color): string {
  return renderCrazyhouseBoardSvg(getCrazyhousePlayerView(state, viewer), {
    showFog: true,
    perspective: 'white',
  });
}

const START_FOG_SVG = fogSvg(createInitialCrazyhouseState('diagram'), 'black');

// A mid-game position used for the drop-into-fog story. White holds a knight in
// hand and is to move. White's army lights its own reaches; the far side, where
// the knight is about to land, is fog from White's side.
const DROP_BOARD = {
  e1: { color: 'white', role: 'king' },
  a1: { color: 'white', role: 'rook' },
  d4: { color: 'white', role: 'pawn' },
  e8: { color: 'black', role: 'king' },
  f5: { color: 'black', role: 'pawn' },
  c6: { color: 'black', role: 'knight' },
} as const;

const DROP_BEFORE: CrazyhouseGameState = {
  id: 'diagram',
  variant: 'dark-crazyhouse',
  board: { ...DROP_BOARD },
  status: { type: 'playing', turn: 'white' },
  moveNumber: 10,
  castlingRights: [],
  halfmoveClock: 0,
  dropPolicy: 'any-legal-square',
  hands: { white: { knight: 1 }, black: {} },
  promoted: [],
};

// White parachutes the knight onto e6, a square White cannot see. It is truly
// empty, so the drop resolves.
const DROP_AFTER = applyCrazyhouseMove(DROP_BEFORE, { drop: 'knight', to: 'e6' });

// Black steps the king e8 -> d7 and finally looks at e6, where the knight has
// been sitting all along.
const REVEAL_AFTER_LOOK = applyCrazyhouseMove(DROP_AFTER, { from: 'e8', to: 'd7' });

const DROP_BEFORE_WHITE_SVG = fogSvg(DROP_BEFORE, 'white');
const DROP_AFTER_WHITE_SVG = fogSvg(DROP_AFTER, 'white');
const DROP_AFTER_BLACK_SVG = fogSvg(DROP_AFTER, 'black');
const REVEAL_BLACK_SVG = fogSvg(REVEAL_AFTER_LOOK, 'black');

export const darkCrazyhouseArticle: Article = {
  slug: 'dark-crazyhouse',
  kind: 'rules',
  title: 'Dark Crazyhouse (Fog of War) Rules',
  summary:
    'Crazyhouse under Fog of War: captured pieces flip color into your hand and drop back into play, hands are private, you can parachute a drop into the fog, and the king falls by capture.',
  showSummaryOnPage: false,
  status: 'draft',
  publishedAt: '2026-06-18',
  audience:
    'Crazyhouse players, dark chess players, and anyone who wants a clean first explanation of crazyhouse under fog.',
  thumbnail: { kind: 'svg', svg: START_FOG_SVG },
  intro: [
    {
      kind: 'paragraph',
      text: 'Dark Crazyhouse is the Fog of War version of [crazyhouse](https://en.wikipedia.org/wiki/Crazyhouse): you keep every piece you capture and can drop it back onto the board as your own, but unseen enemy pieces stay hidden, each side\'s reserve is private, and danger is never announced. Capture the king to win.',
    },
    {
      kind: 'paragraph',
      text: 'It runs on the same fog as [Dark Chess](/rules/dark-chess). If the fog rule is new to you, read that first. The sections below cover only what crazyhouse adds: hands, drops, and the one drop that fog makes strange.',
    },
  ],
  sections: [
    {
      heading: 'The starting position',
      blocks: [
        {
          kind: 'paragraph',
          text: 'You start from the standard chess setup and see the squares your own pieces could legally move to, plus the squares they stand on. Everything else is fog. The board below is Black\'s view of the opening: the front rank of pawns and the squares just past them are lit, and the whole far side, including all of White\'s army, is dark.',
        },
        {
          kind: 'raw-svg',
          svg: START_FOG_SVG,
          caption: "Black's view of the starting position. White's pieces are all in the fog.",
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'Vision works exactly as it does in dark chess. You see a square if one of your pieces could move there; a slider sees up to the first piece in its path and no further. Vision is recomputed from the true position after every move, so opening a line, advancing a pawn, or dropping a piece instantly changes what you know.',
        },
      ],
    },
    {
      heading: 'Captures flip into your hand',
      blocks: [
        {
          kind: 'paragraph',
          text: 'When you capture a piece it does not leave the game. It switches to your color and goes into your hand, a private reserve you can spend later. A captured queen becomes a queen you can drop; a captured rook becomes a rook you can drop, and so on. A pawn that had promoted reverts: capture a promoted queen and you hold a pawn, not a queen.',
        },
        {
          kind: 'paragraph',
          text: 'In open crazyhouse both hands sit face-up beside the board. Under fog you see only your own. You never know exactly what your opponent is holding, so a drop can come out of nowhere. Kings are never captured into a hand: capturing a king ends the game.',
        },
      ],
    },
    {
      heading: 'Dropping a piece',
      blocks: [
        {
          kind: 'paragraph',
          text: 'On your turn you may drop a piece from your hand onto an empty square instead of moving a piece on the board. A drop spends that piece from your hand and places it as your own. The standard crazyhouse drop rules carry over: a pawn may not be dropped onto the first or eighth rank, and a dropped piece is live immediately. It can capture, give the threats a real piece gives, and on the very next move it can take the king.',
        },
        {
          kind: 'paragraph',
          text: 'Because there is no checkmate under fog (see below), the open-crazyhouse ban on dropping a pawn for mate does not apply. A dropped pawn that captures the king is a winning move like any other.',
        },
      ],
    },
    {
      heading: 'Parachute: you can drop into the fog',
      blocks: [
        {
          kind: 'paragraph',
          text: 'This is the rule fog adds. You may drop onto any square that looks empty from your side, including squares hidden in the fog. You are not limited to squares you can see. Below, White holds a knight in hand and drops it onto e6, deep in Black\'s half and outside White\'s vision. The square is truly empty, so the knight lands. After the drop White can see e6 (a White piece is now there) and the squares the knight covers.',
        },
        {
          kind: 'raw-svg',
          svg: DROP_BEFORE_WHITE_SVG,
          caption: "White's view before the drop: e6 is in the fog. White still drops there.",
        } as ArticleBlock,
        {
          kind: 'raw-svg',
          svg: DROP_AFTER_WHITE_SVG,
          caption: 'After the drop: the knight is on e6 and White now sees it and the squares it reaches.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'From the other side the knight simply appears out of the fog later. Black does not see e6 the moment the knight lands, because no Black piece looks at it. The drop is on the board, fully real, and invisible to its target until a Black piece reaches the square. Below is Black\'s view: first the empty fog right after White drops, then the same knight once Black walks the king to d7 and looks at e6.',
        },
        {
          kind: 'raw-svg',
          svg: DROP_AFTER_BLACK_SVG,
          caption: "Black's view right after the drop: e6 is still dark. The knight is there; Black cannot see it.",
        } as ArticleBlock,
        {
          kind: 'raw-svg',
          svg: REVEAL_BLACK_SVG,
          caption: 'Black plays Kd7 and finally looks at e6. The parachuted knight was there all along.',
        } as ArticleBlock,
      ],
    },
    {
      heading: 'A bounced drop is a probe',
      blocks: [
        {
          kind: 'paragraph',
          text: 'A drop only resolves if the square is truly empty. If you parachute onto a fogged square that already holds a piece, the drop is illegal and the server rejects it. Nothing moves, your hand is untouched, and it is still your turn. That rejection is information: you now know a piece is sitting on that square, even though you still cannot see what it is. Drop, get bounced, and you have probed the fog for the price of one rejected attempt.',
        },
        {
          kind: 'paragraph',
          text: 'The list of drop targets your client offers always includes fogged squares, so the offer itself never tells you which hidden squares are occupied. You only learn that by attempting the drop and seeing whether it lands.',
        },
      ],
    },
    {
      heading: 'Win condition: king capture',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Capture the king to win. There is no check and no checkmate: the server never tells you your king is attacked, and it will let you move into danger or leave a threat unanswered. You read the threat yourself from what your own pieces can see, and a piece dropped into the fog is the threat you will not see coming.',
        },
      ],
    },
    {
      heading: 'Draws',
      blocks: [
        {
          kind: 'paragraph',
          text: 'A game auto-draws on threefold repetition of the true position (same side to move, same rights) and on the 50-move rule. Both are judged from the true board, not either player\'s view. A drop adds material and resets the 50-move counter, the same as a pawn move or a capture. There is no stalemate draw and no insufficient-material draw.',
        },
      ],
    },
    {
      heading: 'Play status',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Dark Crazyhouse is in development on Mistboard and not playable yet. There is no set release date.',
        },
        {
          kind: 'cta',
          buttons: [
            { label: 'Dark Chess Rules', href: '/rules/dark-chess', emphasis: 'secondary' },
            { label: 'Back to all rules', href: '/rules', emphasis: 'secondary' },
          ],
        } as ArticleBlock,
      ],
    },
  ],
};
