import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseInfoScore } from './uci-engine-harness.js';

test('parseInfoScore reads depth + cp + pv from a scored info line', () => {
  const s = parseInfoScore('info depth 18 seldepth 24 multipv 1 score cp 47 nodes 1 pv h2e2');
  assert.deepEqual(s, { depth: 18, cp: 47, mate: null, pv: ['h2e2'], nodes: 1, timeMs: null });
});

test('parseInfoScore reads a mate score and leaves cp null', () => {
  const s = parseInfoScore('info depth 30 score mate -3 nodes 9 pv a0a1');
  assert.deepEqual(s, { depth: 30, cp: null, mate: -3, pv: ['a0a1'], nodes: 9, timeMs: null });
});

test('parseInfoScore captures the full multi-move pv', () => {
  const s = parseInfoScore('info depth 12 score cp -15 nodes 400 pv h2e2 h9g7 b2b6');
  assert.deepEqual(s, {
    depth: 12,
    cp: -15,
    mate: null,
    pv: ['h2e2', 'h9g7', 'b2b6'],
    nodes: 400,
    timeMs: null,
  });
});

test('parseInfoScore returns an empty pv for a scored line without one', () => {
  const s = parseInfoScore('info depth 4 score cp 12 nodes 100');
  assert.deepEqual(s, { depth: 4, cp: 12, mate: null, pv: [], nodes: 100, timeMs: null });
});

test('parseInfoScore reads nodes + time for truncation telemetry', () => {
  const s = parseInfoScore('info depth 7 nodes 1500000 time 4820 score cp 33 pv b2b3');
  assert.deepEqual(s, {
    depth: 7,
    cp: 33,
    mate: null,
    pv: ['b2b3'],
    nodes: 1_500_000,
    timeMs: 4820,
  });
});

test('parseInfoScore ignores score-less and non-info lines', () => {
  assert.equal(parseInfoScore('info depth 1 nodes 20 nps 20000'), undefined);
  assert.equal(parseInfoScore('info string NNUE ready'), undefined);
  assert.equal(parseInfoScore('bestmove h2e2'), undefined);
});
