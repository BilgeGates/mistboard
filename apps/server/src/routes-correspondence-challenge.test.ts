import assert from 'node:assert/strict';
import test from 'node:test';
import {
  challengeAcceptError,
  challengeViewModel,
  parseSeekVisibility,
} from './routes/correspondence-seeks.js';

const T0 = 1_000_000; // fixed "now" for view-model tests
const future = new Date(T0 + 60_000);
const past = new Date(T0 - 60_000);

test('parseSeekVisibility accepts the enum and rejects everything else', () => {
  assert.equal(parseSeekVisibility('public'), 'public');
  assert.equal(parseSeekVisibility('private'), 'private');
  // Absent → undefined so the caller applies its own default.
  assert.equal(parseSeekVisibility(undefined), undefined);
  assert.equal(parseSeekVisibility(null), undefined);
  // Anything unrecognized is undefined, never a silent fallthrough.
  assert.equal(parseSeekVisibility('secret'), undefined);
  assert.equal(parseSeekVisibility(2), undefined);
});

test('challengeAcceptError: creator can never accept their own seek', () => {
  assert.equal(
    challengeAcceptError({ creatorUserId: 'a', targetUserId: null }, 'a'),
    'cannot_accept_own_seek',
  );
  assert.equal(
    challengeAcceptError({ creatorUserId: 'a', targetUserId: 'b' }, 'a'),
    'cannot_accept_own_seek',
  );
});

test('challengeAcceptError: link challenge (no target) admits anyone but the creator', () => {
  assert.equal(challengeAcceptError({ creatorUserId: 'a', targetUserId: null }, 'b'), null);
  assert.equal(challengeAcceptError({ creatorUserId: 'a', targetUserId: null }, 'z'), null);
});

test('challengeAcceptError: directed challenge admits only its target', () => {
  assert.equal(challengeAcceptError({ creatorUserId: 'a', targetUserId: 'b' }, 'b'), null);
  assert.equal(
    challengeAcceptError({ creatorUserId: 'a', targetUserId: 'b' }, 'c'),
    'not_your_challenge',
  );
});

test('challengeViewModel: the target of a live direct challenge can accept and decline', () => {
  const v = challengeViewModel(
    { creatorUserId: 'a', targetUserId: 'b', expiresAt: future },
    'b',
    T0,
  );
  assert.deepEqual(v, {
    visible: true,
    isMine: false,
    expired: false,
    canAccept: true,
    canDecline: true,
  });
});

test('challengeViewModel: the creator sees their own challenge but cannot accept/decline it', () => {
  const v = challengeViewModel(
    { creatorUserId: 'a', targetUserId: 'b', expiresAt: future },
    'a',
    T0,
  );
  assert.equal(v.visible, true);
  assert.equal(v.isMine, true);
  assert.equal(v.canAccept, false);
  assert.equal(v.canDecline, false);
});

test('challengeViewModel: a stranger cannot see a directed challenge', () => {
  const v = challengeViewModel(
    { creatorUserId: 'a', targetUserId: 'b', expiresAt: future },
    'c',
    T0,
  );
  assert.equal(v.visible, false);
  assert.equal(v.canAccept, false);
});

test('challengeViewModel: a link challenge is visible and acceptable by anyone but its creator', () => {
  const anyone = challengeViewModel(
    { creatorUserId: 'a', targetUserId: null, expiresAt: future },
    'z',
    T0,
  );
  assert.equal(anyone.visible, true);
  assert.equal(anyone.canAccept, true);
  // A link has no one to decline it.
  assert.equal(anyone.canDecline, false);
});

test('challengeViewModel: an expired challenge is visible but not acceptable', () => {
  const v = challengeViewModel({ creatorUserId: 'a', targetUserId: 'b', expiresAt: past }, 'b', T0);
  assert.equal(v.visible, true);
  assert.equal(v.expired, true);
  assert.equal(v.canAccept, false);
  assert.equal(v.canDecline, false);
});
