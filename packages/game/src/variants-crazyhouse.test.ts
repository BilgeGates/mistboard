import assert from 'node:assert/strict';
import test from 'node:test';
import type { Board, Color, Square } from './types.js';
import {
  applyCrazyhouseMove,
  type CrazyhouseDropPolicy,
  type CrazyhouseGameState,
  createInitialCrazyhouseState,
  getCrazyhouseDropOffers,
  getCrazyhousePlayerView,
  isCrazyhouseDrop,
  isLegalCrazyhouseMove,
} from './variants-crazyhouse.js';

function state(
  board: Board,
  turn: Color,
  extra: Partial<CrazyhouseGameState> = {},
): CrazyhouseGameState {
  return {
    id: 't',
    variant: 'dark-crazyhouse',
    dropPolicy: 'any-legal-square',
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

// A white rook on the open a-file + king on e1; a hidden black knight on c5 sits
// in the fog. Black's king is far away and also fogged.
function fogProbeState(dropPolicy: CrazyhouseDropPolicy): CrazyhouseGameState {
  return state(
    {
      a1: { color: 'white', role: 'rook' },
      e1: { color: 'white', role: 'king' },
      c5: { color: 'black', role: 'knight' }, // fogged: white cannot see it
      h8: { color: 'black', role: 'king' },
    },
    'white',
    { dropPolicy, hands: { white: { knight: 1 }, black: {} } },
  );
}

test('initial state defaults to the parachute drop policy with empty hands', () => {
  const initial = createInitialCrazyhouseState('g');
  assert.equal(initial.dropPolicy, 'any-legal-square');
  assert.deepEqual(initial.hands, { white: {}, black: {} });
  assert.deepEqual(initial.promoted, []);
  assert.equal(initial.variant, 'dark-crazyhouse');
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
  const after = applyCrazyhouseMove(before, { drop: 'knight', to: 'a4' });
  assert.deepEqual(after.board.a4, { color: 'white', role: 'knight' });
  assert.equal(after.hands.white.knight, undefined);
  assert.deepEqual(after.status, { type: 'playing', turn: 'black' });
});

test('parachute: you may offer a drop into the fog, but a hidden piece bounces it', () => {
  const before = fogProbeState('any-legal-square');
  const offers = new Set(getCrazyhouseDropOffers(before, 'white').map((drop) => drop.to));
  // c5 is fogged (white sees no piece there): it IS an offerable drop target...
  assert.ok(offers.has('c5' as Square));
  // ...but it secretly holds a knight, so the drop is illegal (the server bounces it).
  assert.equal(isLegalCrazyhouseMove(before, { drop: 'knight', to: 'c5' }), false);
  // A truly-empty fogged square (c4) is both offerable and legal — a real parachute.
  assert.ok(offers.has('c4' as Square));
  assert.equal(isLegalCrazyhouseMove(before, { drop: 'knight', to: 'c4' }), true);
});

test('vision-bound: drops are confined to squares you can see are empty', () => {
  const before = fogProbeState('seen-squares-only');
  const offers = new Set(getCrazyhouseDropOffers(before, 'white').map((drop) => drop.to));
  // a4 is on the open a-file the rook sees: offerable + legal.
  assert.ok(offers.has('a4' as Square));
  assert.equal(isLegalCrazyhouseMove(before, { drop: 'knight', to: 'a4' }), true);
  // c4 / c5 are fogged: neither offered nor legal under the Lao Tzu rule.
  assert.ok(!offers.has('c4' as Square));
  assert.equal(isLegalCrazyhouseMove(before, { drop: 'knight', to: 'c4' }), false);
});

test('a pawn cannot be dropped onto the back ranks', () => {
  const before = state(
    {
      a1: { color: 'white', role: 'rook' },
      e1: { color: 'white', role: 'king' },
      e8: { color: 'black', role: 'king' },
    },
    'white',
    { hands: { white: { pawn: 1 }, black: {} } },
  );
  assert.equal(isLegalCrazyhouseMove(before, { drop: 'pawn', to: 'a8' }), false);
  assert.equal(isLegalCrazyhouseMove(before, { drop: 'pawn', to: 'a4' }), true);
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
  assert.deepEqual(after.hands.white, {}); // the king is never sent to a hand
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
  assert.ok(view.legalMoves.some((move) => isCrazyhouseDrop(move)));
  assert.ok(view.legalMoves.some((move) => !isCrazyhouseDrop(move)));
  assert.equal(view.board.h8, undefined); // the far black king is off-vision
});
