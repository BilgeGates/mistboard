import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fsfXiangqiUciToPikafishUci,
  pikafishUciToFsfXiangqiUci,
  XIANGQI_FSF_PLAYABLE_ENGINES,
  xiangqiFsfEngineTierFor,
} from './xiangqi-fsf-engine.js';

test('FSF Xiangqi Level 1 matches the Lichess/PlayStrategy weakening profile', () => {
  assert.deepEqual(XIANGQI_FSF_PLAYABLE_ENGINES, [
    {
      id: 'fairy-stockfish-xiangqi-level-1',
      name: 'Fairy-Stockfish - Level 1',
      skill: -9,
      depth: 5,
      movetimeMs: 50,
    },
  ]);
  assert.equal(xiangqiFsfEngineTierFor('unknown'), null);
});

test('translates between Pikafish and Fairy-Stockfish Xiangqi ranks', () => {
  assert.equal(pikafishUciToFsfXiangqiUci('b0c2'), 'b1c3');
  assert.equal(pikafishUciToFsfXiangqiUci('h2h9'), 'h3h10');
  assert.equal(fsfXiangqiUciToPikafishUci('b1c3'), 'b0c2');
  assert.equal(fsfXiangqiUciToPikafishUci('h3h10'), 'h2h9');
  assert.throws(() => pikafishUciToFsfXiangqiUci('b1c10'), /invalid Pikafish/);
  assert.throws(() => fsfXiangqiUciToPikafishUci('b0c2'), /invalid Fairy-Stockfish/);
});
