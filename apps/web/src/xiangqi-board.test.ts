import {
  applyMove as applyXiangqiMove,
  createInitialXiangqiState,
  getStandardXiangqiPlayerView,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { renderXiangqiBoardSvg as renderLiveXiangqiBoardSvg } from './live-xiangqi.js';
import { renderXiangqiBoardSvg as renderSharedXiangqiBoardSvg } from './xiangqi-board.js';

const NON_SELECTABLE_RIVER_GROUP =
  '<g class="xq-live-river" aria-hidden="true" pointer-events="none" style="-webkit-user-select: none; user-select: none;">';

describe('standard Xiangqi board SVG', () => {
  it('renders the river label as theme-controlled non-selectable board furniture', () => {
    const state = createInitialXiangqiState('xq-board-render');
    const view = getStandardXiangqiPlayerView(state, 'red');

    expect(renderSharedXiangqiBoardSvg(view)).toContain(NON_SELECTABLE_RIVER_GROUP);
    expect(renderSharedXiangqiBoardSvg(view)).toContain('class="xq-live-river-label"');
    expect(renderLiveXiangqiBoardSvg(view)).toContain(NON_SELECTABLE_RIVER_GROUP);
    expect(renderLiveXiangqiBoardSvg(view)).toContain('class="xq-live-river-label"');
  });

  it('re-exports ONE renderer from live-xiangqi (no duplicate implementation)', () => {
    expect(renderLiveXiangqiBoardSvg).toBe(renderSharedXiangqiBoardSvg);
  });

  it('marks the last move from/to intersections when the view carries lastMove', () => {
    const state = applyXiangqiMove(createInitialXiangqiState('xq-board-lastmove'), {
      from: 'b3',
      to: 'e3',
    });
    const view = getStandardXiangqiPlayerView(state, 'red');
    expect(view.lastMove).toEqual({ from: 'b3', to: 'e3' });

    // Red perspective geometry: x = 36 + file*60, y = 36 + (10 - rank)*60.
    // b3 -> (96, 456); e3 -> (276, 456).
    const svg = renderSharedXiangqiBoardSvg(view);
    expect(svg).toContain('<circle class="xq-live-lastmove-cell" cx="96" cy="456" r="27"/>');
    expect(svg).toContain('<circle class="xq-live-lastmove-cell" cx="276" cy="456" r="27"/>');
    expect(svg.match(/xq-live-lastmove-cell/g)).toHaveLength(2);

    // Black perspective flips ranks: rank 3 lands at y = 36 + 2*60 = 156.
    const flipped = renderSharedXiangqiBoardSvg(view, 'black');
    expect(flipped).toContain('<circle class="xq-live-lastmove-cell" cx="96" cy="156" r="27"/>');
    expect(flipped).toContain('<circle class="xq-live-lastmove-cell" cx="276" cy="156" r="27"/>');
  });

  it('renders no last-move marker when the view has no lastMove', () => {
    const view = getStandardXiangqiPlayerView(createInitialXiangqiState('xq-board-fresh'), 'red');
    expect(view.lastMove).toBeUndefined();
    expect(renderSharedXiangqiBoardSvg(view)).not.toContain('xq-live-lastmove-cell');
  });
});
