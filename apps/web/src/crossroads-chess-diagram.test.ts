import { XIANGQI_GLYPH_PATHS } from '@mistboard/board-render';
import { describe, expect, it } from 'vitest';
import {
  CROSSROADS_CHESS_START_FEN,
  renderCrossroadsChessBoard,
  renderCrossroadsChessRow,
} from './crossroads-chess-diagram.js';

// The diagram adapter parses a board FEN into a player view and draws it with the
// live renderer, re-skinned as the article's responsive shell. These lock in the
// shell wrapper and that the didactic overlays reach the real renderer's layers.
describe('Crossroads Chess article diagrams', () => {
  it('renders a single board in the article shell with both piece kinds', () => {
    // Pin the glyph set so the CJK-disk probe below is stable regardless of the
    // product default (which is animal art).
    const svg = renderCrossroadsChessBoard({
      fen: CROSSROADS_CHESS_START_FEN,
      xiangqiPieceSet: 'traditional',
    });
    expect(svg).toMatch(/class="crossroads-article-svg"/);
    expect(svg).toMatch(/data-crossroads-layout="single"/);
    expect(svg).toMatch(/--crossroads-svg-width:/);
    // A chess piece (Cburnett SVG, 45-unit viewBox) and a xiangqi disk glyph.
    expect(svg).toMatch(/viewBox="0 0 45 45"/);
    expect(svg).toContain(XIANGQI_GLYPH_PATHS.車); // white chariot disk
  });

  it('maps move dots, capture rings, and highlights onto the renderer layers', () => {
    const svg = renderCrossroadsChessBoard({
      fen: '6/6/2p3/6/2p3/6/6/2C3',
      moveDots: ['c2', 'c3'],
      captures: ['c6'],
      highlights: ['c4'],
    });
    expect(svg).toMatch(/fill="rgba\(31,111,91,0\.72\)"/); // move dot (empty target)
    expect(svg).toMatch(/stroke="rgba\(31,111,91,0\.48\)"/); // capture ring (occupied)
    expect(svg).toMatch(/fill="rgba\(31,111,91,0\.32\)"/); // highlight square
  });

  it('draws an annotation arrow for the race diagram', () => {
    const svg = renderCrossroadsChessBoard({
      fen: '2vV2/4Ko/kC4/2O3/p5/O5/5P/6',
      arrows: [{ from: 'e7', to: 'e8' }],
    });
    expect(svg).toMatch(/<marker id="crossroads-live-\d+-arrow"/);
    expect(svg).toMatch(/marker-end="url\(#crossroads-live-\d+-arrow\)"/);
  });

  it('draws crossed-out targets for blocked moves', () => {
    const svg = renderCrossroadsChessBoard({
      fen: '6/6/6/2P3/2H1o1/6/6/6',
      crosses: ['b6', 'd6'],
    });
    expect(svg).toContain('class="crossroads-article-cross"');
    expect((svg.match(/class="crossroads-article-cross"/g) ?? []).length).toBe(2);
    expect(svg.lastIndexOf('class="crossroads-article-cross"')).toBeGreaterThan(
      svg.indexOf('<g transform'),
    );
  });

  it('lays out a labelled row of boards as a wide figure', () => {
    const svg = renderCrossroadsChessRow([
      { fen: '6/6/6/6/2C3/6/6/6', label: 'MOVE' },
      { fen: '6/6/2p3/6/2p3/6/6/2C3', label: 'CAPTURE' },
    ]);
    expect(svg).toMatch(/data-crossroads-layout="wide"/);
    expect(svg).toContain('>MOVE<');
    expect(svg).toContain('>CAPTURE<');
    // Two boards embedded as nested <svg> elements, dropped below the label band.
    expect((svg.match(/<svg x="[\d.]+" y="22"/g) ?? []).length).toBe(2);
  });
});
