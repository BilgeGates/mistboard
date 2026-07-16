/**
 * FULL kernel verification of the shipped Jungle puzzle corpus. Deliberately OFF
 * the unit hot path: validateJunglePuzzle re-searches every forced win, so this
 * grows linearly with the corpus (~20s+ already) and was the long pole of the
 * whole @mistboard/game unit suite.
 *
 * The `.slowtest.ts` suffix keeps it out of `test:unit` (`src/**\/*.test.ts`) and
 * the compiled `test` glob (`dist/**\/*.test.js`). It runs via the dedicated
 * `test:puzzles:corpus` script, wired as its own CI job.
 *
 * The fast unit file (puzzles-jungle.test.ts) still verifies a deterministic
 * sample and pins the corpus count + content hash, so any corpus edit fails fast
 * there and points here for the full gate.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JUNGLE_PUZZLES, validateJunglePuzzle } from './puzzles-jungle.js';

test('every shipped Jungle puzzle validates as a forced win (full corpus)', () => {
  assert.ok(JUNGLE_PUZZLES.length > 0, 'corpus is non-empty');
  for (const puzzle of JUNGLE_PUZZLES) {
    const result = validateJunglePuzzle(puzzle);
    assert.ok(result.ok, `${puzzle.id} invalid: ${result.ok ? '' : result.issue.message}`);
  }
});
