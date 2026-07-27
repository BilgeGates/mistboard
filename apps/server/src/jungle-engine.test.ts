import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJunglePositionCommand } from './jungle-engine.js';

test('Jungle position command carries semicolon-delimited repetition seeds', () => {
  const current = '7/7/7/7/7/7/7/7/R5e b 11 45';
  const seeds = ['7/7/7/7/7/7/7/7/R5e r 3 41', '7/7/7/7/7/7/7/7/1R4e b 4 41'];
  assert.equal(
    buildJunglePositionCommand(current, seeds),
    `position fen ${current} reps ${seeds.join(';')}`,
  );
  assert.equal(buildJunglePositionCommand(current), `position fen ${current}`);
});
