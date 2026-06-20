import { createInitialCrazyhouseState, getCrazyhousePlayerView } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { renderCrazyhouseBoardSvg } from './crazyhouse-render.js';

describe('Dark Crazyhouse board renderer', () => {
  it('uses the dark-chess board frame and square tokens', () => {
    const view = getCrazyhousePlayerView(createInitialCrazyhouseState('dczh-style'), 'white');
    const svg = renderCrazyhouseBoardSvg(view, { showFog: false });

    expect(svg).toContain('class="crazyhouse-live-svg"');
    expect(svg).toContain('var(--board-frame)');
    expect(svg).toContain('var(--board-light)');
    expect(svg).toContain('var(--board-dark)');
    expect(svg).not.toContain('var(--crossroads-');
  });

  it('emits light and dark fog squares for themed dark-chess fog styling', () => {
    const view = getCrazyhousePlayerView(createInitialCrazyhouseState('dczh-fog'), 'white');
    const svg = renderCrazyhouseBoardSvg(view, { showFog: true });

    expect(svg).toContain('crazyhouse-fog-square crazyhouse-fog-square--light');
    expect(svg).toContain('crazyhouse-fog-square crazyhouse-fog-square--dark');
    expect(svg).not.toContain('var(--board-fog-light-fill)');
  });

  it('renders board pieces at the full dark-chess square scale', () => {
    const view = getCrazyhousePlayerView(createInitialCrazyhouseState('dczh-pieces'), 'white');
    const svg = renderCrazyhouseBoardSvg(view, { showFog: false });

    expect(svg).toMatch(/<svg x="\d+" y="\d+" width="50" height="50" viewBox="0 0 45 45"/);
    expect(svg).not.toContain('width="43" height="43"');
  });
});
