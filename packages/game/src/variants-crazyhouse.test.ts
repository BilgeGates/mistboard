import assert from 'node:assert/strict';
import test from 'node:test';
import type { Board, Color, Square } from './types.js';
import {
  applyCrazyhouseMove,
  type CrazyhouseGameState,
  createInitialCrazyhouseState,
  getCrazyhousePlayerView,
  getLegalCrazyhouseDrops,
  isCrazyhouseDrop,
} from './variants-crazyhouse.js';

function state(
  board: Board,
  turn: Color,
  extra: Partial<CrazyhouseGameState> = {},
): CrazyhouseGameState {
  return {
    id: 't',
    variant: 'dark-crazyhouse',
    board,
    status: { type: 'playing', turn },
    moveNumber: 1,
    castlingRights: [],
    halfmoveClock: 0,
    hands: { white: {}, black: {} },
    promoted: [],
    ...extra,
  };
}

test('initial state starts with empty hands and no promoted pieces', () => {
  const initial = createInitialCrazyhouseState('g');
  assert.deepEqual(initial.hands, { white: {}, black: {} });
  assert.deepEqual(initial.promoted, []);
  assert.equal(initial.variant, 'dark-crazyhouse');
  assert.equal(initial.status.type, 'playing');
});

test('a capture routes the taken piece into the captor hand', () => {
  const before = state(
    {
      a1: { color: 'white', role: 'rook' },
      a8: { color: 'black', role: 'knight' },
      e1: { color: 'white', role: 'king' },
      e8: { color: 'black', role: 'king' },
    },
    'white',
  );
  const after = applyCrazyhouseMove(before, { from: 'a1', to: 'a8' });
  assert.equal(after.hands.white.knight, 1);
  assert.deepEqual(after.board.a8, { color: 'white', role: 'rook' });
  assert.deepEqual(after.status, { type: 'playing', turn: 'black' });
});

test('a captured promoted pawn reverts to a pawn in hand', () => {
  const before = state(
    {
      a8: { color: 'white', role: 'queen' }, // a promoted pawn
      a1: { color: 'black', role: 'rook' },
      e1: { color: 'white', role: 'king' },
      e8: { color: 'black', role: 'king' },
    },
    'black',
    { promoted: ['a8' as Square] },
  );
  const after = applyCrazyhouseMove(before, { from: 'a1', to: 'a8' });
  assert.equal(after.hands.black.pawn, 1);
  assert.equal(after.hands.black.queen, undefined);
  assert.ok(!after.promoted.includes('a8' as Square));
});

test('a drop places the piece, leaves the hand, and passes the turn', () => {
  const before = state(
    {
      a1: { color: 'white', role: 'rook' },
      e1: { color: 'white', role: 'king' },
      e8: { color: 'black', role: 'king' },
    },
    'white',
    { hands: { white: { knight: 1 }, black: {} } },
  );
  // a4 is up the open a-file, visible to the rook and empty.
  const after = applyCrazyhouseMove(before, { drop: 'knight', to: 'a4' });
  assert.deepEqual(after.board.a4, { color: 'white', role: 'knight' });
  assert.equal(after.hands.white.knight, undefined);
  assert.deepEqual(after.status, { type: 'playing', turn: 'black' });
});

test('drops are confirmed-empty only and bar pawns from the back ranks', () => {
  const before = state(
    {
      a1: { color: 'white', role: 'rook' },
      e1: { color: 'white', role: 'king' },
      e8: { color: 'black', role: 'king' },
    },
    'white',
    { hands: { white: { knight: 1, pawn: 1 }, black: {} } },
  );
  const drops = getLegalCrazyhouseDrops(before, 'white');
  const targets = new Set(drops.map((drop) => drop.to));
  // a4 sits on the open file the rook sees: a legal drop target.
  assert.ok(targets.has('a4' as Square));
  // h8 is fogged (no white piece sees it): never a drop target.
  assert.ok(!targets.has('h8' as Square));
  // A pawn cannot be dropped onto rank 8 even where visible.
  assert.ok(!drops.some((drop) => drop.drop === 'pawn' && drop.to === ('a8' as Square)));
  // ...but a knight can be dropped on a8 (visible, empty).
  assert.ok(drops.some((drop) => drop.drop === 'knight' && drop.to === ('a8' as Square)));
});

test('capturing the king wins immediately', () => {
  const before = state(
    {
      e7: { color: 'white', role: 'queen' },
      e1: { color: 'white', role: 'king' },
      e8: { color: 'black', role: 'king' },
    },
    'white',
  );
  const after = applyCrazyhouseMove(before, { from: 'e7', to: 'e8' });
  assert.deepEqual(after.status, { type: 'finished', winner: 'white', reason: 'king-captured' });
  // The king is never sent to a hand.
  assert.deepEqual(after.hands.white, {});
});

test('the fog view carries only the viewer own hand and includes drops', () => {
  const before = state(
    {
      a1: { color: 'white', role: 'rook' },
      e1: { color: 'white', role: 'king' },
      h8: { color: 'black', role: 'king' },
    },
    'white',
    { hands: { white: { knight: 2 }, black: { queen: 1 } } },
  );
  const view = getCrazyhousePlayerView(before, 'white');
  assert.deepEqual(view.hand, { knight: 2 }); // own reserve only — black's queen is hidden
  assert.equal(view.perspective, 'white');
  // legalMoves carry both board moves and drops.
  assert.ok(view.legalMoves.some((move) => isCrazyhouseDrop(move)));
  assert.ok(view.legalMoves.some((move) => !isCrazyhouseDrop(move)));
  // The far black king is off-vision: it must not appear on the fog board.
  assert.equal(view.board.h8, undefined);
});
