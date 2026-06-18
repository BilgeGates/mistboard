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
    expect(svg).not.toContain('rgba(231,221,197,0.88)');
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

    expect(svg).toContain('rgba(231,221,197,0.88)'); // hidden squares are fogged
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

  it('renders standalone hand + promotion koma', () => {
    const pawn = shogiHandKomaSvg('P', 'black');
    expect(pawn).toContain('<svg');
    expect(pawn).toContain('歩');

    // A promoted pawn (tokin) shows the promoted face in red.
    const tokin = shogiKomaSvg({ color: 'black', role: 'P', promoted: true });
    expect(tokin).toContain('と');
    expect(tokin).toContain('#b22222');
  });
});
