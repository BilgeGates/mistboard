import { describe, expect, it } from 'vitest';
import { mountVariantMarksLab } from './variant-marks-lab.js';
import { renderVariantMiniBoard } from './variant-mini-boards.js';

describe('variant mini-board markers', () => {
  it('renders the Kriegspiel marker as a fogged own-army board', () => {
    const svg = renderVariantMiniBoard('kriegspiel', { size: 100 });

    expect(svg).toContain('data-mini-id="kriegspiel"');
    expect(svg.match(/class="vm-chess-fog"/g)).toHaveLength(15);
    expect(svg).toContain('vm-frame-chess');
  });

  it('renders the Dark Crossroads marker as a fogged river board', () => {
    const svg = renderVariantMiniBoard('dark-crossroads', { size: 100 });
    const host = document.createElement('div');
    host.innerHTML = svg;
    const fogCells = [...host.querySelectorAll<SVGRectElement>('rect.vm-chess-fog')].map((rect) => [
      rect.getAttribute('x'),
      rect.getAttribute('y'),
    ]);

    expect(svg).toContain('data-mini-id="dark-crossroads"');
    expect(svg).toContain('vm-river');
    expect(fogCells).toEqual([
      ['2', '9'],
      ['26', '9'],
    ]);
    expect(svg).toContain('vm-frame-chess');
  });

  it('renders the Dark Crazyhouse marker with the shared Crazyhouse image', () => {
    const svg = renderVariantMiniBoard('dark-crazyhouse', { size: 100 });

    expect(svg).toContain('data-mini-id="dark-crazyhouse"');
    expect(svg).toContain('vm-hand-tray');
    expect(svg).not.toContain('vm-chess-fog');
    expect(svg).toContain('vm-frame-chess');
  });

  it('renders the Reveal Chess marker backs as white Banqi-style outlined discs', () => {
    const svg = renderVariantMiniBoard('reveal-chess', { size: 100 });
    const host = document.createElement('div');
    host.innerHTML = svg;
    const backs = [...host.querySelectorAll<SVGCircleElement>('circle.vm-chess-back-token')];

    expect(svg).toContain('data-mini-id="reveal-chess"');
    expect(backs).toHaveLength(7);
    for (const back of backs) {
      expect(back.getAttribute('fill')).toBe('#f4efe4');
      expect(back.getAttribute('stroke')).toBe('#3a342b');
      expect(back.getAttribute('stroke-width')).toBe('0.5');
    }
    expect(svg).not.toContain('stroke-width="2"');
    expect(svg).not.toContain('opacity="0.4"');
  });

  it('includes Kriegspiel, Dark Crossroads, and Dark Crazyhouse on the marker lab sheet', () => {
    const root = document.createElement('div');

    mountVariantMarksLab(root);

    expect(root.querySelector('svg[data-mini-id="kriegspiel"]')).not.toBeNull();
    expect(root.querySelector('svg[data-mini-id="dark-crossroads"]')).not.toBeNull();
    expect(root.querySelector('svg[data-mini-id="dark-crazyhouse"]')).not.toBeNull();
  });
});
