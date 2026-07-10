import assert from 'node:assert/strict';
import test from 'node:test';
import { importXiangqiGame } from './xiangqi-import.js';

test('importXiangqiGame reads native coordinate notation', () => {
  const result = importXiangqiGame('h3e3 h8e8 h1g3');
  assert.equal(result.error, undefined);
  assert.equal(result.format, 'coordinate');
  assert.deepEqual(result.moves, [
    { from: 'h3', to: 'e3' },
    { from: 'h8', to: 'e8' },
    { from: 'h1', to: 'g3' },
  ]);
});

test('importXiangqiGame reads Chinese relative notation', () => {
  const result = importXiangqiGame('炮二平五 炮8平5 马二进三');
  assert.equal(result.error, undefined);
  assert.equal(result.format, 'chinese');
  assert.deepEqual(result.moves, [
    { from: 'h3', to: 'e3' },
    { from: 'h8', to: 'e8' },
    { from: 'h1', to: 'g3' },
  ]);
});

test('importXiangqiGame rejects an illegal game', () => {
  const result = importXiangqiGame('b1b2');
  assert.equal(result.format, null);
  assert.match(result.error ?? '', /not legal/);
});
