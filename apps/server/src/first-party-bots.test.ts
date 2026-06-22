import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIRST_PARTY_BOT_PROFILES,
  firstPartyBotForEngine,
  MISTY_DARK_CHESS_ACTIVE_ENGINE_ID,
} from './first-party-bots.js';

test('Misty bot profile uses the current player-facing engine for new games', () => {
  const misty = FIRST_PARTY_BOT_PROFILES.find((bot) => bot.id === 'misty-dark-chess');
  assert.equal(misty?.activeEngineId, MISTY_DARK_CHESS_ACTIVE_ENGINE_ID);
  assert.equal(firstPartyBotForEngine(MISTY_DARK_CHESS_ACTIVE_ENGINE_ID)?.id, 'misty-dark-chess');
});

test('historical Misty engine releases still attribute to the stable bot profile', () => {
  for (const engineId of [
    'python-v2-v1.0',
    'python-v2-v1.1',
    'python-v2-v1.2',
    'python-v2-v1.3',
    'python-v2-v1.4',
  ]) {
    assert.equal(firstPartyBotForEngine(engineId)?.id, 'misty-dark-chess', engineId);
  }
});
