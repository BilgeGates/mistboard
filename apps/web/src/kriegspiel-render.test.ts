import { createInitialKriegspielState, getKriegspielPlayerView } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { renderKriegspielBoardSvg } from './kriegspiel-render.js';

describe('Kriegspiel board renderer', () => {
  it('renders a clean 8x8 board without coordinate labels', () => {
    const view = getKriegspielPlayerView(createInitialKriegspielState('ksg-clean'), 'white');
    const svg = renderKriegspielBoardSvg(view);

    expect(svg).toContain('class="kriegspiel-live-svg"');
    expect(svg).not.toContain('>a</text>');
    expect(svg).not.toContain('>1</text>');
  });

  it('emits fog squares for appearance-driven dark-chess fog styling', () => {
    const view = getKriegspielPlayerView(createInitialKriegspielState('ksg-fog'), 'white');
    const svg = renderKriegspielBoardSvg(view, { showFog: true });

    expect(svg).toContain('kriegspiel-fog-square kriegspiel-fog-square--light');
    expect(svg).toContain('kriegspiel-fog-square kriegspiel-fog-square--dark');
    expect(svg).toContain('kriegspiel-fog-tint kriegspiel-fog-tint--light');
    expect(svg).toContain('kriegspiel-fog-tint kriegspiel-fog-tint--dark');
    expect(svg).toContain('/fog/fog.webp');
    expect(svg).toContain('/fog/mistveil.webp');
    expect(svg).toMatch(/fill="url\(#kriegspiel-live-\d+-fog-light\)"/);
  });

  it('renders pieces at the full dark-chess square scale', () => {
    const view = getKriegspielPlayerView(createInitialKriegspielState('ksg-pieces'), 'white');
    const svg = renderKriegspielBoardSvg(view, { showFog: false });

    expect(svg).toMatch(/<svg x="\d+" y="\d+" width="50" height="50" viewBox="0 0 45 45"/);
    expect(svg).not.toContain('width="43" height="43"');
  });

  it('uses the active chess piece-set assets when requested', () => {
    const view = getKriegspielPlayerView(createInitialKriegspielState('ksg-piece-set'), 'white');
    const svg = renderKriegspielBoardSvg(view, { pieceSet: 'letter', showFog: false });

    expect(svg).toContain('/pieces/letter/wK.svg');
    expect(svg).toContain('/pieces/letter/wP.svg');
  });
});
