import { createInitialFortressXiangqiState, getFortressXiangqiPlayerView } from '@mistboard/game';
import { afterEach, describe, expect, it } from 'vitest';
import {
  installFortressXiangqiBoardStyles,
  renderFortressXiangqiBoardSvg,
} from './fortress-xiangqi-render.js';

describe('Fortress Xiangqi board styles', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('keeps the palace and river on the same surface color as the board', () => {
    installFortressXiangqiBoardStyles();

    const css = document.head.querySelector('style')?.textContent ?? '';

    expect(css).toContain('--fxq-board-bg: var(--xq-board-bg, #f5dca8);');
    expect(css).toContain('--fxq-palace-band: var(--fxq-board-bg, #f5dca8);');
    expect(css).toContain('--fxq-river: var(--fxq-board-bg, #f5dca8);');
    expect(css).toContain('fill: var(--fxq-river, var(--fxq-board-bg, #f5dca8));');
    expect(css).toContain('fill: var(--fxq-palace-band, var(--fxq-board-bg, #f5dca8));');
    expect(css).toContain('overflow: hidden;');
    expect(css).not.toContain('#cbd9e1');
  });

  it('leaves perimeter clipping to the board host', () => {
    const state = createInitialFortressXiangqiState('perimeter-test');
    const view = getFortressXiangqiPlayerView(state, 'red');
    const svg = renderFortressXiangqiBoardSvg(view, 'red');

    expect(svg).toContain('class="fxq-board-bg"');
    expect(svg).not.toMatch(/class="fxq-board-bg"[^>]*\srx=/);
  });
});
