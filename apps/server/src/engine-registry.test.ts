import assert from 'node:assert/strict';
import test from 'node:test';
import { isPlayableLiveEngineClientId } from './engine-registry.js';

test('playable live engine client ids = the single streamlined PVE engine (Misty)', () => {
  // Streamlined release (2026-06-02): only Misty (python-v2-v1.0) is player-facing.
  assert.equal(isPlayableLiveEngineClientId('python-v2-v1.0'), true);
});

test('playable live engine client ids exclude hidden, retired, EvE aliases, and humans', () => {
  // Legacy + Random remain in the registry (EvE/testing/records) but are no
  // longer offered in the live PvE picker → not playable. The 'random-engine'
  // sentinel resolves to builtin-random-legal, so it is excluded too.
  assert.equal(isPlayableLiveEngineClientId('builtin-random-legal'), false);
  assert.equal(isPlayableLiveEngineClientId('python-tier1-v0.9.5'), false);
  assert.equal(isPlayableLiveEngineClientId('random-engine'), false);
  assert.equal(isPlayableLiveEngineClientId('builtin-capture-seeker'), false);
  assert.equal(isPlayableLiveEngineClientId('python-tier1-v0.9.1'), false);
  assert.equal(isPlayableLiveEngineClientId('python-tier1-v0.8.9'), false);
  assert.equal(isPlayableLiveEngineClientId('python-tier1-v0.7.22'), false);
  assert.equal(isPlayableLiveEngineClientId('engine:black'), false);
  assert.equal(isPlayableLiveEngineClientId('human-black'), false);
  assert.equal(isPlayableLiveEngineClientId(undefined), false);
});
