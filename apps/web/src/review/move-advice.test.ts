import { describe, expect, it } from 'vitest';
import type { GameAnalysis } from './game-analysis.js';
import { createMoveAdvice } from './move-advice.js';

const analysis: GameAnalysis = {
  engineId: 'pikafish',
  depth: 12,
  evals: [
    { ply: 0, cp: 20, mate: null, best: 'h3e3' }, // engine's pick in the position before ply 1
    { ply: 1, cp: -200, mate: null, best: null },
    { ply: 2, cp: 0, mate: null, best: null },
  ],
  moves: [
    { ply: 1, mover: 'red', judgment: 'blunder', accuracy: 10 },
    { ply: 2, mover: 'black', judgment: null, accuracy: 99 },
  ],
  red: { accuracy: 10, inaccuracies: 0, mistakes: 0, blunders: 1, acpl: 200 },
  black: { accuracy: 99, inaccuracies: 0, mistakes: 0, blunders: 0, acpl: 0 },
};

describe('createMoveAdvice', () => {
  it('shows the judgment + best move for a flagged move', () => {
    const advice = createMoveAdvice();
    advice.update(1, analysis);
    expect(advice.el.hidden).toBe(false);
    expect(advice.el.textContent).toContain('Blunder.');
    expect(advice.el.textContent).toContain('h3-e3 was best.');
    expect(advice.el.className).toContain('review-advice--blunder');
  });

  it('hides for a move with no judgment', () => {
    const advice = createMoveAdvice();
    advice.update(2, analysis);
    expect(advice.el.hidden).toBe(true);
  });

  it('hides when analysis is absent', () => {
    const advice = createMoveAdvice();
    advice.update(1, null);
    expect(advice.el.hidden).toBe(true);
  });
});
