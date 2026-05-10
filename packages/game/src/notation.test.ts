import assert from 'node:assert/strict';
import test from 'node:test';
import { moveToAlgebraic } from './notation.js';
import type { GameState } from './types.js';
import { fogOfWarVariant } from './variants.js';

test('formats quiet pawn moves without coordinate notation', () => {
  const state = {
    ...fogOfWarVariant.createInitialState('notation-pawn'),
    status: { type: 'playing', turn: 'white' },
  } satisfies GameState;

  assert.equal(moveToAlgebraic(state, { from: 'e2', to: 'e4' }), 'e4');
});

test('formats piece moves and captures in algebraic notation', () => {
  const state = {
    ...fogOfWarVariant.createInitialState('notation-piece'),
    board: {
      e4: { color: 'white', role: 'knight' },
      f6: { color: 'black', role: 'bishop' },
    },
    status: { type: 'playing', turn: 'white' },
  } satisfies GameState;

  assert.equal(moveToAlgebraic(state, { from: 'e4', to: 'f6' }), 'Nxf6');
});

test('adds disambiguation when two same-color pieces can reach the destination', () => {
  const state = {
    ...fogOfWarVariant.createInitialState('notation-disambiguation'),
    board: {
      b1: { color: 'white', role: 'knight' },
      d1: { color: 'white', role: 'knight' },
    },
    status: { type: 'playing', turn: 'white' },
  } satisfies GameState;

  assert.equal(moveToAlgebraic(state, { from: 'b1', to: 'c3' }), 'Nbc3');
});

test('formats promotion and en passant captures', () => {
  const promotionState = {
    ...fogOfWarVariant.createInitialState('notation-promotion'),
    board: {
      e7: { color: 'white', role: 'pawn' },
    },
    status: { type: 'playing', turn: 'white' },
  } satisfies GameState;
  const enPassantState = {
    ...fogOfWarVariant.createInitialState('notation-en-passant'),
    board: {
      e5: { color: 'white', role: 'pawn' },
      d5: { color: 'black', role: 'pawn' },
    },
    enPassantSquare: 'd6',
    status: { type: 'playing', turn: 'white' },
  } satisfies GameState;

  assert.equal(moveToAlgebraic(promotionState, { from: 'e7', to: 'e8', promotion: 'queen' }), 'e8=Q');
  assert.equal(moveToAlgebraic(enPassantState, { from: 'e5', to: 'd6' }), 'exd6');
});

test('formats castling algebraically', () => {
  const state = {
    ...fogOfWarVariant.createInitialState('notation-castling'),
    board: {
      e1: { color: 'white', role: 'king' },
      h1: { color: 'white', role: 'rook' },
      a1: { color: 'white', role: 'rook' },
    },
    castlingRights: ['a1', 'h1'],
    status: { type: 'playing', turn: 'white' },
  } satisfies GameState;

  assert.equal(moveToAlgebraic(state, { from: 'e1', to: 'h1' }), 'O-O');
  assert.equal(moveToAlgebraic(state, { from: 'e1', to: 'c1' }), 'O-O-O');
});

test('does not format ordinary king moves to c-file or g-file as castling', () => {
  const state = {
    ...fogOfWarVariant.createInitialState('notation-king-move'),
    board: {
      b1: { color: 'white', role: 'king' },
    },
    castlingRights: [],
    status: { type: 'playing', turn: 'white' },
  } satisfies GameState;

  assert.equal(moveToAlgebraic(state, { from: 'b1', to: 'c1' }), 'Kc1');
});
