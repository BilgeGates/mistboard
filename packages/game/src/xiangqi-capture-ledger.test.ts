import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type XiangqiBoard,
  type XiangqiGameState,
  type XiangqiMove,
  xiangqiCaptureLedger,
} from './variants-xiangqi.js';

// A hand-built position where each color makes two captures, in an
// interleaved order, so the ledger's order and victim roles are pinned.
//
//   red chariot a1, i1; red general e1
//   black chariot a10, i10; black general d10
//   black soldier a5 (red chariot a1 target up the a-file)
//   red soldier i5 (black chariot i10 target down the i-file)
function fourCaptureState(): XiangqiGameState {
  const board: XiangqiBoard = {
    e1: { color: 'red', role: 'general' },
    a1: { color: 'red', role: 'chariot' },
    i1: { color: 'red', role: 'chariot' },
    d10: { color: 'black', role: 'general' },
    a10: { color: 'black', role: 'chariot' },
    i10: { color: 'black', role: 'chariot' },
    a5: { color: 'black', role: 'soldier' },
    i5: { color: 'red', role: 'soldier' },
  };
  return {
    id: 'ledger-test',
    board,
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
}

test('capture ledger: interleaved captures keep ply order and victim roles', () => {
  const moves: XiangqiMove[] = [
    { from: 'a1', to: 'a5' }, // red chariot x black soldier
    { from: 'i10', to: 'i5' }, // black chariot x red soldier
    { from: 'a5', to: 'a10' }, // red chariot x black chariot
    { from: 'i5', to: 'i1' }, // black chariot x red chariot
  ];
  const ledger = xiangqiCaptureLedger(fourCaptureState(), moves);

  assert.deepEqual(ledger, [
    { victim: { color: 'black', role: 'soldier' }, capturedBy: 'red', plyIndex: 0 },
    { victim: { color: 'red', role: 'soldier' }, capturedBy: 'black', plyIndex: 1 },
    { victim: { color: 'black', role: 'chariot' }, capturedBy: 'red', plyIndex: 2 },
    { victim: { color: 'red', role: 'chariot' }, capturedBy: 'black', plyIndex: 3 },
  ]);
});

test('capture ledger: non-capturing moves are not recorded', () => {
  // Red chariot slides up an empty a-file (no victim), then black chariot
  // captures the red soldier on the i-file.
  const moves: XiangqiMove[] = [
    { from: 'a1', to: 'a4' }, // slide, no capture
    { from: 'i10', to: 'i5' }, // black chariot x red soldier
  ];
  const ledger = xiangqiCaptureLedger(fourCaptureState(), moves);
  assert.deepEqual(ledger, [
    { victim: { color: 'red', role: 'soldier' }, capturedBy: 'black', plyIndex: 1 },
  ]);
});

test('capture ledger: stops replaying once the game is over', () => {
  // Put the black general on a5 so ply 0 captures it -> game finishes. The
  // trailing move must be ignored, not recorded.
  const state = fourCaptureState();
  state.board.a5 = { color: 'black', role: 'general' };
  delete state.board.d10;
  const moves: XiangqiMove[] = [
    { from: 'a1', to: 'a5' }, // red chariot x black general -> finished
    { from: 'i10', to: 'i5' }, // trailing black capture, must be ignored
  ];
  const ledger = xiangqiCaptureLedger(state, moves);
  assert.deepEqual(ledger, [
    { victim: { color: 'black', role: 'general' }, capturedBy: 'red', plyIndex: 0 },
  ]);
});
