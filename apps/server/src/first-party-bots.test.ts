import assert from 'node:assert/strict';
import test from 'node:test';
import { firstPartyBotForEngine, firstPartyBotForId } from './first-party-bots.js';

test('first-party Jieqi and Crossroads bot profiles expose three levels', () => {
  assert.equal(firstPartyBotForEngine('pikafish-jieqi-amateur')?.id, 'pika-jieqi-amateur');
  assert.equal(firstPartyBotForEngine('pikafish-jieqi-strong')?.id, 'pika-jieqi');
  assert.equal(firstPartyBotForEngine('pikafish-jieqi-strongest')?.id, 'pika-jieqi-strongest');

  assert.equal(
    firstPartyBotForEngine('fairy-stockfish-crossroads-amateur')?.id,
    'fairy-stockfish-crossroads-amateur',
  );
  assert.equal(
    firstPartyBotForEngine('fairy-stockfish-crossroads-strong')?.id,
    'fairy-stockfish-crossroads',
  );
  assert.equal(
    firstPartyBotForEngine('fairy-stockfish-crossroads-very-strong')?.id,
    'fairy-stockfish-crossroads-strongest',
  );

  assert.equal(firstPartyBotForId('pika-jieqi')?.displayName, 'PikaJieQi - Strong');
  assert.equal(
    firstPartyBotForId('fairy-stockfish-crossroads')?.displayName,
    'Fairy Stockfish Crossroads - Strong',
  );
});
