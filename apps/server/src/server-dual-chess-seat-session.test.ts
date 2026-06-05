import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignDualChessSeat,
  type DualChessSeatRoom,
  mintDualChessSeatToken,
} from './server-dual-chess-seat-session.js';

function emptyRoom(creatorPreference?: 'white' | 'red' | 'random'): DualChessSeatRoom {
  return {
    clients: new Set(),
    projection: { ...(creatorPreference ? { creatorPreference } : {}), seats: {} },
    seatTokens: {},
  };
}

test('the first two seats fill White then Red, then the room is full', () => {
  const room = emptyRoom();
  const first = assignDualChessSeat(room, 'c1', undefined, null);
  assert.equal(first.ok && first.seat, 'white');
  const second = assignDualChessSeat(room, 'c2', undefined, null);
  assert.equal(second.ok && second.seat, 'red');
  const third = assignDualChessSeat(room, 'c3', undefined, null);
  assert.equal(third.ok, false);
});

test('creator preference is honored for the first seat', () => {
  const room = emptyRoom('red');
  const first = assignDualChessSeat(room, 'c1', undefined, null);
  assert.equal(first.ok && first.seat, 'red');
});

test('a seat token reclaims the same seat on reconnect', () => {
  const room = emptyRoom();
  const first = assignDualChessSeat(room, 'c1', undefined, null);
  assert.ok(first.ok && first.seatToken);
  const token = first.ok ? first.seatToken : undefined;
  // A new client id presenting the same token re-attaches to White.
  const back = assignDualChessSeat(room, 'c1-reconnect', token, null);
  assert.equal(back.ok && back.seat, 'white');
  assert.equal(back.ok && back.previousTokenState !== undefined, true);
});

test('a token bound to an account is private to that account', () => {
  const room = emptyRoom();
  const first = assignDualChessSeat(room, 'c1', undefined, {
    id: 'u1',
    handle: 'alice',
    displayName: 'Alice',
  } as never);
  const token = first.ok ? first.seatToken : undefined;
  // A different account presenting the token is rejected.
  const intruder = assignDualChessSeat(room, 'c2', token, {
    id: 'u2',
    handle: 'mallory',
    displayName: 'Mallory',
  } as never);
  assert.equal(intruder.ok, false);
});

test('mintDualChessSeatToken reserves a chosen seat before connect', () => {
  const room = emptyRoom();
  const minted = mintDualChessSeatToken(room, 'red', {
    userId: null,
    userHandle: null,
    userDisplayName: null,
  });
  assert.equal(room.seatTokens.red?.tokenHash, minted.state.tokenHash);
  // Reconnecting with the minted token lands on Red.
  const seated = assignDualChessSeat(room, 'late', minted.rawToken, null);
  assert.equal(seated.ok && seated.seat, 'red');
});
