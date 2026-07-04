import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { XiangqiMove } from '@mistboard/game';
import { legalMoveForUci } from './server-xiangqi-engine.js';
import { xiangqiMoveToPikafishUci, xiangqiSquareToPikafish } from './xiangqi-pikafish-engine.js';

// Our XiangqiSquare is `${file a-i}${rank 1-10}` (red back rank = rank 1);
// Pikafish UCI uses rank 0-9 (red back rank = rank 0). The only translation is a
// rank-1 shift. Empirically validated end-to-end against the mainline binary in
// src/scripts/xiangqi-pikafish-validate.ts — these lock the contract as a unit.

test('xiangqiSquareToPikafish applies the rank-1 shift', () => {
  assert.equal(xiangqiSquareToPikafish('e1'), 'e0'); // red general
  assert.equal(xiangqiSquareToPikafish('a1'), 'a0');
  assert.equal(xiangqiSquareToPikafish('i10'), 'i9');
  assert.equal(xiangqiSquareToPikafish('e10'), 'e9'); // black general
  assert.equal(xiangqiSquareToPikafish('h3'), 'h2'); // red right cannon
});

test('xiangqiMoveToPikafishUci concatenates the shifted squares', () => {
  assert.equal(xiangqiMoveToPikafishUci({ from: 'h3', to: 'e3' }), 'h2e2'); // cannon to center
  assert.equal(xiangqiMoveToPikafishUci({ from: 'b1', to: 'c3' }), 'b0c2'); // horse
  assert.equal(xiangqiMoveToPikafishUci({ from: 'h10', to: 'g8' }), 'h9g7'); // black horse
});

test('legalMoveForUci matches a Pikafish bestmove against the legal set', () => {
  const legal: XiangqiMove[] = [
    { from: 'h3', to: 'e3' },
    { from: 'b1', to: 'c3' },
  ];
  assert.deepEqual(legalMoveForUci(legal, 'h2e2'), { from: 'h3', to: 'e3' });
  assert.deepEqual(legalMoveForUci(legal, 'b0c2'), { from: 'b1', to: 'c3' });
});

test('legalMoveForUci rejects moves outside the legal set and malformed uci', () => {
  const legal: XiangqiMove[] = [{ from: 'h3', to: 'e3' }];
  assert.equal(legalMoveForUci(legal, 'a0a1'), null); // legal-format, not in set
  assert.equal(legalMoveForUci(legal, 'h3e3'), null); // our coords, not Pikafish coords
  assert.equal(legalMoveForUci(legal, 'garbage'), null);
  assert.equal(legalMoveForUci(legal, ''), null);
});
