import { describe, expect, it } from 'vitest';
import { decisionView, type JieqiDecision, summarizeDecisions } from './jieqi-decisions.js';

const cp = (n: number | null): { cp: number | null; mate: number | null } => ({
  cp: n,
  mate: null,
});

function decision(p: Partial<JieqiDecision>): JieqiDecision {
  return {
    ply: 1,
    mover: 'red',
    best: cp(0),
    played: cp(0),
    realized: cp(0),
    playedRank: 1,
    ...p,
  };
}

describe('decisionView', () => {
  it('leaves a within-noise decision loss unjudged (cp deadband)', () => {
    // best 30cp > played, i.e. a ~30cp loss — inside the ~40cp noise floor, so no glyph even
    // though the win% drop alone might tip past the inaccuracy threshold near even.
    const v = decisionView(decision({ best: cp(30), played: cp(0) }));
    expect(v.judgment).toBeNull();
    expect(v.decisionLoss).toBeGreaterThan(0); // still reported as a (small) loss
  });

  it('grades a real decision loss beyond the noise floor', () => {
    // A large cp gap near even is a genuine blunder-tier choice.
    const v = decisionView(decision({ best: cp(400), played: cp(-200) }));
    expect(v.judgment).toBe('blunder');
    expect(v.decisionLoss).toBeGreaterThan(15);
  });

  it('decisionLoss is clamped at 0 (played can never beat best)', () => {
    const v = decisionView(decision({ best: cp(100), played: cp(150) }));
    expect(v.decisionLoss).toBe(0);
  });

  it('luck is the signed swing of realized vs played (independent of the decision)', () => {
    // Perfect choice (played == best) but the reveal came out worse than expected: pure bad luck.
    const v = decisionView(decision({ best: cp(200), played: cp(200), realized: cp(-100) }));
    expect(v.judgment).toBeNull(); // the DECISION was best
    expect(v.luck).toBeLessThan(0); // but the reveal was unlucky
  });

  it('grades missing a forced mate even though cp is null (deadband does not apply)', () => {
    const v = decisionView(decision({ best: { cp: null, mate: 2 }, played: cp(-100) }));
    expect(v.judgment).toBe('blunder');
  });
});

describe('summarizeDecisions', () => {
  it('aggregates per mover: reveal count, mean accuracy, net luck', () => {
    const summary = summarizeDecisions([
      decision({ ply: 1, mover: 'red', best: cp(200), played: cp(200), realized: cp(120) }), // -lucky
      decision({ ply: 3, mover: 'red', best: cp(400), played: cp(-200), realized: cp(-260) }), // bad choice
      decision({ ply: 2, mover: 'black', best: cp(100), played: cp(100), realized: cp(300) }), // +lucky
    ]);
    expect(summary.red.reveals).toBe(2);
    expect(summary.black.reveals).toBe(1);
    // Red made one perfect + one poor decision, so accuracy is below 100.
    expect(summary.red.decisionAccuracy).toBeLessThan(100);
    // Black's single reveal was a perfect choice, so ~100% decision accuracy.
    expect(summary.black.decisionAccuracy).toBeGreaterThan(95);
    // Red's reveals came out worse than expected (net negative luck); Black's better (positive).
    expect(summary.red.netLuck).toBeLessThan(0);
    expect(summary.black.netLuck).toBeGreaterThan(0);
    // byPly is keyed by ply for move-list lookups.
    expect(summary.byPly.get(3)?.mover).toBe('red');
  });

  it('a player with no reveals reports 100% decision accuracy and zero luck', () => {
    const summary = summarizeDecisions([
      decision({ ply: 1, mover: 'red', best: cp(0), played: cp(0), realized: cp(0) }),
    ]);
    expect(summary.black.reveals).toBe(0);
    expect(summary.black.decisionAccuracy).toBe(100);
    expect(summary.black.netLuck).toBe(0);
  });
});
