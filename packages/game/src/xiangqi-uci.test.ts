import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fsfUciToXiangqiSquares,
  pikafishUciToXiangqiSquares,
  xiangqiMoveToFsfUci,
  xiangqiMoveToPikafishUci,
  xiangqiSquareToPikafishUci,
} from './xiangqi-uci.js';

test('xiangqiSquareToPikafishUci applies the rank-1 shift', () => {
  assert.equal(xiangqiSquareToPikafishUci('e1'), 'e0'); // red general
  assert.equal(xiangqiSquareToPikafishUci('a1'), 'a0');
  assert.equal(xiangqiSquareToPikafishUci('i10'), 'i9');
  assert.equal(xiangqiSquareToPikafishUci('e10'), 'e9'); // black general
  assert.equal(xiangqiSquareToPikafishUci('h3'), 'h2'); // red right cannon
});

test('xiangqiMoveToPikafishUci concatenates the shifted squares', () => {
  assert.equal(xiangqiMoveToPikafishUci({ from: 'h3', to: 'e3' }), 'h2e2'); // cannon to center
  assert.equal(xiangqiMoveToPikafishUci({ from: 'b1', to: 'c3' }), 'b0c2'); // horse
  assert.equal(xiangqiMoveToPikafishUci({ from: 'h10', to: 'g8' }), 'h9g7'); // black horse
});

test('xiangqiMoveToFsfUci is a plain square concatenation (Fairy-Stockfish is 1-indexed)', () => {
  // Verified against the engine: FSF accepts 'h3e3' and rejects the 0-indexed 'h2e2'.
  assert.equal(xiangqiMoveToFsfUci({ from: 'h3', to: 'e3' }), 'h3e3'); // cannon to center
  assert.equal(xiangqiMoveToFsfUci({ from: 'b1', to: 'c3' }), 'b1c3'); // horse
  assert.equal(xiangqiMoveToFsfUci({ from: 'h10', to: 'g8' }), 'h10g8'); // black horse
});

test('pikafishUciToXiangqiSquares inverts xiangqiMoveToPikafishUci (rank +1)', () => {
  assert.deepEqual(pikafishUciToXiangqiSquares('h2e2'), { from: 'h3', to: 'e3' }); // cannon to center
  assert.deepEqual(pikafishUciToXiangqiSquares('b0c2'), { from: 'b1', to: 'c3' }); // horse
  assert.deepEqual(pikafishUciToXiangqiSquares('h9g7'), { from: 'h10', to: 'g8' }); // black horse
  assert.equal(pikafishUciToXiangqiSquares('h2e'), null); // malformed
  // Round-trips with the forward converter for every move it produces.
  for (const move of [
    { from: 'e1', to: 'e2' },
    { from: 'a10', to: 'a1' },
    { from: 'i9', to: 'i10' },
  ] as const) {
    assert.deepEqual(pikafishUciToXiangqiSquares(xiangqiMoveToPikafishUci(move)), move);
  }
});

test('fsfUciToXiangqiSquares splits ranks 1 and 10 unambiguously', () => {
  assert.deepEqual(fsfUciToXiangqiSquares('c1e3'), { from: 'c1', to: 'e3' });
  assert.deepEqual(fsfUciToXiangqiSquares('b10c8'), { from: 'b10', to: 'c8' });
  assert.deepEqual(fsfUciToXiangqiSquares('e2e10'), { from: 'e2', to: 'e10' });
  assert.equal(fsfUciToXiangqiSquares('h2e2x'), null);
  assert.equal(fsfUciToXiangqiSquares('h0e0'), null); // rank 0 is not ours
});
