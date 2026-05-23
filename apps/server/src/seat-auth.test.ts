import assert from 'node:assert/strict';
import test from 'node:test';
import type { Color } from '@mistboard/game';
import { authorizeExistingSeat, seatsShareAuthority } from './seat-auth.js';
import type { SeatTokenState } from './server-types.js';

function seatToken(seat: Color, userId: string | null): SeatTokenState {
  const now = new Date();
  return {
    clientId: `client-${seat}`,
    seat,
    tokenHash: `hash-${seat}`,
    userId,
    userHandle: userId ? `handle-${userId}` : null,
    userDisplayName: null,
    issuedAt: now,
    lastSeenAt: now,
    revokedAt: null,
  };
}

// ── authorizeExistingSeat ─────────────────────────────────────────────────────

test('token-bound (anonymous) seat: valid token grants regardless of account', () => {
  const tokens = { white: seatToken('white', null) };
  assert.deepEqual(authorizeExistingSeat(tokens, tokens.white, null), {
    kind: 'grant',
    seat: 'white',
    tokenHash: 'hash-white',
  });
  // Even a logged-in connection presenting the anonymous token gets it (the
  // seat stays token-bound — binding is never mutated mid-game).
  assert.deepEqual(authorizeExistingSeat(tokens, tokens.white, 'user-1'), {
    kind: 'grant',
    seat: 'white',
    tokenHash: 'hash-white',
  });
});

test('account-bound seat: valid token + matching identity grants', () => {
  const tokens = { white: seatToken('white', 'user-1') };
  assert.deepEqual(authorizeExistingSeat(tokens, tokens.white, 'user-1'), {
    kind: 'grant',
    seat: 'white',
    tokenHash: 'hash-white',
  });
});

test('account-bound seat: leaked token by the WRONG account is denied', () => {
  const tokens = { white: seatToken('white', 'user-1') };
  assert.deepEqual(authorizeExistingSeat(tokens, tokens.white, 'user-2'), { kind: 'deny' });
});

test('account-bound seat: leaked token by an ANONYMOUS connection is denied', () => {
  const tokens = { white: seatToken('white', 'user-1') };
  assert.deepEqual(authorizeExistingSeat(tokens, tokens.white, null), { kind: 'deny' });
});

test('identity reclaim: logged-in user reclaims own account-bound seat with no token', () => {
  const tokens = { black: seatToken('black', 'user-7') };
  assert.deepEqual(authorizeExistingSeat(tokens, null, 'user-7'), {
    kind: 'grant',
    seat: 'black',
    tokenHash: 'hash-black',
  });
});

test('no token + identity matches nothing: fall through to new-seat/clientId paths', () => {
  const tokens = { white: seatToken('white', 'user-1') };
  assert.deepEqual(authorizeExistingSeat(tokens, null, 'user-9'), { kind: 'fallthrough' });
});

test('no token + anonymous: fall through (cannot reclaim a token-bound seat by identity)', () => {
  const tokens = { white: seatToken('white', null) };
  assert.deepEqual(authorizeExistingSeat(tokens, null, null), { kind: 'fallthrough' });
});

// ── seatsShareAuthority ───────────────────────────────────────────────────────

const notEngine = () => false;

test('same account across devices/tokens shares authority (different token hashes)', () => {
  const laptop = { seat: 'white' as const, userId: 'u1', seatTokenHash: 'tok-a', id: 'c1' };
  const phone = { seat: 'white' as const, userId: 'u1', seatTokenHash: undefined, id: 'c2' };
  assert.equal(seatsShareAuthority(laptop, phone, notEngine), true);
});

test('different accounts on the same seat do not share authority', () => {
  const a = { seat: 'white' as const, userId: 'u1', id: 'c1' };
  const b = { seat: 'white' as const, userId: 'u2', id: 'c2' };
  assert.equal(seatsShareAuthority(a, b, notEngine), false);
});

test('anonymous clients match by token hash, not by null userId', () => {
  const same = { seat: 'white' as const, userId: null, seatTokenHash: 'tok-x', id: 'c1' };
  const sameAgain = { seat: 'white' as const, userId: null, seatTokenHash: 'tok-x', id: 'c2' };
  assert.equal(seatsShareAuthority(same, sameAgain, notEngine), true);

  // Two distinct anonymous clients (no shared token) never collide on null.
  const anonA = { seat: 'white' as const, userId: null, id: 'c1' };
  const anonB = { seat: 'white' as const, userId: null, id: 'c2' };
  assert.equal(seatsShareAuthority(anonA, anonB, notEngine), false);
});

test('spectators and mismatched seats never share authority', () => {
  const specA = { seat: 'spectator' as const, userId: 'u1', id: 'c1' };
  const specB = { seat: 'spectator' as const, userId: 'u1', id: 'c2' };
  assert.equal(seatsShareAuthority(specA, specB, notEngine), false);

  const white = { seat: 'white' as const, userId: 'u1', id: 'c1' };
  const black = { seat: 'black' as const, userId: 'u1', id: 'c2' };
  assert.equal(seatsShareAuthority(white, black, notEngine), false);
});

test('server-engine clients share authority by matching id', () => {
  const left = { seat: 'white' as const, id: 'random-engine' };
  const right = { seat: 'white' as const, id: 'random-engine' };
  assert.equal(
    seatsShareAuthority(left, right, (id) => id === 'random-engine'),
    true,
  );
});
