import assert from 'node:assert/strict';
import test from 'node:test';

import {
  correspondenceTimeControl,
  DAY_MS,
  DAYS_PER_MOVE_OPTIONS,
  engineTimeControlPin,
  findTimeControl,
  isAllowedEngineTimeControl,
  isOfficialCorrespondenceTimeControl,
  isOfficialTimeControl,
  isRatedTimeControl,
  RATED_TIME_CONTROLS,
  TIME_CONTROLS,
  timeClassFromTimeControl,
} from './time-controls.js';

test('TIME_CONTROLS lists the three official Mistboard time controls', () => {
  assert.equal(TIME_CONTROLS.length, 3);
  assert.deepEqual(
    TIME_CONTROLS.map((tc) => tc.id),
    ['1m1', '3m2', '5m5'],
  );
});

test('TIME_CONTROLS entries have consistent label/initialMs derivation', () => {
  for (const tc of TIME_CONTROLS) {
    const minutes = tc.initialMs / 60_000;
    const seconds = tc.incrementMs / 1_000;
    assert.equal(tc.label, `${minutes} + ${seconds}`, `label drift for ${tc.id}`);
  }
});

test('findTimeControl returns the spec for exact-match inputs', () => {
  const spec = findTimeControl(180_000, 2_000);
  assert.ok(spec);
  assert.equal(spec.id, '3m2');
  assert.equal(spec.timeClass, 'blitz');
});

test('findTimeControl returns null for unknown time controls', () => {
  assert.equal(findTimeControl(120_000, 1_000), null);
  assert.equal(findTimeControl(60_000, 0), null);
  assert.equal(findTimeControl(300_000, 3_000), null);
  assert.equal(findTimeControl(null, null), null);
  assert.equal(findTimeControl(undefined, undefined), null);
});

test('timeClassFromTimeControl classifies each official TC correctly', () => {
  assert.equal(timeClassFromTimeControl(60_000, 1_000), 'bullet');
  assert.equal(timeClassFromTimeControl(180_000, 2_000), 'blitz');
  assert.equal(timeClassFromTimeControl(300_000, 5_000), 'rapid');
});

test('timeClassFromTimeControl returns null for unknown TCs', () => {
  assert.equal(timeClassFromTimeControl(120_000, 1_000), null);
  assert.equal(timeClassFromTimeControl(60_000, 0), null);
  assert.equal(timeClassFromTimeControl(300_000, 3_000), null);
});

test('isOfficialTimeControl gates loadtest/PVE allowlists', () => {
  assert.equal(isOfficialTimeControl({ initialMs: 180_000, incrementMs: 2_000 }), true);
  assert.equal(isOfficialTimeControl({ initialMs: 600_000, incrementMs: 0 }), false);
});

test('correspondenceTimeControl mirrors the allowance into initialMs', () => {
  for (const days of DAYS_PER_MOVE_OPTIONS) {
    const tc = correspondenceTimeControl(days);
    assert.equal(tc.initialMs, days * DAY_MS);
    assert.equal(tc.incrementMs, 0);
    assert.equal(tc.daysPerMove, days);
  }
});

test('isOfficialCorrespondenceTimeControl accepts only the official shapes', () => {
  assert.equal(isOfficialCorrespondenceTimeControl(correspondenceTimeControl(3)), true);
  // Unknown day count.
  assert.equal(
    isOfficialCorrespondenceTimeControl({ initialMs: 2 * DAY_MS, incrementMs: 0, daysPerMove: 2 }),
    false,
  );
  // Allowance must mirror initialMs.
  assert.equal(
    isOfficialCorrespondenceTimeControl({ initialMs: DAY_MS, incrementMs: 0, daysPerMove: 3 }),
    false,
  );
  // Increment is meaningless under days-per-move.
  assert.equal(
    isOfficialCorrespondenceTimeControl({
      initialMs: 3 * DAY_MS,
      incrementMs: 1_000,
      daysPerMove: 3,
    }),
    false,
  );
  // A live time control is not a correspondence one.
  assert.equal(
    isOfficialCorrespondenceTimeControl({ initialMs: 180_000, incrementMs: 2_000 }),
    false,
  );
});

test('every official live pace is rated-eligible', () => {
  assert.deepEqual(
    RATED_TIME_CONTROLS.map((tc) => tc.id),
    ['1m1', '3m2', '5m5'],
  );
  for (const tc of TIME_CONTROLS) {
    assert.equal(
      isRatedTimeControl({ initialMs: tc.initialMs, incrementMs: tc.incrementMs }),
      tc.rated,
      `rated flag drift for ${tc.id}`,
    );
  }
});

test('rated eligibility rejects unofficial and correspondence paces', () => {
  assert.equal(isRatedTimeControl({ initialMs: 240_000, incrementMs: 0 }), false);
  // Correspondence can never be rated: engine assistance is unenforceable at
  // days-per-move, and the perfect-information correspondence allowance rests
  // on it staying casual.
  assert.equal(isRatedTimeControl(correspondenceTimeControl(1)), false);
  // Including a forged claim whose ms values collide with a live spec.
  assert.equal(
    isRatedTimeControl({ initialMs: 180_000, incrementMs: 2_000, daysPerMove: 1 }),
    false,
  );
});

test('the live allowlist rejects correspondence time controls', () => {
  assert.equal(isOfficialTimeControl(correspondenceTimeControl(1)), false);
  // Even a malformed claim whose ms values collide with a live spec.
  assert.equal(
    isOfficialTimeControl({ initialMs: 180_000, incrementMs: 2_000, daysPerMove: 1 }),
    false,
  );
});

// Fog Chess Misty cannot honor a 1s or 2s increment: its per-move cost has a
// floor the increment does not cover, so it drains its bank and loses on time
// in long games (#283). Both the picker and the create route derive from this.
test('the engine pin scopes fog bot games to 5+5', () => {
  const pin = engineTimeControlPin('dark-chess');
  assert.equal(pin?.id, '5m5');
  // Draft960 is the same engine on a shuffled back rank, so it shares the pin
  // rather than becoming the way around it.
  assert.equal(engineTimeControlPin('dark-draft960')?.id, '5m5');
  // Fog xiangqi runs its own belief stack, pinned on the shared-mechanism
  // argument rather than its own measured flag.
  assert.equal(engineTimeControlPin('dark-xiangqi')?.id, '5m5');

  assert.equal(
    isAllowedEngineTimeControl('dark-chess', { initialMs: 300_000, incrementMs: 5_000 }),
    true,
  );
  assert.equal(
    isAllowedEngineTimeControl('dark-chess', { initialMs: 180_000, incrementMs: 2_000 }),
    false,
  );
  assert.equal(
    isAllowedEngineTimeControl('dark-draft960', { initialMs: 60_000, incrementMs: 1_000 }),
    false,
  );
  assert.equal(
    isAllowedEngineTimeControl('dark-xiangqi', { initialMs: 180_000, incrementMs: 2_000 }),
    false,
  );
});

test('unpinned specs accept every pace their own allowlist offers', () => {
  // Engines with a bounded per-move cost are absent from the pin map; the
  // variant's own time-control allowlist stays the only constraint on them.
  assert.equal(engineTimeControlPin('xiangqi'), null);
  assert.equal(engineTimeControlPin('banqi'), null);
  for (const tc of TIME_CONTROLS) {
    assert.equal(
      isAllowedEngineTimeControl('xiangqi', {
        initialMs: tc.initialMs,
        incrementMs: tc.incrementMs,
      }),
      true,
    );
  }
});
