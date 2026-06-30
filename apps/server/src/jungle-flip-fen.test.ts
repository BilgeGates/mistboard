import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createInitialJungleFlipState,
  type JungleFlipGameState,
  type JungleFlipMove,
} from '@mistboard/game';
import {
  engineUciToJungleFlipMove,
  jungleFlipMoveToEngineUci,
  jungleFlipSquareToEngineUci,
  jungleFlipStateToEngineFen,
} from './jungle-flip-fen.js';

// These golden FENs are byte-shared with the engine's fen_vectors.json
// (mistboard-engine/jungle-flip-engine). The redaction boundary: a face-down tile is
// always 'X' (no ink, no role); the pool carries only public per-(ink,role) counts.

const BASE: Omit<
  JungleFlipGameState,
  'board' | 'firstColor' | 'ply' | 'moveNumber' | 'noProgressClock'
> = {
  id: 'test',
  status: { type: 'playing', turn: 'red' },
  repCounts: {},
  captures: [],
};

test('jungle-flip FEN: opening is all face-down, unbound turn, full pool', () => {
  const state = createInitialJungleFlipState('g1');
  assert.equal(
    jungleFlipStateToEngineFen(state),
    'XXXX/XXXX/XXXX/XXXX - R1C1D1W1P1T1L1E1r1c1d1w1p1t1l1e1 0 1',
  );
});

test('jungle-flip FEN: revealed pieces use ink casing; no face-down, empty pool', () => {
  // Engine golden vector: red lion a1, black cat a2, red to move, no pool.
  const state: JungleFlipGameState = {
    ...BASE,
    board: {
      a1: { color: 'red', role: 'lion', faceDown: false },
      a2: { color: 'black', role: 'cat', faceDown: false },
    },
    firstColor: 'red',
    ply: 2,
    moveNumber: 0,
    noProgressClock: 0,
  };
  assert.equal(jungleFlipStateToEngineFen(state), '4/4/c3/L3 r - 0 0');
});

test('jungle-flip FEN: face-down tiles emit X; pool is the hidden multiset (red then black)', () => {
  // Engine golden vector: red lion a1, black tiger b1 revealed; face-down at c2 and d4;
  // pool = red rat + black cat; red to move; clock 5; movenum 10.
  const state: JungleFlipGameState = {
    ...BASE,
    board: {
      a1: { color: 'red', role: 'lion', faceDown: false },
      b1: { color: 'black', role: 'tiger', faceDown: false },
      c2: { color: 'red', role: 'rat', faceDown: true },
      d4: { color: 'black', role: 'cat', faceDown: true },
    },
    firstColor: 'red',
    ply: 10,
    moveNumber: 10,
    noProgressClock: 5,
  };
  assert.equal(jungleFlipStateToEngineFen(state), '3X/4/2X1/Lt2 r R1c1 5 10');
});

test('jungle-flip FEN: a black-ink mover binds turn to b', () => {
  const state: JungleFlipGameState = {
    ...BASE,
    board: { a1: { color: 'black', role: 'rat', faceDown: false } },
    firstColor: 'red',
    ply: 1, // odd → black seat to move; with firstColor red, black seat owns black ink
    moveNumber: 3,
    noProgressClock: 1,
  };
  assert.equal(jungleFlipStateToEngineFen(state), '4/4/4/r3 b - 1 3');
});

test('jungle-flip UCI: square mapping is file + (rank-1)', () => {
  assert.equal(jungleFlipSquareToEngineUci('a1'), 'a0');
  assert.equal(jungleFlipSquareToEngineUci('d4'), 'd3');
  assert.equal(jungleFlipSquareToEngineUci('b3'), 'b2');
});

test('jungle-flip UCI: move <-> engine coord round-trips, flip is from==to', () => {
  const cases: JungleFlipMove[] = [
    { from: 'a1', to: 'a1' }, // flip
    { from: 'a1', to: 'b1' },
    { from: 'd4', to: 'd3' },
    { from: 'c2', to: 'c3' },
  ];
  for (const move of cases) {
    const uci = jungleFlipMoveToEngineUci(move);
    assert.deepEqual(engineUciToJungleFlipMove(uci), move);
  }
  assert.equal(jungleFlipMoveToEngineUci({ from: 'a1', to: 'a1' }), 'a0a0');
  assert.equal(jungleFlipMoveToEngineUci({ from: 'a1', to: 'b1' }), 'a0b0');
});

test('jungle-flip UCI: out-of-board coords reject', () => {
  assert.equal(engineUciToJungleFlipMove('e0a0'), null); // file e is off a 4-wide board
  assert.equal(engineUciToJungleFlipMove('a4a0'), null); // rank digit 4 is off (0..3)
  assert.equal(engineUciToJungleFlipMove('garbage'), null);
});
