import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DARK_MINI_XIANGQI_DEFAULT_ENGINE_ID,
  isDarkMiniXiangqiEngineClientId,
  isPlayableLiveEngineClientId,
  loadEngine,
} from './engine-registry.js';

test('playable live engine client ids = the single streamlined PVE engine (Misty)', () => {
  // Streamlined release (2026-06-02): only the latest Misty is player-facing.
  // v1.3 shipped 2026-06-20, superseding v1.2 in the picker. Older versions
  // stay in the registry so historical games resolve, but are no longer offered.
  assert.equal(isPlayableLiveEngineClientId('python-v2-v1.3'), true);
  assert.equal(isPlayableLiveEngineClientId('python-v2-v1.2'), false);
  assert.equal(isPlayableLiveEngineClientId('python-v2-v1.1'), false);
  assert.equal(isPlayableLiveEngineClientId('python-v2-v1.0'), false);
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

test('Dark Mini Xiangqi has a dedicated engine that stays out of the chess PvE picker', () => {
  const engine = loadEngine(DARK_MINI_XIANGQI_DEFAULT_ENGINE_ID);
  assert.equal(engine.id, 'python-dmx-v1.0');
  assert.equal(engine.name, 'Misty DMX');
  assert.equal(engine.gameSpecId, 'dark-mini-xiangqi');
  assert.equal(isDarkMiniXiangqiEngineClientId(engine.id), true);
  assert.equal(isPlayableLiveEngineClientId(engine.id), false);
});
