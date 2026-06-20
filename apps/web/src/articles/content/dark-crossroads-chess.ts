import {
  type CrossroadsChessBoard,
  type CrossroadsChessColor,
  type CrossroadsChessGameState,
  type CrossroadsChessPiece,
  type CrossroadsChessPieceRole,
  type CrossroadsChessSquare,
  createInitialCrossroadsChessState,
  crossroadsChessPositionRepetitionKey,
  getCrossroadsChessPlayerView,
} from '@mistboard/game';
import { renderCrossroadsChessBoardSvg } from '../../crossroads-chess-render.js';
import type { Article, ArticleBlock } from '../types.js';

// ── Fog diagram builders ─────────────────────────────────────────────────────
// Baked once from the real fog view (getCrossroadsChessPlayerView) + the real
// renderer, so each board shows exactly what the server would send a player.
// Building states by hand keeps this file self-contained (no shared edits).

function piece(color: CrossroadsChessColor, role: CrossroadsChessPieceRole): CrossroadsChessPiece {
  return { color, role };
}

// Wrap a hand-built board into a minimal playing state, with the repetition key
// seeded so the state is internally consistent.
function stateOf(
  board: CrossroadsChessBoard,
  turn: CrossroadsChessColor,
  extra: Partial<CrossroadsChessGameState> = {},
): CrossroadsChessGameState {
  const base: CrossroadsChessGameState = {
    id: 'diagram',
    board,
    status: { type: 'playing', turn },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
    ...extra,
  };
  return {
    ...base,
    positionCounts: { [crossroadsChessPositionRepetitionKey(base)]: 1 },
  };
}

// Render the fog view from a chosen side's perspective.
function fogView(
  state: CrossroadsChessGameState,
  color: CrossroadsChessColor,
): string {
  return renderCrossroadsChessBoardSvg(getCrossroadsChessPlayerView(state, color), {
    perspective: color,
    showFog: true,
  });
}

// White's view of the opening. White sees its own 12 pieces, the empty squares
// just ahead, and nothing past the river. Red's whole army is in the fog.
const START_FOG_SVG = fogView(createInitialCrossroadsChessState('diagram'), 'white');

// Field of fire: a White chariot looks up an open file. It sees the Red soldier
// it can reach and stops there; the Red king sheltering one square behind that
// soldier stays in the fog.
const FIELD_OF_FIRE_BOARD: CrossroadsChessBoard = {
  c1: piece('white', 'king'),
  c2: piece('white', 'chariot'),
  c6: piece('red', 'soldier'),
  c7: piece('red', 'king'),
  a8: piece('red', 'chariot'),
};
const FIELD_OF_FIRE_SVG = fogView(stateOf(FIELD_OF_FIRE_BOARD, 'white'), 'white');

// The cannon's screen-capture under fog: White's cannon on c2 sees the empty
// file ahead, then the first piece (the Red soldier screen on c5), then the
// enemy beyond it that it can hit (the Red horse on c7). The pieces past its
// reach stay dark.
const CANNON_BOARD: CrossroadsChessBoard = {
  c2: piece('white', 'cannon'),
  e1: piece('white', 'king'),
  c5: piece('red', 'soldier'),
  c7: piece('red', 'horse'),
  c8: piece('red', 'king'),
};
const CANNON_SVG = fogView(stateOf(CANNON_BOARD, 'white'), 'white');

// The Try: White's king has just reached rank 8 (the enemy far rank). Under fog
// the win is not instant. The king is shown from Red's side, where Red must find
// a capture this one ply or lose the race. Here no Red piece bears on f8, so the
// Try will succeed.
const TRY_BOARD: CrossroadsChessBoard = {
  f8: piece('white', 'king'),
  a6: piece('white', 'chariot'),
  c7: piece('red', 'king'),
  a1: piece('red', 'soldier'),
};
// Red is to move and must answer the armed Try.
const TRY_SVG = fogView(
  stateOf(TRY_BOARD, 'red', { pendingTry: 'white', lastMove: { from: 'f7', to: 'f8' } }),
  'red',
);

export const darkCrossroadsChessArticle: Article = {
  slug: 'dark-crossroads-chess',
  kind: 'rules',
  title: 'Dark Crossroads Chess Rules',
  summary:
    'Crossroads Chess under Fog of War: each side sees only the squares its pieces reach, there are no check warnings, the king falls by capture, and the race to the far rank becomes a one-move gamble in the dark.',
  showSummaryOnPage: false,
  status: 'draft',
  publishedAt: '2026-06-18',
  audience:
    'Crossroads Chess players, dark chess players, and anyone who wants a clean first explanation of the chess-xiangqi fusion under fog.',
  thumbnail: { kind: 'svg', svg: START_FOG_SVG },
  intro: [
    {
      kind: 'paragraph',
      text: 'Dark Crossroads Chess is the Fog of War version of [Crossroads Chess](/rules/crossroads-chess): the same chess-and-xiangqi fusion on a 6 by 8 river board, but you see only the squares your own pieces reach. Hidden enemy pieces stay dark, danger is never announced, and there is no checkmate. You win by capturing the enemy king, or by racing your own king across the board.',
    },
    {
      kind: 'paragraph',
      text: 'If the fusion is new to you, start with [Crossroads Chess](/rules/crossroads-chess) for the board and the pieces. The sections below explain only what fog changes.',
    },
  ],
  sections: [
    {
      heading: 'The starting position',
      blocks: [
        {
          kind: 'paragraph',
          text: 'At the start you see your own 12 pieces and every square they reach. Everything past that is fog. The board below is White\'s view of the opening: the back two ranks and the empty squares just ahead are lit, and the far half of the board, including all of Red\'s army across the river, is dark.',
        },
        {
          kind: 'raw-svg',
          svg: START_FOG_SVG,
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'White moves first, up the board toward rank 8. Red moves down toward rank 1. The river still runs between the fourth and fifth ranks, and only soldiers care about crossing it.',
        },
      ],
    },
    {
      heading: 'Vision is field of fire',
      blocks: [
        {
          kind: 'paragraph',
          text: 'You see a square if one of your pieces could move to it. A slider (chariot, bishop, queen) sees up to the first piece in its path and stops there, so you see the piece you can hit but nothing behind it. Vision is recomputed from the true position after every move, so opening a line or advancing a piece instantly changes what you know.',
        },
        {
          kind: 'paragraph',
          text: 'In the board below, White\'s chariot looks straight up an open file. It sees the Red soldier it can capture, but the Red king sheltering one square behind that soldier is still in the fog. Take the soldier and the king would appear.',
        },
        {
          kind: 'raw-svg',
          svg: FIELD_OF_FIRE_SVG,
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'The xiangqi pieces bend this rule, because their attacks have gaps. The cannon needs a screen to capture, so it shows you the screen and the enemy it can hit beyond it as silhouettes (color known, identity hidden), while the squares it cannot reach stay dark. The horse can be blocked at its leg, so a piece sitting on the leg square removes the leaps it would block. Vision is the field of fire of your real pieces, not a plain line of sight.',
        },
        {
          kind: 'raw-svg',
          svg: CANNON_SVG,
        } as ArticleBlock,
      ],
    },
    {
      heading: 'No check, no checkmate',
      blocks: [
        {
          kind: 'paragraph',
          text: 'There is no check in the dark. The server never tells you your king is attacked, and it will happily let you move into danger or leave a threat unanswered. With hidden pieces, no one can reliably prove a king is trapped, so checkmate is gone. You read the threats yourself from what your own pieces can see.',
        },
        {
          kind: 'paragraph',
          text: 'Because there is no check, the king moves a little more freely than in open Crossroads Chess: it may step onto a square an enemy attacks, and you are never forced to answer a threat you cannot see. That freedom cuts both ways, since the same blind spots hide the enemy king from you.',
        },
      ],
    },
    {
      heading: 'Win condition: capture the king',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The first way to win is to capture the enemy king outright. Any move that lands on the enemy king ends the game on the spot, whoever it belongs to. There is no warning and no reprieve, so a king that wanders into a fogged line of fire is simply lost.',
        },
      ],
    },
    {
      heading: 'Win condition: the race (the Try)',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The king is also your runner. As in open Crossroads Chess, you win by getting your own king to the enemy far rank: White to rank 8, Red to rank 1. Under fog this is not an instant win, because you cannot see whether the arrival square is defended. Reaching the far rank instead arms a "Try" and hands your opponent exactly one reply.',
        },
        {
          kind: 'paragraph',
          text: 'If the opponent has a piece that already bears on your king, they capture it on that reply and win by king capture. If they cannot, the Try succeeds on their move and you win the race. Racing the king into the fog is a real gamble: you are betting that no hidden piece is watching the square you land on.',
        },
        {
          kind: 'raw-svg',
          svg: TRY_SVG,
        } as ArticleBlock,
      ],
    },
    {
      heading: 'Draws',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Crossroads Chess is built to be fought out, and fog keeps draws rare. Threefold repetition is a draw, judged from the true position rather than either view, since under fog neither side can see the canonical position recur to force or avoid it. A long run with no capture and no pawn or soldier move ends in a no-progress draw. There is no stalemate draw: a side with no legal move loses, which with no check to freeze a king almost never happens.',
        },
      ],
    },
    {
      heading: 'Play status',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Dark Crossroads Chess is in development on Mistboard and not playable yet. There is no set release date.',
        },
        {
          kind: 'cta',
          buttons: [
            {
              label: 'Crossroads Chess Rules',
              href: '/rules/crossroads-chess',
              emphasis: 'secondary',
            },
            { label: 'Back to all rules', href: '/rules', emphasis: 'secondary' },
          ],
        } as ArticleBlock,
      ],
    },
  ],
};
