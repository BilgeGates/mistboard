import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyJungleMove,
  createInitialJungleState,
  type JungleMove,
  type JungleSquare,
} from '@mistboard/game';
import {
  engineUciToJungleMove,
  jungleMoveToEngineUci,
  jungleStateToEngineFen,
} from './jungle-fen.js';

function uciToMove(uci: string): JungleMove {
  return { from: uci.slice(0, 2) as JungleSquare, to: uci.slice(2, 4) as JungleSquare };
}

// GOLDEN PARITY GATE. The expected FENs were produced by the `jungle-engine` Rust
// binary (jungle_rust) for this exact move sequence — the real prod game
// jgl_c79badbb. Replaying the same moves through the TS kernel and encoding must
// reproduce them byte-for-byte; any drift (board layout, casing, turn, progress
// clock, move number) fails here BEFORE the engine ships, which is the hard gate.
test('jungle FEN matches the Rust engine across a real game', () => {
  const moves = [
    'a1a2',
    'g7g6',
    'a3a4',
    'g6f6',
    'a2a3',
    'a7b7',
    'a3b3',
    'a9a8',
    'a4a5',
    'a8a7',
    'a5b5',
    'b8c8',
    'b2c2',
    'g9g8',
    'b5b6',
    'g8g7',
    'b6c6',
    'f8f7',
    'c2d2',
    'f6e6',
    'c3d3',
    'c7d7',
    'b3c3',
    'b7c7',
    'c3b3',
    'c8b8',
    'd3d4',
    'b8b7',
    'b3c3',
    'd7d8',
    'c3d3',
    'c7d7',
    'c6d6',
    'd8c8',
    'd6d7',
    'e7d7',
    'd3c3',
    'c8c7',
    'c3c7',
    'a7a8',
    'c7d7',
    'b7c7',
    'd7d8',
    'a8b8',
    'd2c2',
    'b8c8',
    'd8d9',
  ];
  // ply index → exact FEN emitted by the Rust binary. Only IN-GAME positions are
  // checked: the engine is queried solely while status === 'playing', so those are
  // the only FENs that ever reach the binary. (Ply 47 enters the den and finishes the
  // game — the kernel has no side-to-move there, while the binary mechanically flips
  // the turn char; that terminal FEN is never encoded for the engine, so it is not a
  // parity target.)
  const golden: Record<number, string> = {
    0: 't5l/1c3d1/e1w1p1r/7/7/7/R1P1W1E/1D3C1/L5T r 0 1',
    1: 't5l/1c3d1/e1w1p1r/7/7/7/R1P1W1E/LD3C1/6T b 1 1',
    13: '6l/2c2d1/tew1p2/5r1/1R5/7/1LP1W1E/2D2C1/6T b 13 7',
    26: '7/1c5/t1ewpdl/2R1r2/7/7/1L1PW1E/3D1C1/6T r 26 14',
    44: '7/1t1L3/2c2dl/4r2/7/3P3/4W1E/3D1C1/6T r 3 23',
    46: '7/2tL3/2c2dl/4r2/7/3P3/4W1E/2D2C1/6T r 5 24',
  };

  let state = createInitialJungleState('parity');
  assert.equal(jungleStateToEngineFen(state), golden[0]);
  moves.forEach((uci, i) => {
    state = applyJungleMove(state, uciToMove(uci));
    const expected = golden[i + 1];
    if (expected !== undefined) {
      assert.equal(jungleStateToEngineFen(state), expected, `FEN mismatch after ply ${i + 1}`);
    }
  });
});

test('engine UCI move round-trips', () => {
  assert.equal(jungleMoveToEngineUci({ from: 'd8', to: 'd9' }), 'd8d9');
  assert.deepEqual(engineUciToJungleMove('d8d9'), { from: 'd8', to: 'd9' });
  assert.deepEqual(engineUciToJungleMove(' a1a2 '), { from: 'a1', to: 'a2' });
  assert.equal(engineUciToJungleMove('(none)'), null);
  assert.equal(engineUciToJungleMove(''), null);
  assert.equal(engineUciToJungleMove(null), null);
  assert.equal(engineUciToJungleMove('h1h2'), null); // file out of range
  assert.equal(engineUciToJungleMove('a0a1'), null); // rank 0 not valid
});
