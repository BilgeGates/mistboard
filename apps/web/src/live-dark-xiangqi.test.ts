import { describe, expect, it } from 'vitest';
import {
  type DarkXiangqiWireView,
  darkXiangqiClickResult,
  renderDarkXiangqiBoardSvg,
} from './live-dark-xiangqi.js';

// The room chrome (clocks, countdowns, action status, confirm dialogs, room
// actions) is pinned by room-chrome.test.ts and the DMX room suite; this file
// pins what stays Dark-Xiangqi-owned — the intersection-board SVG with its
// fog mask, and the pure click-to-move decision over a fog view (the
// web-side half of the hidden-info guarantee).

describe('Dark Xiangqi board svg', () => {
  it('renders the article-style intersection board instead of a cell grid', () => {
    const svg = renderDarkXiangqiBoardSvg(viewFixture());

    expect(svg).toContain('viewBox="0 0 552 612"');
    expect(svg.match(/xq-live-line/g)).toHaveLength(26);
    expect(svg).not.toContain('xq-live-cell');
    expect(svg).toContain('楚 河   漢 界');
    expect(svg).toContain('xq-live-border');
  });

  it('keeps shrouded pieces role-neutral in the DOM', () => {
    const svg = renderDarkXiangqiBoardSvg(viewFixture());

    expect(svg).toContain('aria-label="black hidden piece"');
    expect(svg).not.toContain('aria-label="black soldier"');
  });

  it('masks fog by default and drops the mask when fog is off', () => {
    expect(renderDarkXiangqiBoardSvg(viewFixture())).toContain('xq-live-fog-mask');
    expect(renderDarkXiangqiBoardSvg(viewFixture(), 'red', { showFog: false })).not.toContain(
      'xq-live-fog-mask',
    );
  });
});

describe('Dark Xiangqi click-to-move decisions', () => {
  it('selects an own visible piece with legal moves', () => {
    expect(darkXiangqiClickResult(viewFixture(), 'red', null, 'b3')).toEqual({
      kind: 'select',
      square: 'b3',
    });
  });

  it('submits a legal move from a selected piece', () => {
    expect(darkXiangqiClickResult(viewFixture(), 'red', 'b3', 'b4')).toEqual({
      kind: 'move',
      move: { from: 'b3', to: 'b4' },
    });
  });

  it('never selects a shrouded opponent piece', () => {
    expect(darkXiangqiClickResult(viewFixture(), 'red', null, 'b8')).toEqual({ kind: 'noop' });
  });

  it('clears the selection on a repeated click', () => {
    expect(darkXiangqiClickResult(viewFixture(), 'red', 'b3', 'b3')).toEqual({ kind: 'clear' });
  });

  it('ignores clicks off-turn and from spectators', () => {
    const offTurn: DarkXiangqiWireView = {
      ...viewFixture(),
      status: { type: 'playing', turn: 'black' },
    };
    expect(darkXiangqiClickResult(offTurn, 'red', null, 'b3')).toEqual({ kind: 'noop' });
    expect(darkXiangqiClickResult(viewFixture(), 'spectator', null, 'b3')).toEqual({
      kind: 'noop',
    });
  });

  it('ignores clicks once the game is over', () => {
    const finished: DarkXiangqiWireView = {
      ...viewFixture(),
      status: { type: 'finished', winner: 'red', reason: 'general-captured' },
      legalMoves: [],
    };
    expect(darkXiangqiClickResult(finished, 'red', null, 'b3')).toEqual({ kind: 'noop' });
  });
});

function viewFixture(): DarkXiangqiWireView {
  return {
    id: 'xq-test',
    perspective: 'red',
    board: {
      b3: { piece: { color: 'red', role: 'cannon' }, shrouded: false },
      b8: { color: 'black', shrouded: true },
    },
    visibleSquares: ['b3', 'b4', 'b8'],
    legalMoves: [{ from: 'b3', to: 'b4' }],
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
  };
}
