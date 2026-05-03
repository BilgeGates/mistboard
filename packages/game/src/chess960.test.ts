import assert from 'node:assert/strict';
import test from 'node:test';
import { createChess960InitialBoard, generateChess960Starts, pickDraft960Offer } from './chess960.js';

test('generates all 960 Chess960 starts', () => {
  const starts = generateChess960Starts();
  assert.equal(starts.length, 960);
  assert.equal(new Set(starts.map((start) => start.fenPlacement)).size, 960);
});

test('each Chess960 start has opposite-color bishops and king between rooks', () => {
  for (const start of generateChess960Starts()) {
    const bishops = start.backRank
      .map((role, index) => role === 'bishop' ? index : -1)
      .filter((index) => index >= 0);
    assert.equal(bishops.length, 2);
    assert.notEqual(bishops[0] % 2, bishops[1] % 2);

    const rooks = start.backRank
      .map((role, index) => role === 'rook' ? index : -1)
      .filter((index) => index >= 0);
    const king = start.backRank.findIndex((role) => role === 'king');
    assert.equal(rooks.length, 2);
    assert.equal(rooks[0] < king && king < rooks[1], true);
  }
});

test('Draft960 offer contains three unique starts', () => {
  const offer = pickDraft960Offer(123);
  assert.equal(offer.length, 3);
  assert.equal(new Set(offer.map((start) => start.id)).size, 3);
});

test('creates an initial board from a Chess960 start', () => {
  const [start] = generateChess960Starts();
  const board = createChess960InitialBoard(start);

  assert.equal(Object.keys(board).length, 32);
  assert.equal(board.a2?.role, 'pawn');
  assert.equal(board.h7?.role, 'pawn');
  assert.deepEqual(
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((file) => board[`${file}1` as keyof typeof board]?.role),
    start.backRank,
  );
  assert.deepEqual(
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((file) => board[`${file}8` as keyof typeof board]?.role),
    start.backRank,
  );
});
