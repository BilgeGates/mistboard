import { createInitialBanqiState, getBanqiPlayerView, STANDARD_BANQI_DEAL } from '@mistboard/game';
import { describe, expect, it, vi } from 'vitest';
import { createBanqiInteractiveBoard } from './banqi-board.js';

describe('createBanqiInteractiveBoard overlays', () => {
  it('patches move arrows and flip markers in place and preserves them across renders', () => {
    const boardEl = document.createElement('div');
    const view = getBanqiPlayerView(
      createInitialBanqiState('overlay-board', STANDARD_BANQI_DEAL),
      'red',
    );
    const board = createBanqiInteractiveBoard({
      board: boardEl,
      getInteractionView: () => view,
      getPerspective: () => 'red',
      seatFor: (current) => (current.status.type === 'playing' ? current.status.turn : null),
      enabled: () => true,
      onMove: vi.fn(),
    });

    board.render(view, 'red');
    const svgBefore = boardEl.querySelector('svg');
    board.setArrows([{ from: 'a1', to: 'b1', className: 'xq-arrow--alt', width: 12 }]);
    board.setMarkers([{ square: 'c1', kind: 'circle', className: 'engine-marker--pv1', width: 5 }]);

    expect(boardEl.querySelector('svg')).toBe(svgBefore);
    expect(boardEl.querySelector('.xq-arrow--alt')).not.toBeNull();
    expect(boardEl.querySelector('.engine-marker--pv1')).not.toBeNull();

    board.render(view, 'black');
    expect(boardEl.querySelector('.xq-arrow--alt')).not.toBeNull();
    expect(boardEl.querySelector('.engine-marker--pv1')).not.toBeNull();

    board.setArrows([]);
    board.setMarkers([]);
    expect(boardEl.querySelector('.xq-arrow--alt')).toBeNull();
    expect(boardEl.querySelector('.engine-marker--pv1')).toBeNull();
  });
});
