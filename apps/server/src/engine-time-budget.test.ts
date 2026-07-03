import assert from 'node:assert/strict';
import test from 'node:test';

import { budgetForMove } from './engine-time-budget.js';

// Fortress Strongest tier: node budget 800k anchors strength; movetime is the
// latency ceiling. Time controls in play: 1+1, 3+2, 5+5.
const CEIL = 6_000;

test('untimed game thinks for the full ceiling', () => {
  const b = budgetForMove({ remainingMs: null, incrementMs: 0, ceilingMs: CEIL });
  assert.equal(b.computeBudgetMs, CEIL);
  assert.ok(b.watchdogTimeoutMs >= CEIL);
});

test('healthy clock (5+5 start) lets the budget reach toward the ceiling', () => {
  // 300s bank / 30 moves ≈ 10s → clamped to the 6s ceiling.
  const b = budgetForMove({ remainingMs: 300_000, incrementMs: 5_000, ceilingMs: CEIL });
  assert.equal(b.computeBudgetMs, CEIL);
});

test('blitz start (3+2) allocates proportionally under the ceiling', () => {
  // (180000-1000)/30 ≈ 5967 + 0.8*2000 = 1600 → 7567, clamped to 6000.
  const b = budgetForMove({ remainingMs: 180_000, incrementMs: 2_000, ceilingMs: CEIL });
  assert.equal(b.computeBudgetMs, CEIL);
});

test('bullet start (1+1) is smaller but still substantial', () => {
  // (60000-1000)/30 ≈ 1967 + 0.8*1000 = 800 → ~2767.
  const b = budgetForMove({ remainingMs: 60_000, incrementMs: 1_000, ceilingMs: CEIL });
  assert.ok(b.computeBudgetMs > 2_000 && b.computeBudgetMs < 3_200, `got ${b.computeBudgetMs}`);
});

test('increment increases the budget', () => {
  const noInc = budgetForMove({ remainingMs: 60_000, incrementMs: 0, ceilingMs: CEIL });
  const withInc = budgetForMove({ remainingMs: 60_000, incrementMs: 3_000, ceilingMs: CEIL });
  assert.ok(withInc.computeBudgetMs > noInc.computeBudgetMs);
});

test('time pressure shrinks the budget and never exceeds usable clock', () => {
  // 2.5s left, 1s reserve → 1.5s usable. Budget must not exceed usable.
  const b = budgetForMove({
    remainingMs: 2_500,
    incrementMs: 0,
    ceilingMs: CEIL,
    reserveMs: 1_000,
  });
  assert.ok(b.computeBudgetMs <= 1_500, `budget ${b.computeBudgetMs} exceeds usable 1500`);
  assert.ok(b.computeBudgetMs >= 50);
});

test('severe time pressure (reserve spent) returns the floor', () => {
  const b = budgetForMove({
    remainingMs: 800,
    incrementMs: 0,
    ceilingMs: CEIL,
    reserveMs: 1_000,
    floorMs: 50,
  });
  assert.equal(b.computeBudgetMs, 50);
});

test('budget respects a custom floor when usable is tiny but positive', () => {
  // usable = 1200-1000 = 200 < floor(500) → spend all 200, not 500.
  const b = budgetForMove({
    remainingMs: 1_200,
    incrementMs: 0,
    ceilingMs: CEIL,
    reserveMs: 1_000,
    floorMs: 500,
  });
  assert.equal(b.computeBudgetMs, 200);
});

test('watchdog never exceeds remaining + grace nor the absolute cap', () => {
  const b = budgetForMove({
    remainingMs: 300_000,
    incrementMs: 5_000,
    ceilingMs: CEIL,
    clockGraceMs: 2_000,
    maxWatchdogMs: 60_000,
  });
  assert.ok(b.watchdogTimeoutMs <= 60_000);
  assert.ok(b.watchdogTimeoutMs <= 300_000 + 2_000);
  assert.ok(b.watchdogTimeoutMs >= b.computeBudgetMs);
});

test('lower tier ceiling caps the budget even with a healthy clock', () => {
  // Amateur-like 1500ms ceiling: node budget binds long before, movetime just guards latency.
  const b = budgetForMove({ remainingMs: 300_000, incrementMs: 5_000, ceilingMs: 1_500 });
  assert.equal(b.computeBudgetMs, 1_500);
});
