import assert from 'node:assert/strict';
import test from 'node:test';
import { isPlayableLiveEngineClientId } from './engine-registry.js';

test('playable live engine client ids include prod PVE engines', () => {
  assert.equal(isPlayableLiveEngineClientId('builtin-random-legal'), true);
  assert.equal(isPlayableLiveEngineClientId('python-tier1-v0.8.9'), true);
  assert.equal(isPlayableLiveEngineClientId('random-engine'), true);
});

test('playable live engine client ids exclude retired engines, EvE socket aliases, and humans', () => {
  assert.equal(isPlayableLiveEngineClientId('builtin-capture-seeker'), false);
  assert.equal(isPlayableLiveEngineClientId('python-tier1-v0.7.22'), false);
  assert.equal(isPlayableLiveEngineClientId('engine:black'), false);
  assert.equal(isPlayableLiveEngineClientId('human-black'), false);
  assert.equal(isPlayableLiveEngineClientId(undefined), false);
});
