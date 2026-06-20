import {
  createInitialShogiState,
  getShogiPlayerView,
  type ShogiGameState,
  type ShogiPlayerView,
  type ShogiSquare,
  shogiSquareOf,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { renderShogiBoardSvg, shogiHandKomaSvg, shogiKomaSvg } from './shogi-render.js';

function allShogiSquares(): ShogiSquare[] {
  const squares: ShogiSquare[] = [];
  for (let file = 1; file <= 9; file += 1) {
    for (let rankIndex = 0; rankIndex < 9; rankIndex += 1) {
      squares.push(shogiSquareOf(file, rankIndex));
    }
  }
  return squares;
}

// A truth-style view: the full board, every square visible.
function truthView(
  state: ShogiGameState,
  perspective: 'black' | 'white' = 'black',
): ShogiPlayerView {
  return {
    id: state.id,
    perspective,
    board: state.board,
    hand: {},
    visibleSquares: allShogiSquares(),
    legalMoves: [],
    status: state.status,
    moveNumber: state.moveNumber,
  };
}

describe('Dark Shogi board renderer', () => {
  it('renders the full 9x9 board with kanji koma', () => {
    const svg = renderShogiBoardSvg(truthView(createInitialShogiState('t')), { showFog: false });

    expect(svg).toContain('<svg');
    expect(svg).toContain('王'); // the Black king (sente face)
    expect(svg).toContain('玉'); // the White king (gote face)
    expect(svg).toContain('歩'); // a pawn
    expect(svg).toContain('飛'); // a rook
    expect(svg).toContain('香'); // a lance
    // 81 board cells (9x9), each 48x48; no fog/selection/hit rects when clean.
    expect((svg.match(/width="48" height="48"/g) ?? []).length).toBe(81);
    // No fog overlay when showFog is false.
    expect(svg).not.toContain('fill="url(#');
  });

  it('fogs squares outside vision and never leaks off-vision enemies', () => {
    // Black rook on 2h sees up its own file; the lone White king on 5a is far
    // off vision and must be absent from the view (no screen mechanic).
    const state: ShogiGameState = {
      id: 't',
      board: {
        '2h': { color: 'black', role: 'R', promoted: false },
        '5a': { color: 'white', role: 'K', promoted: false },
      },
      hands: { black: {}, white: {} },
      status: { type: 'playing', turn: 'black' },
      moveNumber: 1,
    };
    const view = getShogiPlayerView(state, 'black');
    const svg = renderShogiBoardSvg(view, { showFog: true });

    expect(svg).toMatch(/<pattern id="shogi-live-\d+-fog"/); // hidden squares are fogged
    expect(svg).toContain('/fog/fog.webp');
    expect(svg).toContain('/fog/mistveil.webp');
    expect(svg).toContain('fill="url(#shogi-live-');
    expect(svg).toContain('飛'); // the Black rook is visible to its owner
    expect(view.board['5a']).toBeUndefined(); // the far White king never reaches the view
    expect(svg).not.toContain('玉'); // ...so its glyph cannot leak
  });

  it('flips the board for the White perspective', () => {
    const view = truthView(createInitialShogiState('o'));
    const blackSvg = renderShogiBoardSvg(view, { perspective: 'black', showFog: false });
    const whiteSvg = renderShogiBoardSvg(view, { perspective: 'white', showFog: false });
    expect(blackSvg).not.toEqual(whiteSvg);
  });

  it('emits a hit layer, selection highlight and target dots when interactive', () => {
    const svg = renderShogiBoardSvg(truthView(createInitialShogiState('i')), {
      showFog: false,
      interactive: true,
      selected: '2h',
      targets: ['2g', '3g'],
    });
    // 81 transparent hit targets, one per square.
    expect((svg.match(/data-square="/g) ?? []).length).toBe(81);
    expect(svg).toContain('data-square="2h"');
    expect(svg).toContain('data-square="5e"');
    // Selection highlight + two move dots (empty targets).
    expect(svg).toContain('rgba(207,227,154,0.70)');
    expect((svg.match(/<circle/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('renders the chosen piece set: western Latin initials, promoted as +X', () => {
    const state: ShogiGameState = {
      id: 'w',
      board: {
        '5e': { color: 'black', role: 'R', promoted: false },
        '5c': { color: 'black', role: 'P', promoted: true },
      },
      hands: { black: {}, white: {} },
      status: { type: 'playing', turn: 'black' },
      moveNumber: 1,
    };
    const svg = renderShogiBoardSvg(truthView(state), { showFog: false, pieceSet: 'western' });
    expect(svg).toContain('>R<'); // rook initial, not a kanji
    expect(svg).toContain('>+P<'); // promoted pawn as +P
    expect(svg).toContain('#b22222'); // ...inked red
    expect(svg).not.toContain('飛'); // no kanji leaks through in western mode
  });

  it('renders image piece sets as <image> with the side-oriented lishogi art', () => {
    const state: ShogiGameState = {
      id: 'img',
      board: {
        '5i': { color: 'black', role: 'K', promoted: false }, // own -> sente art (0)
        '5a': { color: 'white', role: 'K', promoted: false }, // opponent -> gote art (1)
      },
      hands: { black: {}, white: {} },
      status: { type: 'playing', turn: 'black' },
      moveNumber: 1,
    };
    const svg = renderShogiBoardSvg(truthView(state), { showFog: false, pieceSet: 'chess' });
    expect(svg).toContain('<image href="/piece-sets/chess/0OU.svg"');
    expect(svg).toContain('<image href="/piece-sets/chess/1OU.svg"');
    expect(svg).not.toContain('王'); // image sets draw the koma art, not a kanji glyph
    expect(svg).not.toContain('玉');
  });

  it('applies the selected board theme palette under the shared dark fog', () => {
    const state: ShogiGameState = {
      id: 'k',
      board: { '5e': { color: 'black', role: 'K', promoted: false } },
      hands: { black: {}, white: {} },
      status: { type: 'playing', turn: 'black' },
      moveNumber: 1,
    };
    const view = getShogiPlayerView(state, 'black');
    const svg = renderShogiBoardSvg(view, { showFog: true, boardTheme: 'kaya' });
    expect(svg).toContain('#f7e7c2'); // kaya light cell
    expect(svg).toContain('#f1ddb0'); // kaya dark cell
    expect(svg).toContain('rgba(46, 43, 37, 0.82)'); // shared dark fog fallback
  });

  it('tints forbidden squares red (drop-restriction diagrams)', () => {
    const svg = renderShogiBoardSvg(truthView(createInitialShogiState('f')), {
      showFog: false,
      forbidden: ['5e', '5d'],
    });
    expect(svg).toContain('rgba(200,48,48,0.34)'); // the shared renderer's threat tint
  });

  it('renders standalone hand + promotion koma', () => {
    const pawn = shogiHandKomaSvg('P', 'black');
    expect(pawn).toContain('<svg');
    expect(pawn).toContain('歩');
    expect(pawn).toContain('dominant-baseline="central"');
    expect(pawn).toContain('y="24.80"');

    // A promoted pawn (tokin) shows the promoted face in red.
    const tokin = shogiKomaSvg({ color: 'black', role: 'P', promoted: true });
    expect(tokin).toContain('と');
    expect(tokin).toContain('#b22222');
  });

  it('uses centered kanji placement on live board koma', () => {
    const svg = renderShogiBoardSvg(truthView(createInitialShogiState('baseline')), {
      showFog: false,
    });

    expect(svg).toContain('dominant-baseline="central"');
  });
});
