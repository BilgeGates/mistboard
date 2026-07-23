/**
 * Mirror canonicalization. The reason this exists is that xiangqi's opening
 * position is symmetric about the central file, so a line and its mirror are one
 * opening; the pins here are that mirroring is a true involution (never loses a
 * position), that it round-trips through the kernel's own position key, and that
 * the two central-cannon spellings really do land on one key.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyStandardXiangqiMove,
  createInitialXiangqiState,
  standardXiangqiPositionKey,
  type XiangqiMove,
} from '@mistboard/game';
import {
  canonicalPosition,
  canonicalPositionMove,
  mirrorMove,
  mirrorPositionKey,
  mirrorSquare,
} from './xiangqi-opening-mirror.js';

const START = standardXiangqiPositionKey(createInitialXiangqiState('t'));

function after(...pairs: Array<[string, string]>): string {
  let state = createInitialXiangqiState('t');
  for (const [from, to] of pairs) {
    state = applyStandardXiangqiMove(state, { from, to } as XiangqiMove);
  }
  return standardXiangqiPositionKey(state);
}

test('mirrors squares across the central file', () => {
  assert.equal(mirrorSquare('a1'), 'i1');
  assert.equal(mirrorSquare('h3'), 'b3');
  assert.equal(mirrorSquare('e5'), 'e5');
  assert.equal(mirrorSquare('h10'), 'b10', 'rank 10 must survive the split');
});

test('the opening position is its own mirror', () => {
  assert.equal(mirrorPositionKey(START), START);
  assert.deepEqual(canonicalPosition(START), { key: START, mirrored: false });
});

test('mirroring twice is the identity, including multi-digit empty runs', () => {
  const midgame = after(['h3', 'e3'], ['h10', 'g8'], ['h1', 'g3']);
  assert.ok(midgame.includes('9'), 'this position should exercise a full-width empty rank');
  assert.equal(mirrorPositionKey(mirrorPositionKey(midgame)), midgame);
});

test('the mirrored key equals the key of the mirrored game', () => {
  // Play a line and its mirror image through the real kernel; the stored keys
  // must agree, or canonicalization would merge positions that are not the same.
  const line = after(['h3', 'e3'], ['h10', 'g8']);
  const mirroredLine = after(['b3', 'e3'], ['b10', 'c8']);
  assert.equal(mirrorPositionKey(line), mirroredLine);
});

test('both central-cannon openings canonicalize to one position and move', () => {
  // The whole point: 炮二平五 and 炮八平五 are one opening.
  const right = canonicalPosition(START);
  const left = canonicalPosition(START);
  assert.equal(right.key, left.key);

  const rightMove = { from: 'h3', to: 'e3' } as XiangqiMove;
  const leftMove = { from: 'b3', to: 'e3' } as XiangqiMove;
  // The start position is self-mirror, so canonicalizing it does not flip; the
  // two cannon moves stay distinct spellings of one idea and it is the
  // aggregation that must fold them (see the aggregate tests).
  assert.deepEqual(mirrorMove(rightMove), leftMove);
  assert.deepEqual(mirrorMove(leftMove), rightMove);
});

test('an asymmetric position canonicalizes to exactly one of the pair', () => {
  const line = after(['h3', 'e3']);
  const mirrored = after(['b3', 'e3']);
  assert.notEqual(line, mirrored, 'the two are genuinely different board states');

  const a = canonicalPosition(line);
  const b = canonicalPosition(mirrored);
  assert.equal(a.key, b.key, 'both must store under one key');
  assert.notEqual(a.mirrored, b.mirrored, 'exactly one of the pair is the flipped one');
});

test('the two central-cannon moves fold onto one stored row', () => {
  // The headline case: from the self-mirror opening position, h3e3 and b3e3 are
  // one opening played from either side and must share a row.
  const right = canonicalPositionMove(START, { from: 'h3', to: 'e3' } as XiangqiMove);
  const left = canonicalPositionMove(START, { from: 'b3', to: 'e3' } as XiangqiMove);

  assert.equal(right.key, left.key);
  assert.deepEqual(right.move, left.move, 'both spellings must store as the same move');
});

test('an asymmetric position keeps its own move, mirrored to match the key', () => {
  const line = after(['h3', 'e3']);
  const mirroredLine = after(['b3', 'e3']);
  const a = canonicalPositionMove(line, { from: 'h10', to: 'g8' } as XiangqiMove);
  const b = canonicalPositionMove(mirroredLine, { from: 'b10', to: 'c8' } as XiangqiMove);

  assert.equal(a.key, b.key, 'mirror-image lines share a key');
  assert.deepEqual(a.move, b.move, 'and their mirror-image replies share a move');
});
