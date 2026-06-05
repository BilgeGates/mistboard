import {
  createInitialDualChessState,
  type DualChessGameState,
  getDualChessOpenView,
  getDualChessPlayerView,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { renderDualChessBoardSvg } from './dual-chess-render.js';

describe('Dual Chess board renderer', () => {
  it('renders the full board with chess pieces and CJK disks in the open view', () => {
    const view = getDualChessOpenView(createInitialDualChessState('r'), 'white');
    const svg = renderDualChessBoardSvg(view, { showFog: false });

    expect(svg).toContain('<svg');
    expect(svg).toContain('車'); // a White chariot disk glyph
    expect(svg).toContain('卒'); // a White soldier disk glyph
    // 48 board cells (6x8), each 50x50.
    expect((svg.match(/width="50" height="50"/g) ?? []).length).toBe(48);
    // No fog overlay when showFog is false.
    expect(svg).not.toContain('rgba(22,18,14,0.66)');
  });

  it('fogs hidden squares and shows shrouded enemies as color-only silhouettes', () => {
    // White cannon on a1 sees through the a3 screen to the enemy chariot on a6;
    // the Red king on f8 is fully hidden.
    const state: DualChessGameState = {
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
    const view = getDualChessPlayerView(state, 'white');
    const svg = renderDualChessBoardSvg(view, { showFog: true });

    expect(svg).toContain('?'); // the a3 screen is a shrouded silhouette
    expect(svg).toContain('rgba(22,18,14,0.66)'); // hidden squares (e.g. f8) are fogged
    // The hidden Red king must not be drawn as a real piece (no king glyph leak).
    expect(view.board.f8).toBeUndefined();
  });

  it('flips the board for the Red perspective', () => {
    const view = getDualChessOpenView(createInitialDualChessState('o'), 'white');
    const whiteSvg = renderDualChessBoardSvg(view, { perspective: 'white', showFog: false });
    const redSvg = renderDualChessBoardSvg(view, { perspective: 'red', showFog: false });

    expect(whiteSvg).not.toEqual(redSvg);
    // The White king on e1 sits near the bottom for White, near the top for Red.
    expect(whiteSvg).toContain('x="203.5" y="364.5"');
    expect(redSvg).toContain('x="53.5" y="3.5"');
  });
});
