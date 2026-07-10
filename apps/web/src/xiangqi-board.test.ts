import { createInitialXiangqiState, getStandardXiangqiPlayerView } from '@mistboard/game';
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
});
