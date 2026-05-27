import {
  consumeEmailLoginChallenge,
  createAccountSession,
  createEmailLoginChallenge,
  createUser,
  deleteEmailLoginChallenge,
  findUserByEmail,
  getUserByAccountSession,
  markUserEmailVerified,
  revokeAccountSession,
  updateUserProfile,
} from './persistence.js';
import { assert, definePersistenceTests, sha256, test } from './persistence-test-support.js';

definePersistenceTests('accounts', () => {
  test('email login challenges are one-time and expire', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const codeHash = sha256('12345678');
    await createEmailLoginChallenge({
      id: 'login-valid',
      email: 'alice@example.com',
      codeHash,
      expiresAt: new Date(now.getTime() + 60_000),
    });

    assert.deepEqual(await consumeEmailLoginChallenge('login-valid', codeHash, now), {
      email: 'alice@example.com',
    });
    assert.equal(await consumeEmailLoginChallenge('login-valid', codeHash, now), null);

    await createEmailLoginChallenge({
      id: 'login-expired',
      email: 'alice@example.com',
      codeHash,
      expiresAt: new Date(now.getTime() - 1_000),
    });
    assert.equal(await consumeEmailLoginChallenge('login-expired', codeHash, now), null);
  });

  test('email login challenges can be deleted after delivery failure', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const codeHash = sha256('12345678');
    await createEmailLoginChallenge({
      id: 'login-undelivered',
      email: 'undelivered@example.com',
      codeHash,
      expiresAt: new Date(now.getTime() + 60_000),
    });

    await deleteEmailLoginChallenge('login-undelivered');

    assert.equal(await consumeEmailLoginChallenge('login-undelivered', codeHash, now), null);
  });

  test('users are findable by email case-insensitively', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const user = await createUser({
      id: 'user_alice',
      email: 'Alice@Example.com',
      emailVerifiedAt: null,
      handle: 'alice',
      displayName: 'Alice',
      now,
    });
    assert.equal(user.emailVerifiedAt, null);

    const found = await findUserByEmail('alice@example.com');
    assert.equal(found?.id, 'user_alice');

    const verified = await markUserEmailVerified('user_alice', new Date(now.getTime() + 1_000));
    assert.ok(verified.emailVerifiedAt);
  });

  test('user profile updates handle once immediately then applies cooldown', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    await createUser({
      id: 'user_profile_settings',
      email: 'settings@example.com',
      emailVerifiedAt: now,
      handle: 'settings-player',
      displayName: 'Settings Player',
      now,
    });

    const first = await updateUserProfile(
      'user_profile_settings',
      {
        handle: 'settings-renamed',
        displayName: 'Renamed Player',
      },
      new Date(now.getTime() + 1_000),
    );

    assert.equal(first.ok, true);
    assert.equal(first.ok ? first.user.handle : null, 'settings-renamed');
    assert.equal(first.ok ? first.user.displayName : null, 'Renamed Player');
    assert.ok(first.ok ? first.user.handleChangedAt : null);

    const blocked = await updateUserProfile(
      'user_profile_settings',
      {
        handle: 'settings-again',
        displayName: 'Renamed Again',
      },
      new Date(now.getTime() + 2_000),
    );

    assert.deepEqual(blocked.ok ? null : blocked.error, 'handle_change_cooldown');
  });

  test('user profile updates reserve old handles temporarily', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    await createUser({
      id: 'user_old_handle_owner',
      email: 'owner@example.com',
      emailVerifiedAt: now,
      handle: 'old-owner',
      displayName: 'Old Owner',
      now,
    });
    await createUser({
      id: 'user_handle_taker',
      email: 'taker@example.com',
      emailVerifiedAt: now,
      handle: 'handle-taker',
      displayName: 'Handle Taker',
      now,
    });

    const first = await updateUserProfile(
      'user_old_handle_owner',
      {
        handle: 'new-owner',
        displayName: 'Old Owner',
      },
      now,
    );
    assert.equal(first.ok, true);

    const conflict = await updateUserProfile(
      'user_handle_taker',
      {
        handle: 'old-owner',
        displayName: 'Handle Taker',
      },
      now,
    );
    assert.deepEqual(conflict.ok ? null : conflict.error, 'handle_taken');
  });

  test('account sessions resolve current users and can be revoked', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    await createUser({
      id: 'user_session',
      email: 'session@example.com',
      emailVerifiedAt: now,
      handle: 'session',
      displayName: 'Session',
      now,
    });
    const tokenHash = sha256('session-token');
    await createAccountSession({
      id: 'session-id',
      userId: 'user_session',
      tokenHash,
      expiresAt: new Date(now.getTime() + 86_400_000),
    });

    const user = await getUserByAccountSession('session-id', tokenHash, now);
    assert.equal(user?.id, 'user_session');

    await revokeAccountSession('session-id', tokenHash, now);
    assert.equal(await getUserByAccountSession('session-id', tokenHash, now), null);
  });
});
