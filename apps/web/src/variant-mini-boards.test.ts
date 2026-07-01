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

  it('renders the Drop Mini Xiangqi marker with an open board and reserve tray', () => {
    const svg = renderVariantMiniBoard('drop-mini-xiangqi', { size: 100 });

    expect(svg).toContain('data-mini-id="drop-mini-xiangqi"');
    expect(svg).toContain('vm-hand-tray');
    expect(svg).not.toContain('vm-xq-fog');
    expect(svg).toContain('vm-frame-xq');
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

  it('renders the Jungle marker as the bottom-center 3x3 (den + traps) of the real board', () => {
    const svg = renderVariantMiniBoard('jungle', { size: 100 });
    expect(svg).toContain('data-mini-id="jungle"');
    expect(svg).toContain('vm-frame-jungle');
    // The real dobutsu board cropped to files c-e: grass + the den + trap tiles + the
    // leopard (c3) and wolf (e3), in its own frame (not the xiangqi wood-brown).
    expect(svg).toContain('/piece-sets/jungle/dobutsu/board/grass.png');
    expect(svg).toContain('/piece-sets/jungle/dobutsu/board/den.png');
    expect(svg).toContain('/piece-sets/jungle/dobutsu/board/trap.png');
    expect(svg).toContain('/piece-sets/jungle/dobutsu/red-leopard.png');
    expect(svg).toContain('/piece-sets/jungle/dobutsu/red-wolf.png');
    expect(svg).not.toContain('vm-xq-fog');
  });

  it('renders the Flip Jungle marker as a 2x2 with two flipped elephants on opposite corners', () => {
    const svg = renderVariantMiniBoard('jungle-flip', { size: 100 });
    expect(svg).toContain('data-mini-id="jungle-flip"');
    expect(svg).toContain('vm-frame-jungle');
    // The real flip board cropped: the bushy board + a face-down jade disc, plus the red
    // and black elephants flipped up on opposite corners.
    expect(svg).toContain('/piece-sets/jungle/dobutsu/board/flip-board.png');
    expect(svg).toContain('fill="#2f8f6b"');
    expect(svg).toContain('/piece-sets/jungle/dobutsu/red-elephant.png');
    expect(svg).toContain('/piece-sets/jungle/dobutsu/black-elephant.png');
  });

  it('includes Kriegspiel, Drop Mini, Dark Crossroads, and Dark Crazyhouse on the marker lab sheet', () => {
    const root = document.createElement('div');

    mountVariantMarksLab(root);

    expect(root.querySelector('svg[data-mini-id="kriegspiel"]')).not.toBeNull();
    expect(root.querySelector('svg[data-mini-id="drop-mini-xiangqi"]')).not.toBeNull();
    expect(root.querySelector('svg[data-mini-id="dark-crossroads"]')).not.toBeNull();
    expect(root.querySelector('svg[data-mini-id="dark-crazyhouse"]')).not.toBeNull();
    expect(root.querySelector('svg[data-mini-id="jungle"]')).not.toBeNull();
    expect(root.querySelector('svg[data-mini-id="jungle-flip"]')).not.toBeNull();
  });
});
