import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseInfoScore } from './uci-engine-harness.js';

test('parseInfoScore reads depth + cp + pv from a scored info line', () => {
  const s = parseInfoScore('info depth 18 seldepth 24 multipv 1 score cp 47 nodes 1 pv h2e2');
  assert.deepEqual(s, { depth: 18, cp: 47, mate: null, pv: ['h2e2'] });
});

test('parseInfoScore reads a mate score and leaves cp null', () => {
  const s = parseInfoScore('info depth 30 score mate -3 nodes 9 pv a0a1');
  assert.deepEqual(s, { depth: 30, cp: null, mate: -3, pv: ['a0a1'] });
});

test('parseInfoScore captures the full multi-move pv', () => {
  const s = parseInfoScore('info depth 12 score cp -15 nodes 400 pv h2e2 h9g7 b2b6');
  assert.deepEqual(s, { depth: 12, cp: -15, mate: null, pv: ['h2e2', 'h9g7', 'b2b6'] });
});

test('parseInfoScore returns an empty pv for a scored line without one', () => {
  const s = parseInfoScore('info depth 4 score cp 12 nodes 100');
  assert.deepEqual(s, { depth: 4, cp: 12, mate: null, pv: [] });
});

test('parseInfoScore ignores score-less and non-info lines', () => {
  assert.equal(parseInfoScore('info depth 1 nodes 20 nps 20000'), undefined);
  assert.equal(parseInfoScore('info string NNUE ready'), undefined);
  assert.equal(parseInfoScore('bestmove h2e2'), undefined);
});
