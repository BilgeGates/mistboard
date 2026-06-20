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
import {
  readCrossroadsChessAppearance,
  renderCrossroadsChessBoardSvg,
  type CrossroadsChessRenderOptions,
} from '../../crossroads-chess-render.js';
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
  options: CrossroadsChessRenderOptions = {},
): string {
  return renderCrossroadsChessBoardSvg(getCrossroadsChessPlayerView(state, color), {
    perspective: color,
    showFog: true,
    ...readCrossroadsChessAppearance(),
    ...options,
  });
}

// White's view of the opening. White sees its own 12 pieces, the empty squares
// just ahead, and nothing past the river. Red's whole army is in the fog.
const START_FOG_STATE = createInitialCrossroadsChessState('diagram');
const startFogSvg = () => fogView(START_FOG_STATE, 'white');

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
const FIELD_OF_FIRE_STATE = stateOf(FIELD_OF_FIRE_BOARD, 'white');
const fieldOfFireSvg = () => fogView(FIELD_OF_FIRE_STATE, 'white');

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
const CANNON_STATE = stateOf(CANNON_BOARD, 'white');
const cannonSvg = () => fogView(CANNON_STATE, 'white');

// The Try: White's king has just reached rank 8 (the enemy far rank). Under fog
// the win is not instant. Red gets one reply, and here the Red chariot has a
// clear file to f8, so the Try fails by king capture.
const TRY_BOARD: CrossroadsChessBoard = {
  f8: piece('white', 'king'),
  a6: piece('white', 'chariot'),
  f5: piece('red', 'chariot'),
  c7: piece('red', 'king'),
  a1: piece('red', 'soldier'),
};
// Red is to move and must answer the armed Try.
const TRY_STATE = stateOf(TRY_BOARD, 'red', {
  pendingTry: 'white',
  lastMove: { from: 'f7', to: 'f8' },
});
const trySvg = () =>
  fogView(TRY_STATE, 'red', { highlights: ['f8'], arrows: [{ from: 'f5', to: 'f8' }] });

export const darkCrossroadsChessArticle: Article = {
  slug: 'dark-crossroads-chess',
  kind: 'rules',
  title: 'Dark Crossroads Chess Rules',
  summary:
    'Crossroads Chess under Fog of War: each side sees only the squares its pieces reach, there are no check warnings, the king falls by capture, and the race to the far rank becomes a one-move gamble in the dark.',
  showSummaryOnPage: false,
  status: 'published',
  publishedAt: '2026-06-20',
  audience:
    'Crossroads Chess players, dark chess players, and anyone who wants a clean first explanation of the chess-xiangqi fusion under fog.',
  thumbnail: { kind: 'svg', svg: startFogSvg },
  intro: [
    {
      kind: 'paragraph',
      text: 'Dark Crossroads Chess is [Crossroads Chess](/rules/crossroads-chess) under Fog of War. The board, pieces, river, movement rules, promotion, and racing idea all come from the base game. This page covers only what changes when each player sees only the squares their own pieces reach.',
    },
    {
      kind: 'paragraph',
      text: 'Start with the base rules if the fusion is new. Here, hidden enemy pieces stay dark, danger is never announced, checkmate disappears, and the far-rank race turns into a one-reply gamble.',
    },
  ],
  sections: [
    {
      heading: 'What carries over',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Every piece moves as it does in Crossroads Chess. Soldiers still care about the river, pawns still promote, cannons still need screens, horses still have blocked legs, and the king is still both a royal piece and a runner. Fog changes information and endings, not the movement grammar.',
        },
        {
          kind: 'paragraph',
          text: 'At the start, White sees only White\'s pieces and the squares they reach. Red\'s army is not shown just because it exists across the river.',
        },
        {
          kind: 'raw-svg',
          svg: startFogSvg,
          className: 'dark-crossroads-figure',
        } as ArticleBlock,
      ],
    },
    {
      heading: 'Vision is attack geometry',
      blocks: [
        {
          kind: 'paragraph',
          text: 'You see a square if one of your pieces could move to it from the true position. A slider (chariot, bishop, queen) sees up to the first piece in its path and stops there. You see the piece you can hit, but not what stands behind it.',
        },
        {
          kind: 'paragraph',
          text: 'Here White\'s chariot sees the Red soldier on the file, but the Red king one square behind that soldier stays hidden. Capture the soldier and the information changes.',
        },
        {
          kind: 'raw-svg',
          svg: fieldOfFireSvg,
          className: 'dark-crossroads-figure',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'The xiangqi pieces make the fog sharper than plain line of sight. A cannon can reveal the screen and the target beyond it, because that is its real capture geometry. A horse loses the leaps blocked by an occupied leg square. The board shows what your army can actually reach, not a guessed ray through the fog.',
        },
        {
          kind: 'raw-svg',
          svg: cannonSvg,
          className: 'dark-crossroads-figure',
        } as ArticleBlock,
      ],
    },
    {
      heading: 'No check, only capture',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Open Crossroads Chess has check and checkmate. Dark Crossroads does not. The server never tells you your king is attacked, never forces you to answer a threat, and never rejects a move just because your king would be unsafe.',
        },
        {
          kind: 'paragraph',
          text: 'Instead, the king falls by capture. If a move lands on the enemy king, the game ends immediately. This is the fog version of the royal rule: the danger is real, but it is your job to infer it.',
        },
      ],
    },
    {
      heading: 'The race becomes a Try',
      blocks: [
        {
          kind: 'paragraph',
          text: 'In the base game, the king has to reach the enemy back rank safely. A back-rank square protected by the opponent is not a win. Under fog, you cannot know for sure whether the arrival square is safe, so reaching the far rank arms a Try and gives the opponent exactly one reply.',
        },
        {
          kind: 'paragraph',
          text: 'If the opponent can capture your king on that reply, the Try fails and they win by king capture. If they cannot take it immediately, your king has made it safely to the end and you win the race. A dark race is not just a pathing problem. It is an information bet.',
        },
        {
          kind: 'raw-svg',
          svg: trySvg,
          caption:
            "Red's view after White reaches f8. The chariot on f5 can take the king, so this Try fails.",
          className: 'dark-crossroads-figure',
        } as ArticleBlock,
      ],
    },
    {
      heading: 'Draws under fog',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The draw rules are also fog-aware. In open Crossroads Chess, threefold repetition is charged as a loss to the side forcing it. In Dark Crossroads Chess, repetition is a draw, judged from the true position, because neither player can see the whole board well enough to own the cycle. The no-progress clock still draws after a long run with no capture and no pawn or soldier move.',
        },
      ],
    },
    {
      heading: 'Play status',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Dark Crossroads Chess is in active Mistboard playtesting. Public matchmaking and the main play-menu entry are still gated, but the rules page is published so players can review the variant before broader play opens.',
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
