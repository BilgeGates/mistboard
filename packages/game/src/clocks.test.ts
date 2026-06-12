import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceClock, clockPolicyKindFor, createClock, nextClockForMove } from './clocks.js';
import { correspondenceTimeControl, DAY_MS } from './time-controls.js';
import type { ClockState } from './types.js';

// A clock already armed and ticking for white — the post-first-moves state
// the per-move transition operates on.
function armedClock(at: number, initialMs: number, incrementMs = 0): ClockState {
  return { ...createClock(at, initialMs, incrementMs), activeColor: 'white', runningSince: at };
}

test('clockPolicyKindFor selects days-per-move only when the allowance is present', () => {
  assert.equal(clockPolicyKindFor(undefined), 'live');
  assert.equal(clockPolicyKindFor(null), 'live');
  assert.equal(clockPolicyKindFor({}), 'live');
  assert.equal(clockPolicyKindFor({ daysPerMove: 3 }), 'days-per-move');
  assert.equal(clockPolicyKindFor(correspondenceTimeControl(1)), 'days-per-move');
});

test('days-per-move resets the mover to the full allowance after a completed move', () => {
  const clock = armedClock(0, 3 * DAY_MS);
  const next = advanceClock(
    clock,
    DAY_MS,
    'white',
    { type: 'playing', turn: 'black' },
    'days-per-move',
  );
  assert.ok(next);
  assert.equal(next.remainingMs.white, 3 * DAY_MS);
  assert.equal(next.remainingMs.black, 3 * DAY_MS);
  assert.equal(next.activeColor, 'black');
  assert.equal(next.runningSince, DAY_MS);
});

test('the default live policy still banks remaining time plus increment', () => {
  const clock = armedClock(0, 3 * DAY_MS, 5_000);
  const next = advanceClock(clock, DAY_MS, 'white', { type: 'playing', turn: 'black' });
  assert.ok(next);
  assert.equal(next.remainingMs.white, 2 * DAY_MS + 5_000);
});

test('days-per-move keeps the spent value on a game-ending move', () => {
  const clock = armedClock(0, 3 * DAY_MS);
  const next = advanceClock(
    clock,
    DAY_MS,
    'white',
    { type: 'finished', winner: 'white', reason: 'king-captured' },
    'days-per-move',
  );
  assert.ok(next);
  assert.equal(next.remainingMs.white, 2 * DAY_MS);
  assert.equal(next.activeColor, null);
  assert.equal(next.runningSince, null);
});

test('pregame arming is shared across policies', () => {
  const frozen = createClock(0, 3 * DAY_MS, 0);
  const afterWhite = nextClockForMove(
    frozen,
    10,
    'white',
    1,
    { type: 'playing', turn: 'black' },
    'days-per-move',
  );
  assert.ok(afterWhite);
  assert.equal(afterWhite.runningSince, null);
  const armed = nextClockForMove(
    afterWhite,
    20,
    'black',
    1,
    { type: 'playing', turn: 'white' },
    'days-per-move',
  );
  assert.ok(armed);
  assert.equal(armed.activeColor, 'white');
  assert.equal(armed.runningSince, 20);
  assert.equal(armed.remainingMs.white, 3 * DAY_MS);
  assert.equal(armed.remainingMs.black, 3 * DAY_MS);
});
