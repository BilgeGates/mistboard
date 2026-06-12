import {
  type CrossroadsChessGameState,
  createInitialCrossroadsChessState,
  getCrossroadsChessOpenView,
  getCrossroadsChessPlayerView,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { renderCrossroadsChessBoardSvg } from './crossroads-chess-render.js';

describe('Crossroads Chess board renderer', () => {
  it('renders the full board with chess pieces and CJK disks in the open view', () => {
    const view = getCrossroadsChessOpenView(createInitialCrossroadsChessState('r'), 'white');
    const svg = renderCrossroadsChessBoardSvg(view, { showFog: false });

    expect(svg).toContain('<svg');
    expect(svg).toContain('車'); // a White chariot disk glyph
    expect(svg).toContain('卒'); // a White soldier disk glyph
    // 48 board cells (6x8), each 50x50.
    expect((svg.match(/width="50" height="50"/g) ?? []).length).toBe(48);
    expect(svg).toContain('var(--board-light)');
    expect(svg).toContain('var(--board-dark)');
    expect(svg).toContain('var(--crossroads-frame)');
    expect(svg).toContain('var(--crossroads-river)');
    // No fog overlay when showFog is false.
    expect(svg).not.toContain('var(--board-fog-light-fill)');
  });

  it('fogs hidden squares and shows shrouded enemies as color-only silhouettes', () => {
    // White cannon on a1 sees through the a3 screen to the enemy chariot on a6;
    // the Red king on f8 is fully hidden.
    const state: CrossroadsChessGameState = {
      id: 't',
      board: {
        a1: { color: 'white', role: 'cannon' },
        a3: { color: 'red', role: 'soldier' },
        a6: { color: 'red', role: 'chariot' },
        f8: { color: 'red', role: 'king' },
      },
      status: { type: 'playing', turn: 'white' },
      moveNumber: 1,
      progressClock: 0,
      positionCounts: {},
    };
    const view = getCrossroadsChessPlayerView(state, 'white');
    const svg = renderCrossroadsChessBoardSvg(view, { showFog: true });

    expect(svg).toContain('?'); // the a3 screen is a shrouded silhouette
    expect(svg).toContain('var(--board-fog-light-fill)'); // hidden squares (e.g. f8) are fogged
    // The hidden Red king must not be drawn as a real piece (no king glyph leak).
    expect(view.board.f8).toBeUndefined();
  });

  it('uses chess piece sets for chess roles and xiangqi piece sets for xiangqi roles', () => {
    const view = getCrossroadsChessOpenView(createInitialCrossroadsChessState('h'), 'white');
    const svg = renderCrossroadsChessBoardSvg(view, {
      showFog: false,
      chessPieceSet: 'letter',
      xiangqiPieceSet: 'western',
    });

    expect(svg).toContain('/pieces/letter/wK.svg');
    expect(svg).toContain('/pieces/letter/wN.svg');
    expect(svg).toContain('>R</text>'); // chariot uses the xiangqi Western set.
    expect(svg).toContain('>S</text>'); // soldier uses the xiangqi Western set.
    expect(svg).not.toContain('車');
    expect(svg).not.toContain('卒');
  });

  it('flips the board for the Red perspective', () => {
    const view = getCrossroadsChessOpenView(createInitialCrossroadsChessState('o'), 'white');
    const whiteSvg = renderCrossroadsChessBoardSvg(view, { perspective: 'white', showFog: false });
    const redSvg = renderCrossroadsChessBoardSvg(view, { perspective: 'red', showFog: false });

    expect(whiteSvg).not.toEqual(redSvg);
    // The White king on e1 sits near the bottom for White, near the top for Red.
    expect(whiteSvg).toContain('x="203.5" y="364.5"');
    expect(redSvg).toContain('x="53.5" y="3.5"');
  });

  it('emits a hit layer, selection highlight and target markers when interactive', () => {
    const view = getCrossroadsChessOpenView(createInitialCrossroadsChessState('i'), 'white');
    const svg = renderCrossroadsChessBoardSvg(view, {
      showFog: false,
      interactive: true,
      selected: 'd1',
      targets: ['c3', 'e3'],
    });
    // 48 transparent hit targets, one per square.
    expect((svg.match(/data-square="/g) ?? []).length).toBe(48);
    expect(svg).toContain('data-square="d1"');
    // Selection highlight + two move dots (empty targets).
    expect(svg).toContain('rgba(255,205,80,0.55)');
    expect((svg.match(/rgba\(45,100,45,0\.62\)/g) ?? []).length).toBe(2);
  });
});
