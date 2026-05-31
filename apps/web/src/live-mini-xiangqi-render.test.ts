import { createInitialMiniXiangqiState, getMiniXiangqiPlayerView } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { miniXiangqiTruthView, renderMiniXiangqiBoardSvg } from './live-mini-xiangqi-render.js';

// Traditional glyphs: red general 帥, black general 將.
const RED_GENERAL = '帥';
const BLACK_GENERAL = '將';

describe('Dark Mini Xiangqi board renderer', () => {
  it('renders an intersection board with an inverse fog mask for a player view', () => {
    const state = createInitialMiniXiangqiState('render-test');
    const view = getMiniXiangqiPlayerView(state, 'red');

    const svg = renderMiniXiangqiBoardSvg(view, 'red');

    expect(svg).toContain('class="mini-xq-board"');
    expect(svg).toContain('<mask id="mini-xq-fog-render-test-red"');
    expect(svg).toContain('mask="url(#mini-xq-fog-render-test-red)"');

    // One black cutout rect per visible intersection; nothing else uses
    // fill="black", so the counts must match.
    const cutouts = svg.match(/fill="black"/g) ?? [];
    expect(cutouts.length).toBe(view.visibleSquares.length);
  });

  it('shows the viewer their own pieces but never an identified hidden enemy', () => {
    const state = createInitialMiniXiangqiState('fog-test');
    const redView = getMiniXiangqiPlayerView(state, 'red');

    const svg = renderMiniXiangqiBoardSvg(redView, 'red');

    expect(svg).toContain(RED_GENERAL); // Red's own general at d1
    expect(svg).not.toContain(BLACK_GENERAL); // Black's general at d7 is fogged
  });

  it('reveals the whole board and drops the mask for the truth view', () => {
    const state = createInitialMiniXiangqiState('truth-test');
    const svg = renderMiniXiangqiBoardSvg(miniXiangqiTruthView(state), 'red', { showFog: false });

    expect(svg).toContain(RED_GENERAL);
    expect(svg).toContain(BLACK_GENERAL);
    expect(svg).not.toContain('<mask id=');
  });

  it('flips orientation between red and black perspectives', () => {
    const state = createInitialMiniXiangqiState('flip-test');
    const truth = miniXiangqiTruthView(state);

    const redSvg = renderMiniXiangqiBoardSvg(truth, 'red', { showFog: false });
    const blackSvg = renderMiniXiangqiBoardSvg(truth, 'black', { showFog: false });

    expect(redSvg).not.toBe(blackSvg);
  });

  it('emits interactive hit targets only when asked', () => {
    const state = createInitialMiniXiangqiState('hit-test');
    const view = getMiniXiangqiPlayerView(state, 'red');

    expect(renderMiniXiangqiBoardSvg(view, 'red', { interactive: true })).toContain('data-square=');
    expect(renderMiniXiangqiBoardSvg(view, 'red', { interactive: false })).not.toContain(
      'data-square=',
    );
  });

  it('rings visible capture destinations and dots quiet ones', () => {
    const view = {
      id: 'hint-test',
      perspective: 'red',
      board: {
        b1: { piece: { color: 'red', role: 'cannon' }, shrouded: false },
        b4: { piece: { color: 'black', role: 'soldier' }, shrouded: false },
      },
      visibleSquares: ['b1', 'b2', 'b4'],
      legalMoves: [
        { from: 'b1', to: 'b2' },
        { from: 'b1', to: 'b4' },
      ],
      status: { type: 'playing', turn: 'red' },
      moveNumber: 1,
    };

    const svg = renderMiniXiangqiBoardSvg(view as never, 'red', {
      selectedSquare: 'b1' as never,
      legalMoves: view.legalMoves as never,
    });

    // b4 holds a visible Black piece -> capture ring; b2 is empty -> quiet dot.
    expect(svg).toContain('class="mini-xq-hint-capture"');
    expect(svg).toContain('class="mini-xq-hint"');
  });
});
