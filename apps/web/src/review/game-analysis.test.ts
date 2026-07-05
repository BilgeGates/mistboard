import { describe, expect, it } from 'vitest';
import { computeGameAnalysis } from './game-analysis.js';

const evals = (cps: (number | null)[]) => ({
  engineId: 'pikafish',
  depth: 12,
  plies: cps.map((cp, ply) => ({ ply, cp, mate: null, best: null })),
});

describe('computeGameAnalysis', () => {
  it('assigns movers by ply parity (Red on odd plies)', () => {
    const a = computeGameAnalysis(evals([0, 20, 15, 30]));
    expect(a.moves.map((m) => m.mover)).toEqual(['red', 'black', 'red']);
    expect(a.moves.map((m) => m.ply)).toEqual([1, 2, 3]);
  });

  it('flags a Red blunder when Red POV collapses on a Red move', () => {
    // ply 1 is Red's move; Red POV drops 0 -> -600 (Red gave up ~30 win%).
    const a = computeGameAnalysis(evals([0, -600]));
    expect(a.moves[0]?.mover).toBe('red');
    expect(a.moves[0]?.judgment).toBe('blunder');
    expect(a.red.blunders).toBe(1);
    expect(a.red.accuracy).toBeLessThan(60);
    expect(a.black.blunders).toBe(0);
  });

  it('a Black move that improves Black is not penalised', () => {
    // ply 2 is Black's move; Red POV drops 200 -> 0, i.e. Black improved.
    const a = computeGameAnalysis(evals([0, 200, 0]));
    const blackMove = a.moves.find((m) => m.mover === 'black');
    expect(blackMove?.judgment).toBeNull();
    expect(blackMove?.accuracy).toBeGreaterThan(95);
  });

  it('reports ACPL and keeps accuracy within [0, 100]', () => {
    const a = computeGameAnalysis(evals([0, 20, -10, 40]));
    expect(a.red.acpl).toBeGreaterThanOrEqual(0);
    expect(a.red.accuracy).toBeGreaterThanOrEqual(0);
    expect(a.red.accuracy).toBeLessThanOrEqual(100);
  });
});
