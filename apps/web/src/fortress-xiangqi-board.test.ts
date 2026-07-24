import {
  createInitialFortressXiangqiState,
  type FortressXiangqiColor,
  getFortressXiangqiPlayerView,
} from '@mistboard/game';
import { describe, expect, it, vi } from 'vitest';
import { createFortressXiangqiInteractiveBoard } from './fortress-xiangqi-board.js';

describe('createFortressXiangqiInteractiveBoard overlays', () => {
  it('patches streamed arrows in place and preserves them across renders', () => {
    const boardEl = document.createElement('div');
    const view = getFortressXiangqiPlayerView(
      createInitialFortressXiangqiState('arrow-board'),
      'red',
    );
    let perspective: FortressXiangqiColor = 'red';
    const board = createFortressXiangqiInteractiveBoard({
      board: boardEl,
      getInteractionView: () => view,
      getPerspective: () => perspective,
      seatFor: (current) => (current.status.type === 'playing' ? current.status.turn : null),
      enabled: () => true,
      onMove: vi.fn(),
    });

    board.render(view, perspective);
    const svgBefore = boardEl.querySelector('svg');
    board.setArrows([
      {
        from: 'a1',
        to: 'b2',
        className: 'xq-arrow--pv1',
        opacity: 0.4,
        width: 14,
      },
    ]);

    expect(boardEl.querySelector('svg')).toBe(svgBefore);
    expect(boardEl.querySelector('.xq-arrow--pv1')).not.toBeNull();

    perspective = 'black';
    board.render(view, perspective);
    expect(boardEl.querySelector('.xq-arrow--pv1')).not.toBeNull();

    board.setArrows([]);
    expect(boardEl.querySelector('.xq-arrow--pv1')).toBeNull();
  });
});
