import {
  createUser,
  loadRoomSeatTokens,
  replaceRoomSeatTokens,
  touchRoomSeatToken,
  upsertRoomSeatToken,
} from './persistence.js';
import { assert, definePersistenceTests, test } from './persistence-test-support.js';

definePersistenceTests('seat tokens', () => {
  test('room seat tokens persist only token hashes and seat metadata', async () => {
    const issuedAt = new Date('2026-05-08T10:00:00.000Z');
    const lastSeenAt = new Date('2026-05-08T10:00:01.000Z');
    await upsertRoomSeatToken('token-room', {
      seat: 'white',
      clientId: 'white-client',
      tokenHash: 'hash-white',
      userId: null,
      userHandle: null,
      userDisplayName: null,
      issuedAt,
      lastSeenAt,
      revokedAt: null,
    });

    assert.deepEqual(await loadRoomSeatTokens('token-room'), {
      white: {
        seat: 'white',
        clientId: 'white-client',
        tokenHash: 'hash-white',
        userId: null,
        userHandle: null,
        userDisplayName: null,
        issuedAt,
        lastSeenAt,
        revokedAt: null,
      },
    });
  });

  test('room seat tokens can carry signed-in attribution without raw account secrets', async () => {
    const now = new Date('2026-05-08T10:00:00.000Z');
    await createUser({
      id: 'user_token',
      email: 'token@example.com',
      emailVerifiedAt: now,
      handle: 'token-player',
      displayName: 'Token Player',
      now,
    });
    await upsertRoomSeatToken('signed-token-room', {
      seat: 'white',
      clientId: 'white-client',
      tokenHash: 'hash-white',
      userId: 'user_token',
      userHandle: null,
      userDisplayName: null,
      issuedAt: now,
      lastSeenAt: now,
      revokedAt: null,
    });

    assert.deepEqual(await loadRoomSeatTokens('signed-token-room'), {
      white: {
        seat: 'white',
        clientId: 'white-client',
        tokenHash: 'hash-white',
        userId: 'user_token',
        userHandle: 'token-player',
        userDisplayName: 'Token Player',
        issuedAt: now,
        lastSeenAt: now,
        revokedAt: null,
      },
    });
  });

  test('room seat token last seen and replacement are durable', async () => {
    const issuedAt = new Date('2026-05-08T10:00:00.000Z');
    await upsertRoomSeatToken('replace-token-room', {
      seat: 'white',
      clientId: 'white-client',
      tokenHash: 'hash-white',
      userId: null,
      userHandle: null,
      userDisplayName: null,
      issuedAt,
      lastSeenAt: issuedAt,
      revokedAt: null,
    });

    const touchedAt = new Date('2026-05-08T10:05:00.000Z');
    await touchRoomSeatToken('replace-token-room', 'white', 'hash-white', touchedAt);
    assert.equal(
      (await loadRoomSeatTokens('replace-token-room')).white?.lastSeenAt.getTime(),
      touchedAt.getTime(),
    );

    await replaceRoomSeatTokens('replace-token-room', {
      black: {
        seat: 'black',
        clientId: 'white-client',
        tokenHash: 'hash-white',
        userId: null,
        userHandle: null,
        userDisplayName: null,
        issuedAt,
        lastSeenAt: touchedAt,
        revokedAt: null,
      },
    });

    assert.deepEqual(await loadRoomSeatTokens('replace-token-room'), {
      black: {
        seat: 'black',
        clientId: 'white-client',
        tokenHash: 'hash-white',
        userId: null,
        userHandle: null,
        userDisplayName: null,
        issuedAt,
        lastSeenAt: touchedAt,
        revokedAt: null,
      },
    });
  });
});
