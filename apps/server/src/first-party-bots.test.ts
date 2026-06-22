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

test('Drop Mini Xiangqi levels are separate public bot identities', () => {
  for (const level of [1, 2, 3]) {
    const id = `misty-drop-mini-level-${level}`;
    const bot = FIRST_PARTY_BOT_PROFILES.find((candidate) => candidate.id === id);
    assert.equal(bot?.displayName, `Misty Drop Mini level ${level}`);
    assert.equal(bot?.activeEngineId, id);
    assert.equal(bot?.defaultGameSpecId, 'drop-mini-xiangqi');
    assert.equal(firstPartyBotForEngine(id)?.id, id);
  }
});
