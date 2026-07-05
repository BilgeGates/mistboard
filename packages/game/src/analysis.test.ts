import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accuracyPercent, moveJudgment, winPercent } from './analysis.js';

test('winPercent is 50 at even and monotonic in cp', () => {
  assert.equal(winPercent(0, null), 50);
  assert.ok(winPercent(200, null) > 50);
  assert.ok(winPercent(-200, null) < 50);
  assert.ok(winPercent(800, null) > winPercent(200, null));
  // Mate is a certainty regardless of sign magnitude.
  assert.equal(winPercent(null, 3), 100);
  assert.equal(winPercent(null, -1), 0);
  // Null (unknown) reads as even.
  assert.equal(winPercent(null, null), 50);
});

test('winPercent clamps extreme cp so it never exceeds the bounds', () => {
  assert.ok(winPercent(100000, null) <= 100);
  assert.ok(winPercent(-100000, null) >= 0);
});

test('accuracyPercent is ~100 for a non-losing move and falls with the win drop', () => {
  assert.ok(accuracyPercent(60, 60) >= 99.9);
  assert.ok(accuracyPercent(60, 62) >= 99.9); // gained win% -> no penalty
  assert.ok(accuracyPercent(60, 40) < accuracyPercent(60, 55));
  const acc = accuracyPercent(80, 30);
  assert.ok(acc >= 0 && acc < 40);
});

test('moveJudgment thresholds blunder/mistake/inaccuracy by win drop', () => {
  assert.equal(moveJudgment(60, 58), null); // 2 pts, fine
  assert.equal(moveJudgment(60, 54), 'inaccuracy'); // 6 pts
  assert.equal(moveJudgment(60, 48), 'mistake'); // 12 pts
  assert.equal(moveJudgment(60, 30), 'blunder'); // 30 pts
  assert.equal(moveJudgment(40, 60), null); // improved, not a mistake
});
