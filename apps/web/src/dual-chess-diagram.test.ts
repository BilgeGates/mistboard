import { describe, expect, it } from 'vitest';
import { DUAL_START_FEN, renderDualChessBoard, renderDualChessRow } from './dual-chess-diagram.js';

// The diagram adapter parses a board FEN into a player view and draws it with the
// live renderer, re-skinned as the article's responsive shell. These lock in the
// shell wrapper and that the didactic overlays reach the real renderer's layers.
describe('Crossroads Chess article diagrams', () => {
  it('renders a single board in the article shell with both piece kinds', () => {
    const svg = renderDualChessBoard({ fen: DUAL_START_FEN });
    expect(svg).toMatch(/class="dual-article-svg"/);
    expect(svg).toMatch(/data-dual-layout="single"/);
    expect(svg).toMatch(/--dual-svg-width:/);
    // A chess piece (Cburnett SVG, 45-unit viewBox) and a xiangqi disk glyph.
    expect(svg).toMatch(/viewBox="0 0 45 45"/);
    expect(svg).toContain('車'); // white chariot disk
  });

  it('maps move dots, capture rings, and highlights onto the renderer layers', () => {
    const svg = renderDualChessBoard({
      fen: '6/6/2p3/6/2p3/6/6/2C3',
      moveDots: ['c2', 'c3'],
      captures: ['c6'],
      highlights: ['c4'],
    });
    expect(svg).toMatch(/fill="rgba\(45,100,45,0\.62\)"/); // move dot (empty target)
    expect(svg).toMatch(/stroke="rgba\(170,40,40,0\.62\)"/); // capture ring (occupied)
    expect(svg).toMatch(/fill="rgba\(255,205,80,0\.55\)"/); // highlight square
  });

  it('draws an annotation arrow for the race diagram', () => {
    const svg = renderDualChessBoard({
      fen: '2vV2/4Ko/kC4/2O3/p5/O5/5P/6',
      arrows: [{ from: 'e7', to: 'e8' }],
    });
    expect(svg).toMatch(/<marker id="dual-live-\d+-arrow"/);
    expect(svg).toMatch(/marker-end="url\(#dual-live-\d+-arrow\)"/);
  });

  it('lays out a labelled row of boards as a wide figure', () => {
    const svg = renderDualChessRow([
      { fen: '6/6/6/6/2C3/6/6/6', label: 'MOVE' },
      { fen: '6/6/2p3/6/2p3/6/6/2C3', label: 'CAPTURE' },
    ]);
    expect(svg).toMatch(/data-dual-layout="wide"/);
    expect(svg).toContain('>MOVE<');
    expect(svg).toContain('>CAPTURE<');
    // Two boards embedded as nested <svg> elements, dropped below the label band.
    expect((svg.match(/<svg x="[\d.]+" y="22"/g) ?? []).length).toBe(2);
  });
});
