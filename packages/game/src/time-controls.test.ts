import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TIME_CONTROLS,
  findTimeControl,
  timeClassFromTimeControl,
  isOfficialTimeControl,
} from './time-controls.js';

test('TIME_CONTROLS lists the three official Mistboard time controls', () => {
  assert.equal(TIME_CONTROLS.length, 3);
  assert.deepEqual(
    TIME_CONTROLS.map((tc) => tc.id),
    ['1m1', '3m2', '5m3'],
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
  assert.equal(findTimeControl(null, null), null);
  assert.equal(findTimeControl(undefined, undefined), null);
});

test('timeClassFromTimeControl classifies each official TC correctly', () => {
  assert.equal(timeClassFromTimeControl(60_000, 1_000), 'bullet');
  assert.equal(timeClassFromTimeControl(180_000, 2_000), 'blitz');
  assert.equal(timeClassFromTimeControl(300_000, 3_000), 'blitz');
});

test('timeClassFromTimeControl returns null for unknown TCs', () => {
  assert.equal(timeClassFromTimeControl(120_000, 1_000), null);
  assert.equal(timeClassFromTimeControl(60_000, 0), null);
});

test('isOfficialTimeControl gates loadtest/PVE allowlists', () => {
  assert.equal(isOfficialTimeControl({ initialMs: 180_000, incrementMs: 2_000 }), true);
  assert.equal(isOfficialTimeControl({ initialMs: 600_000, incrementMs: 0 }), false);
});
