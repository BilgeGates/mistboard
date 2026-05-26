import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after, before, beforeEach } from 'node:test';
import type { GameEvent } from '@mistboard/game';
import pg from 'pg';
import { runMigrations } from './migrate.js';
import {
  abortRunningGame,
  abortStaleGuestPrestartGames,
  appendEvent,
  close,
  consumeEmailLoginChallenge,
  countWatchSealedGames,
  createAccountSession,
  createEmailLoginChallenge,
  createUser,
  deleteEmailLoginChallenge,
  finalizeStalePausedRooms,
  findUserByEmail,
  type GameSummary,
  getGameSummary,
  getLeaderboard,
  getUserByAccountSession,
  getUserProfileByHandle,
  init,
  isInitialized,
  listActiveRoomIds,
  listCompletedGames,
  listCorpusGames,
  listGameDebugArtifactPayloads,
  listGameDebugArtifactSummaries,
  listRecentEveGames,
  listRecentPublicGames,
  listWatchUnlockedGames,
  loadRoom,
  loadRoomSeatTokens,
  markUserEmailVerified,
  recordGameDebugArtifact,
  recordGameEnd,
  recordGameStart,
  replaceRoomSeatTokens,
  revokeAccountSession,
  touchRoomSeatToken,
  updateUserProfile,
  upsertRoomSeatToken,
} from './persistence.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

if (!TEST_DATABASE_URL) {
  test('persistence (skipped — set TEST_DATABASE_URL or DATABASE_URL to enable)', {
    skip: true,
  }, () => {});
} else {
  before(async () => {
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await runMigrations(client);
    } finally {
      await client.end();
    }
    init(TEST_DATABASE_URL);
  });

  after(async () => {
    await close();
  });

  beforeEach(async () => {
    if (!isInitialized()) return;
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `TRUNCATE
           email_login_challenges,
           account_sessions,
           user_handle_reservations,
           artifact_owners,
           game_participants,
           room_seat_tokens,
           game_debug_artifacts,
           eve_games,
           engine_game_tasks,
           engine_worker_runs,
           eve_jobs,
           engine_versions,
           engines,
           users,
           events,
           games
         RESTART IDENTITY CASCADE`,
      );
    } finally {
      await client.end();
    }
  });

  test('loadRoom returns null for an unknown room', async () => {
    const result = await loadRoom('nonexistent-room');
    assert.equal(result, null);
  });

  test('appendEvent + loadRoom round-trips events in seq order', async () => {
    const roomId = 'test-round-trip';
    const events: GameEvent[] = [
      { type: 'room-created', at: 1000, roomId, variant: 'dark-chess', offer: [] },
      {
        type: 'seat-assigned',
        at: 1001,
        roomId,
        clientId: 'client-white',
        seat: 'white',
      },
      {
        type: 'seat-assigned',
        at: 1002,
        roomId,
        clientId: 'client-black',
        seat: 'black',
      },
      {
        type: 'move-played',
        at: 1003,
        roomId,
        color: 'white',
        move: { from: 'e2', to: 'e4' },
      },
      {
        type: 'move-played',
        at: 1004,
        roomId,
        color: 'black',
        move: { from: 'e7', to: 'e5' },
      },
    ];

    for (let seq = 0; seq < events.length; seq++) {
      await appendEvent(roomId, seq, events[seq]!);
    }

    const loaded = await loadRoom(roomId);
    assert.deepEqual(loaded, events);
  });

  test('appendEvent throws on duplicate (room_id, seq)', async () => {
    const roomId = 'test-duplicate';
    const event: GameEvent = {
      type: 'room-created',
      at: 1,
      roomId,
      variant: 'dark-chess',
      offer: [],
    };
    await appendEvent(roomId, 0, event);
    await assert.rejects(() => appendEvent(roomId, 0, event), /duplicate key|unique constraint/i);
  });

  test('rooms are isolated by room_id', async () => {
    const eventA: GameEvent = {
      type: 'room-created',
      at: 1,
      roomId: 'room-a',
      variant: 'dark-chess',
      offer: [],
    };
    const eventB: GameEvent = {
      type: 'room-created',
      at: 2,
      roomId: 'room-b',
      variant: 'dark-chess',
      offer: [],
    };
    await appendEvent('room-a', 0, eventA);
    await appendEvent('room-b', 0, eventB);

    assert.deepEqual(await loadRoom('room-a'), [eventA]);
    assert.deepEqual(await loadRoom('room-b'), [eventB]);
  });

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

  test('listActiveRoomIds excludes finished games', async () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);

    await appendEvent('active-room', 0, {
      type: 'room-created',
      at: now.getTime(),
      roomId: 'active-room',
      variant: 'dark-chess',
      offer: [],
    });
    await appendEvent('finished-room', 0, {
      type: 'room-created',
      at: now.getTime(),
      roomId: 'finished-room',
      variant: 'dark-chess',
      offer: [],
    });
    await recordGameEnd('finished-room', {
      variant: 'dark-chess',
      result: 'white-wins',
      termination: 'king-captured',
      plyCount: 12,
      startedAt: now,
      endedAt: now,
      whiteClient: 'client-w',
      blackClient: 'client-b',
      whiteName: null,
      blackName: null,
      corpusId: null,
    } satisfies GameSummary);

    const active = await listActiveRoomIds(earlier);
    assert.deepEqual(active, ['active-room']);
  });

  test('listActiveRoomIds includes running games', async () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);

    await appendEvent('running-room', 0, {
      type: 'room-created',
      at: now.getTime(),
      roomId: 'running-room',
      variant: 'dark-chess',
      offer: [],
    });

    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO games
           (room_id, variant, result, termination, ply_count, started_at, ended_at, mode, status)
         VALUES ($1, 'dark-chess', NULL, NULL, 0, $2, NULL, 'eve', 'running')`,
        ['running-room', now],
      );
    } finally {
      await client.end();
    }

    const active = await listActiveRoomIds(earlier);
    assert.deepEqual(active, ['running-room']);
  });

  test('recordGameStart creates a durable running game row', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    await recordGameStart('started-pve', {
      variant: 'dark-chess',
      mode: 'pve',
      startedAt: now,
      whiteClient: null,
      blackClient: 'builtin-random-legal',
      whiteName: null,
      blackName: null,
      corpusId: null,
    });

    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      const { rows } = await client.query<{
        mode: string;
        status: string;
        result: string | null;
        termination: string | null;
        ended_at: Date | null;
        visibility: string;
        region: string;
      }>(
        'SELECT mode, status, result, termination, ended_at, visibility, region FROM games WHERE room_id = $1',
        ['started-pve'],
      );
      assert.deepEqual(rows, [
        {
          mode: 'pve',
          status: 'running',
          result: null,
          termination: null,
          ended_at: null,
          visibility: 'public',
          region: 'global',
        },
      ]);
    } finally {
      await client.end();
    }
  });

  test('abortStaleGuestPrestartGames aborts only guest rooms that never started', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const stale = new Date(now.getTime() - 20 * 60_000);
    const fresh = new Date(now.getTime() - 2 * 60_000);
    const user = await createUser({
      id: 'abort-policy-user',
      email: 'abort-policy@example.com',
      emailVerifiedAt: null,
      handle: 'abortpolicy',
      displayName: 'Abort Policy',
      now,
    });
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO games
           (room_id, variant, result, termination, ply_count, started_at, ended_at,
            white_client, black_client, white_name, black_name, mode, status)
         VALUES
           ('stale-guest-prestart', 'dark-chess', NULL, NULL, 0, $1, NULL,
            NULL, NULL, NULL, NULL, 'pvp', 'running'),
           ('fresh-guest-prestart', 'dark-chess', NULL, NULL, 0, $2, NULL,
            NULL, NULL, NULL, NULL, 'pvp', 'running'),
           ('stale-signed-in-prestart', 'dark-chess', NULL, NULL, 0, $1, NULL,
            'signed-client', NULL, NULL, NULL, 'pvp', 'running'),
           ('stale-started-clock', 'dark-chess', NULL, NULL, 0, $1, NULL,
            'clock-white', 'clock-black', NULL, NULL, 'pvp', 'running'),
           ('stale-started-move', 'dark-chess', NULL, NULL, 0, $1, NULL,
            'move-white', 'move-black', NULL, NULL, 'pvp', 'running')`,
        [stale, fresh],
      );
      await client.query(
        `INSERT INTO events (room_id, seq, type, payload)
         VALUES
           ('stale-guest-prestart', 0, 'room-created', $1),
           ('fresh-guest-prestart', 0, 'room-created', $2),
           ('stale-signed-in-prestart', 0, 'room-created', $3),
           ('stale-started-clock', 0, 'room-created', $4),
           ('stale-started-clock', 1, 'clock-started', $5),
           ('stale-started-move', 0, 'room-created', $6),
           ('stale-started-move', 1, 'move-played', $7)`,
        [
          {
            type: 'room-created',
            at: stale.getTime(),
            roomId: 'stale-guest-prestart',
            variant: 'dark-chess',
            offer: [],
          },
          {
            type: 'room-created',
            at: fresh.getTime(),
            roomId: 'fresh-guest-prestart',
            variant: 'dark-chess',
            offer: [],
          },
          {
            type: 'room-created',
            at: stale.getTime(),
            roomId: 'stale-signed-in-prestart',
            variant: 'dark-chess',
            offer: [],
          },
          {
            type: 'room-created',
            at: stale.getTime(),
            roomId: 'stale-started-clock',
            variant: 'dark-chess',
            offer: [],
          },
          {
            type: 'clock-started',
            at: stale.getTime() + 1000,
            roomId: 'stale-started-clock',
            clock: {
              initialMs: 30000,
              incrementMs: 2000,
              remainingMs: { white: 30000, black: 30000 },
              activeColor: 'white',
              runningSince: stale.getTime() + 1000,
            },
          },
          {
            type: 'room-created',
            at: stale.getTime(),
            roomId: 'stale-started-move',
            variant: 'dark-chess',
            offer: [],
          },
          {
            type: 'move-played',
            at: stale.getTime() + 1000,
            roomId: 'stale-started-move',
            color: 'white',
            move: { from: 'e2', to: 'e4' },
          },
        ],
      );
      await client.query(
        `INSERT INTO room_seat_tokens
           (room_id, seat, client_id, token_hash, user_id, issued_at, last_seen_at, revoked_at)
         VALUES
           ('stale-signed-in-prestart', 'white', 'signed-client', $1, $2, $3, $3, NULL)`,
        [sha256('signed-seat-token'), user.id, stale],
      );
    } finally {
      await client.end();
    }

    const result = await abortStaleGuestPrestartGames(now, 15 * 60_000);
    assert.deepEqual(result, { aborted: 1, roomIds: ['stale-guest-prestart'] });

    const verifyClient = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await verifyClient.connect();
    try {
      const { rows } = await verifyClient.query<{
        room_id: string;
        status: string;
        termination: string | null;
      }>(
        `SELECT room_id, status, termination
         FROM games
         WHERE room_id LIKE '%prestart' OR room_id LIKE 'stale-started-%'
         ORDER BY room_id`,
      );
      assert.deepEqual(rows, [
        { room_id: 'fresh-guest-prestart', status: 'running', termination: null },
        { room_id: 'stale-guest-prestart', status: 'aborted', termination: 'abandoned' },
        { room_id: 'stale-signed-in-prestart', status: 'running', termination: null },
        { room_id: 'stale-started-clock', status: 'running', termination: null },
        { room_id: 'stale-started-move', status: 'running', termination: null },
      ]);
    } finally {
      await verifyClient.end();
    }
  });

  test('finalizeStalePausedRooms only touches rooms whose last event is a stale pause', async () => {
    const now = new Date('2026-05-22T12:00:00.000Z');
    const stalePauseMs = 24 * 60 * 60 * 1000;
    const stalePauseAt = now.getTime() - 25 * 60 * 60 * 1000; // older than window
    const freshPauseAt = now.getTime() - 1 * 60 * 60 * 1000; // within window
    const startedAt = new Date(stalePauseAt - 60 * 60 * 1000);

    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO games
           (room_id, variant, result, termination, ply_count, started_at, ended_at,
            white_client, black_client, white_name, black_name, mode, status)
         VALUES
           ('stale-paused-pvp', 'dark-chess', NULL, NULL, 0, $1, NULL,
            'cw', 'cb', 'Alice', 'Bob', 'pvp', 'running'),
           ('stale-paused-then-resumed', 'dark-chess', NULL, NULL, 0, $1, NULL,
            'cw', 'cb', 'Alice', 'Bob', 'pvp', 'running'),
           ('fresh-paused', 'dark-chess', NULL, NULL, 0, $1, NULL,
            'cw', 'cb', 'Alice', 'Bob', 'pvp', 'running'),
           ('running-no-pause', 'dark-chess', NULL, NULL, 0, $1, NULL,
            'cw', 'cb', 'Alice', 'Bob', 'pvp', 'running'),
           ('stale-paused-already-completed', 'dark-chess', 'white-wins', 'king-captured', 12, $1, $2,
            'cw', 'cb', 'Alice', 'Bob', 'pvp', 'completed')`,
        [startedAt, now],
      );

      // Events: each stale-paused room gets a move + a pause as its last event.
      // The resumed room has pause + resume after the pause.
      await client.query(
        `INSERT INTO events (room_id, seq, type, payload)
         VALUES
           ('stale-paused-pvp', 0, 'room-created', $1),
           ('stale-paused-pvp', 1, 'move-played', $2),
           ('stale-paused-pvp', 2, 'move-played', $3),
           ('stale-paused-pvp', 3, 'pause', $4),
           ('stale-paused-then-resumed', 0, 'room-created', $5),
           ('stale-paused-then-resumed', 1, 'pause', $6),
           ('stale-paused-then-resumed', 2, 'resume', $7),
           ('fresh-paused', 0, 'room-created', $8),
           ('fresh-paused', 1, 'pause', $9),
           ('running-no-pause', 0, 'room-created', $10),
           ('running-no-pause', 1, 'move-played', $11),
           ('stale-paused-already-completed', 0, 'room-created', $12),
           ('stale-paused-already-completed', 1, 'pause', $13)`,
        [
          {
            type: 'room-created',
            at: startedAt.getTime(),
            roomId: 'stale-paused-pvp',
            variant: 'dark-chess',
            offer: [],
          },
          {
            type: 'move-played',
            at: startedAt.getTime() + 1000,
            roomId: 'stale-paused-pvp',
            color: 'white',
            move: { from: 'e2', to: 'e4' },
          },
          {
            type: 'move-played',
            at: startedAt.getTime() + 2000,
            roomId: 'stale-paused-pvp',
            color: 'black',
            move: { from: 'e7', to: 'e5' },
          },
          { type: 'pause', at: stalePauseAt, roomId: 'stale-paused-pvp', reason: 'shutdown' },
          {
            type: 'room-created',
            at: startedAt.getTime(),
            roomId: 'stale-paused-then-resumed',
            variant: 'dark-chess',
            offer: [],
          },
          {
            type: 'pause',
            at: stalePauseAt,
            roomId: 'stale-paused-then-resumed',
            reason: 'shutdown',
          },
          {
            type: 'resume',
            at: stalePauseAt + 1000,
            roomId: 'stale-paused-then-resumed',
            reason: 'both-present',
          },
          {
            type: 'room-created',
            at: startedAt.getTime(),
            roomId: 'fresh-paused',
            variant: 'dark-chess',
            offer: [],
          },
          { type: 'pause', at: freshPauseAt, roomId: 'fresh-paused', reason: 'shutdown' },
          {
            type: 'room-created',
            at: startedAt.getTime(),
            roomId: 'running-no-pause',
            variant: 'dark-chess',
            offer: [],
          },
          {
            type: 'move-played',
            at: startedAt.getTime() + 1000,
            roomId: 'running-no-pause',
            color: 'white',
            move: { from: 'e2', to: 'e4' },
          },
          {
            type: 'room-created',
            at: startedAt.getTime(),
            roomId: 'stale-paused-already-completed',
            variant: 'dark-chess',
            offer: [],
          },
          {
            type: 'pause',
            at: stalePauseAt,
            roomId: 'stale-paused-already-completed',
            reason: 'shutdown',
          },
        ],
      );
    } finally {
      await client.end();
    }

    const result = await finalizeStalePausedRooms(now, stalePauseMs);
    assert.equal(result.finalized, 1, 'exactly one room should finalize');
    assert.equal(result.rooms[0]?.roomId, 'stale-paused-pvp');
    assert.equal(result.rooms[0]?.mode, 'pvp');
    assert.equal(result.rooms[0]?.pausedAtMs, stalePauseAt);
    assert.equal(result.rooms[0]?.pauseReason, 'shutdown');
    assert.equal(result.rooms[0]?.plyCount, 2, 'ply_count should reflect move-played events');

    const verify = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await verify.connect();
    try {
      const { rows } = await verify.query<{
        room_id: string;
        status: string;
        result: string | null;
        termination: string | null;
        ply_count: number;
      }>(
        `SELECT room_id, status, result, termination, ply_count
         FROM games
         WHERE room_id IN (
           'stale-paused-pvp', 'stale-paused-then-resumed', 'fresh-paused',
           'running-no-pause', 'stale-paused-already-completed'
         )
         ORDER BY room_id`,
      );
      assert.deepEqual(rows, [
        {
          room_id: 'fresh-paused',
          status: 'running',
          result: null,
          termination: null,
          ply_count: 0,
        },
        {
          room_id: 'running-no-pause',
          status: 'running',
          result: null,
          termination: null,
          ply_count: 0,
        },
        // Already-completed row is untouched by the sweep.
        {
          room_id: 'stale-paused-already-completed',
          status: 'completed',
          result: 'white-wins',
          termination: 'king-captured',
          ply_count: 12,
        },
        {
          room_id: 'stale-paused-pvp',
          status: 'completed',
          result: 'draw',
          termination: 'server-restarted',
          ply_count: 2,
        },
        {
          room_id: 'stale-paused-then-resumed',
          status: 'running',
          result: null,
          termination: null,
          ply_count: 0,
        },
      ]);
    } finally {
      await verify.end();
    }

    // Idempotency — second sweep finds nothing.
    const repeat = await finalizeStalePausedRooms(now, stalePauseMs);
    assert.deepEqual(repeat, { finalized: 0, rooms: [] });
  });

  test('recordGameEnd is idempotent', async () => {
    const now = new Date();
    const summary = {
      variant: 'dark-chess',
      result: 'white-wins' as const,
      termination: 'king-captured' as const,
      plyCount: 12,
      startedAt: now,
      endedAt: now,
      whiteClient: 'client-w',
      blackClient: 'client-b',
      whiteName: null,
      blackName: null,
      corpusId: null,
    };
    await recordGameEnd('idempotent-room', summary);
    await recordGameEnd('idempotent-room', summary);
    // Second call should not throw and should leave a single row.
  });

  test('recordGameEnd completes an existing running game row', async () => {
    const now = new Date();
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO games
           (room_id, variant, result, termination, ply_count, started_at, ended_at, mode, status)
         VALUES ($1, 'dark-chess', NULL, NULL, 0, $2, NULL, 'eve', 'running')`,
        ['running-to-finished', now],
      );
    } finally {
      await client.end();
    }

    await recordGameEnd('running-to-finished', {
      variant: 'dark-chess',
      mode: 'eve',
      result: 'black-wins',
      termination: 'timeout',
      plyCount: 42,
      startedAt: now,
      endedAt: now,
      whiteClient: null,
      blackClient: null,
      whiteName: 'engine-a',
      blackName: 'engine-b',
      corpusId: null,
    });

    const verifyClient = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await verifyClient.connect();
    try {
      const { rows } = await verifyClient.query<{
        status: string;
        result: string | null;
        termination: string | null;
        ply_count: number;
      }>('SELECT status, result, termination, ply_count FROM games WHERE room_id = $1', [
        'running-to-finished',
      ]);
      assert.deepEqual(rows, [
        {
          status: 'completed',
          result: 'black-wins',
          termination: 'timeout',
          ply_count: 42,
        },
      ]);
    } finally {
      await verifyClient.end();
    }
  });

  test('recordGameEnd writes durable participant attribution', async () => {
    const now = new Date();
    await recordGameEnd('pve-attribution', {
      variant: 'dark-chess',
      mode: 'pve',
      result: 'white-wins',
      termination: 'king-captured',
      plyCount: 18,
      startedAt: now,
      endedAt: now,
      whiteClient: 'human-browser-client',
      blackClient: 'random-engine',
      whiteName: null,
      blackName: null,
      corpusId: null,
    });

    const summary = await getGameSummary('pve-attribution');
    assert.deepEqual(summary?.participants, [
      {
        color: 'white',
        displayName: 'Guest',
        subjectType: 'guest',
        subjectId: null,
        visibility: 'public',
      },
      {
        color: 'black',
        displayName: 'Random Legal v1',
        subjectType: 'engine-version',
        subjectId: 'builtin-random-legal',
        visibility: 'public',
      },
    ]);
  });

  test('recordGameEnd accepts explicit signed-in user participant attribution', async () => {
    const now = new Date();
    await recordGameEnd('signed-in-pve-attribution', {
      variant: 'dark-chess',
      mode: 'pve',
      result: 'black-wins',
      termination: 'timeout',
      plyCount: 22,
      startedAt: now,
      endedAt: now,
      whiteClient: 'signed-in-browser-client',
      blackClient: 'builtin-random-legal',
      whiteName: 'alice',
      blackName: 'Random Legal',
      corpusId: null,
      participants: [
        {
          color: 'white',
          displayName: 'alice',
          subjectType: 'user',
          subjectId: 'user_alice',
          visibility: 'private',
        },
        {
          color: 'black',
          displayName: 'Random Legal',
          subjectType: 'engine-version',
          subjectId: 'builtin-random-legal',
          visibility: 'public',
        },
      ],
      visibility: 'private',
    });

    const summary = await getGameSummary('signed-in-pve-attribution');
    assert.equal(summary?.visibility, 'private');
    assert.deepEqual(summary?.participants, [
      {
        color: 'white',
        displayName: 'alice',
        subjectType: 'user',
        subjectId: 'user_alice',
        visibility: 'private',
      },
      {
        color: 'black',
        displayName: 'Random Legal',
        subjectType: 'engine-version',
        subjectId: 'builtin-random-legal',
        visibility: 'public',
      },
    ]);
  });

  test('rated PvP game updates both players Glicko ratings', async () => {
    const now = new Date();
    await createUser({
      id: 'user_white',
      email: 'w@example.com',
      emailVerifiedAt: now,
      handle: 'whiteplayer',
      displayName: 'White',
      now,
    });
    await createUser({
      id: 'user_black',
      email: 'b@example.com',
      emailVerifiedAt: now,
      handle: 'blackplayer',
      displayName: 'Black',
      now,
    });

    await recordGameEnd('rated-pvp-1', {
      variant: 'dark-chess',
      mode: 'pvp',
      rated: true,
      result: 'white-wins',
      termination: 'king-captured',
      plyCount: 30,
      startedAt: now,
      endedAt: now,
      initialMs: 180000, // 3+2 → blitz bucket
      incrementMs: 2000,
      whiteClient: 'browser',
      blackClient: 'browser',
      whiteName: 'White',
      blackName: 'Black',
      corpusId: null,
      participants: [
        {
          color: 'white',
          displayName: 'White',
          subjectType: 'user',
          subjectId: 'user_white',
          visibility: 'public',
        },
        {
          color: 'black',
          displayName: 'Black',
          subjectType: 'user',
          subjectId: 'user_black',
          visibility: 'public',
        },
      ],
      visibility: 'public',
    });

    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      const { rows } = await client.query<{
        user_id: string;
        elo_rating: number;
        rating_deviation: number;
        volatility: string;
        games_played: number;
      }>(
        `SELECT user_id, elo_rating, rating_deviation, volatility, games_played
         FROM user_ratings WHERE variant = 'fog' AND time_class = 'blitz'`,
      );
      assert.equal(rows.length, 2, 'both players got a rating row');
      const white = rows.find((r) => r.user_id === 'user_white')!;
      const black = rows.find((r) => r.user_id === 'user_black')!;
      // Winner rises above the 1500 base, loser falls below it.
      assert.ok(white.elo_rating > 1500, `white rating ${white.elo_rating}`);
      assert.ok(black.elo_rating < 1500, `black rating ${black.elo_rating}`);
      // RD tightened from the 350 default; volatility persisted.
      assert.ok(white.rating_deviation < 350, `white RD ${white.rating_deviation}`);
      assert.ok(Number(white.volatility) > 0, 'volatility stored');
      assert.equal(white.games_played, 1);

      // The per-game rating-event log (game_participants) recorded before/after.
      const { rows: parts } = await client.query<{
        elo_before: number;
        elo_after: number;
        rd_after: number;
      }>(
        `SELECT elo_before, elo_after, rd_after FROM game_participants
         WHERE game_id = 'rated-pvp-1' AND color = 'white'`,
      );
      assert.equal(parts[0]!.elo_before, 1500);
      assert.ok(parts[0]!.elo_after > 1500);
      assert.ok(parts[0]!.rd_after < 350);
    } finally {
      await client.end();
    }

    // The game summary exposes the rating delta so the game page can show +/-.
    const summary = await getGameSummary('rated-pvp-1');
    const wp = summary?.participants?.find((p) => p.color === 'white');
    assert.equal(wp?.ratingBefore, 1500, 'summary exposes ratingBefore');
    assert.ok((wp?.ratingAfter ?? 0) > 1500, 'summary exposes ratingAfter');
  });

  test('rated game rates on a forfeit (abandonment) termination', async () => {
    // Rating is termination-independent: any completed rated PvP game rates.
    // Forfeit (abandonment) is a real win, so it must move ratings like any other.
    const now = new Date();
    await createUser({
      id: 'ff_w',
      email: 'ffw@e.com',
      emailVerifiedAt: now,
      handle: 'ffwhite',
      displayName: 'FFW',
      now,
    });
    await createUser({
      id: 'ff_b',
      email: 'ffb@e.com',
      emailVerifiedAt: now,
      handle: 'ffblack',
      displayName: 'FFB',
      now,
    });
    await recordGameEnd('rated-forfeit', {
      variant: 'dark-chess',
      mode: 'pvp',
      rated: true,
      result: 'white-wins',
      termination: 'abandonment',
      plyCount: 12,
      startedAt: now,
      endedAt: now,
      initialMs: 180000,
      incrementMs: 2000,
      whiteClient: 'b',
      blackClient: 'b',
      whiteName: 'FFW',
      blackName: 'FFB',
      corpusId: null,
      participants: [
        {
          color: 'white',
          displayName: 'FFW',
          subjectType: 'user',
          subjectId: 'ff_w',
          visibility: 'public',
        },
        {
          color: 'black',
          displayName: 'FFB',
          subjectType: 'user',
          subjectId: 'ff_b',
          visibility: 'public',
        },
      ],
      visibility: 'public',
    });

    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      const { rows } = await client.query<{ user_id: string; elo_rating: number }>(
        `SELECT user_id, elo_rating FROM user_ratings WHERE variant = 'fog' AND time_class = 'blitz'`,
      );
      assert.equal(rows.length, 2, 'forfeit rated both players');
      assert.ok(rows.find((r) => r.user_id === 'ff_w')!.elo_rating > 1500, 'forfeit winner gained');
      assert.ok(rows.find((r) => r.user_id === 'ff_b')!.elo_rating < 1500, 'forfeit loser lost');
    } finally {
      await client.end();
    }
  });

  test('aborted game does not affect ratings', async () => {
    // Aborts go through abortRunningGame (status='aborted'), never recordGameEnd,
    // so they must never touch ratings — even for a rated PvP room of two accounts.
    const now = new Date();
    await createUser({
      id: 'ab_w',
      email: 'abw@e.com',
      emailVerifiedAt: now,
      handle: 'abwhite',
      displayName: 'ABW',
      now,
    });
    await createUser({
      id: 'ab_b',
      email: 'abb@e.com',
      emailVerifiedAt: now,
      handle: 'abblack',
      displayName: 'ABB',
      now,
    });
    await recordGameStart('rated-aborted', {
      variant: 'dark-chess',
      mode: 'pvp',
      startedAt: now,
      whiteClient: 'b',
      blackClient: 'b',
      whiteName: 'ABW',
      blackName: 'ABB',
      corpusId: null,
    });
    const aborted = await abortRunningGame('rated-aborted', {
      abortedReason: 'user-abort',
      termination: 'abandoned',
    });
    assert.equal(aborted, true, 'running game was aborted');

    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      const { rows } = await client.query(`SELECT 1 FROM user_ratings WHERE user_id = ANY($1)`, [
        ['ab_w', 'ab_b'],
      ]);
      assert.equal(rows.length, 0, 'aborted game created no rating rows');
    } finally {
      await client.end();
    }
  });

  test('leaderboard shows provisional players (marked) ranked low by conservative rating', async () => {
    const now = new Date();
    await createUser({
      id: 'u_hi',
      email: 'hi@e.com',
      emailVerifiedAt: now,
      handle: 'settledhi',
      displayName: 'Hi',
      profileVisibility: 'public',
      now,
    });
    await createUser({
      id: 'u_lo',
      email: 'lo@e.com',
      emailVerifiedAt: now,
      handle: 'settledlo',
      displayName: 'Lo',
      profileVisibility: 'public',
      now,
    });
    await createUser({
      id: 'u_pv',
      email: 'pv@e.com',
      emailVerifiedAt: now,
      handle: 'provis',
      displayName: 'Pv',
      profileVisibility: 'public',
      now,
    });

    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      // Conservative (rating - 2*RD): hi=1480, lo=1430, pv=1300.
      // pv has the highest RAW rating (1900) but RD 300 (provisional) → it sorts
      // LAST by conservative rating and is marked provisional, not hidden.
      await client.query(
        `INSERT INTO user_ratings (user_id, variant, time_class, elo_rating, rating_deviation, volatility, games_played)
         VALUES
          ('u_hi','fog','blitz',1600,60,0.06,20),
          ('u_lo','fog','blitz',1550,60,0.06,20),
          ('u_pv','fog','blitz',1900,300,0.06,3)`,
      );
    } finally {
      await client.end();
    }

    const board = await getLeaderboard({ variant: 'fog', timeClass: 'blitz', limit: 100 });
    assert.equal(board.length, 3, 'provisional player is shown, not hidden');
    assert.equal(board[0]!.handle, 'settledhi', 'highest conservative rating ranks first');
    assert.equal(board[0]!.provisional, false);
    assert.equal(board[1]!.handle, 'settledlo');
    assert.equal(board[2]!.handle, 'provis', 'provisional sorts last despite highest raw rating');
    assert.equal(board[2]!.provisional, true);
    assert.equal(
      board[2]!.eloRating,
      1900,
      'displays actual rating (with "?" client-side), not conservative',
    );
    assert.equal(board[0]!.rank, 1);
  });

  test('getUserProfileByHandle lists completed account-attributed games', async () => {
    const now = new Date('2026-05-08T10:00:00.000Z');
    await createUser({
      id: 'user_profile',
      email: 'profile@example.com',
      emailVerifiedAt: now,
      handle: 'profile-player',
      displayName: 'Profile Player',
      profileVisibility: 'public',
      now,
    });
    await recordGameEnd('profile-game', {
      variant: 'dark-chess',
      mode: 'pvp',
      result: 'white-wins',
      termination: 'king-captured',
      plyCount: 9,
      startedAt: now,
      endedAt: new Date(now.getTime() + 60_000),
      whiteClient: 'profile-browser',
      blackClient: 'guest-browser',
      whiteName: null,
      blackName: null,
      corpusId: null,
      participants: [
        {
          color: 'white',
          displayName: 'Profile Player',
          subjectType: 'user',
          subjectId: 'user_profile',
          visibility: 'public',
        },
        {
          color: 'black',
          displayName: 'Guest',
          subjectType: 'guest',
          subjectId: null,
          visibility: 'public',
        },
      ],
    });

    const profile = await getUserProfileByHandle('profile-player', null);
    assert.equal(profile?.user.handle, 'profile-player');
    assert.equal(profile?.games.length, 1);
    assert.equal(profile?.games[0]?.roomId, 'profile-game');
    assert.equal(profile?.games[0]?.playerColor, 'white');
    assert.equal(profile?.games[0]?.participants[0]?.subjectType, 'user');
  });

  test('listRecentEveGames returns completed EvE games newest first', async () => {
    const now = new Date();
    const older = new Date(now.getTime() - 60_000);
    const shortTimeout = new Date(now.getTime() + 60_000);
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO engines (id, name, visibility, status)
         VALUES
           ('engine-white', 'White Engine', 'admin', 'active'),
           ('engine-black', 'Black Engine', 'admin', 'active')`,
      );
      await client.query(
        `INSERT INTO engine_versions (id, name, config_hash, play_signature, engine_id)
         VALUES
           ('engine-white-v1', 'White Engine', 'white-hash', 'white-signature', 'engine-white'),
           ('engine-black-v1', 'Black Engine', 'black-hash', 'black-signature', 'engine-black')`,
      );
      await client.query(
        `INSERT INTO eve_jobs (id, purpose, target_games, status, completed_games, finished_at)
         VALUES ('job-recent', 'smoke', 3, 'completed', 3, $1)`,
        [now],
      );
      await client.query(
        `INSERT INTO games
           (room_id, variant, result, termination, ply_count, started_at, ended_at,
            white_name, black_name, mode, status)
         VALUES
           ('eve-older', 'dark-chess', 'draw', 'truncated', 32, $1, $1,
            'engine-white-v1', 'engine-black-v1', 'eve', 'completed'),
           ('eve-newer', 'dark-chess', 'white-wins', 'king-captured', 15, $2, $2,
            'engine-white-v1', 'engine-black-v1', 'eve', 'completed'),
           ('eve-short-timeout', 'dark-chess', 'black-wins', 'timeout', 4, $3, $3,
            'engine-white-v1', 'engine-black-v1', 'eve', 'completed'),
           ('pvp-newer', 'dark-chess', 'black-wins', 'king-captured', 10, $2, $2,
            'white', 'black', 'pvp', 'completed')`,
        [older, now, shortTimeout],
      );
      await client.query(
        `INSERT INTO eve_games
           (game_id, job_id, game_index, white_engine_id, black_engine_id,
            white_config_hash, black_config_hash, white_play_signature, black_play_signature,
            time_control, opening_policy, seed)
         VALUES
           ('eve-older', 'job-recent', 0, 'engine-white-v1', 'engine-black-v1',
            'white-hash', 'black-hash', 'white-signature', 'black-signature',
            '{"kind":"none"}', '{}', 1),
           ('eve-newer', 'job-recent', 1, 'engine-white-v1', 'engine-black-v1',
            'white-hash', 'black-hash', 'white-signature', 'black-signature',
            '{"kind":"per-move","milliseconds":100}', '{}', 2),
           ('eve-short-timeout', 'job-recent', 2, 'engine-white-v1', 'engine-black-v1',
            'white-hash', 'black-hash', 'white-signature', 'black-signature',
            '{"kind":"per-move","milliseconds":100}', '{}', 3)`,
      );
    } finally {
      await client.end();
    }

    const games = await listRecentEveGames();
    assert.deepEqual(
      games.map((game) => game.roomId),
      ['eve-newer', 'eve-older'],
    );
    assert.equal(games[0]?.jobId, 'job-recent');
    assert.equal(games[0]?.gameIndex, 1);
    assert.equal(games[0]?.mode, 'eve');
    assert.deepEqual(games[0]?.timeControl, { kind: 'per-move', milliseconds: 100 });
  });

  test('listRecentPublicGames returns public games, public-facing PvE games, and EvE games only', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const shortDecisive = new Date(now.getTime() - 30_000);
    const older = new Date(now.getTime() - 60_000);
    const shortTimeout = new Date(now.getTime() + 60_000);
    const oneMove = new Date(now.getTime() + 120_000);
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO games
           (room_id, variant, result, termination, ply_count, started_at, ended_at,
            white_client, black_client, white_name, black_name, mode, status, visibility)
         VALUES
           ('public-pvp', 'dark-chess', 'white-wins', 'king-captured', 31, $1, $1,
            'public-white', 'public-black', NULL, NULL, 'pvp', 'completed', 'public'),
           ('public-pve', 'dark-chess', 'black-wins', 'timeout', 23, $1, $1,
            'human-client-public', 'random-engine', NULL, NULL, 'pve', 'completed', 'public'),
           ('link-pve', 'dark-chess', 'black-wins', 'timeout', 22, $1, $1,
            'human-client', 'random-engine', NULL, NULL, 'pve', 'completed', 'link'),
           ('short-capture', 'dark-chess', 'white-wins', 'king-captured', 6, $2, $2,
            'short-white', 'short-black', NULL, NULL, 'pvp', 'completed', 'public'),
           ('one-move-public', 'dark-chess', 'white-wins', 'king-captured', 1, $5, $5,
            'one-white', 'one-black', NULL, NULL, 'pvp', 'completed', 'public'),
           ('link-eve', 'dark-chess', 'draw', 'truncated', 28, $4, $4,
            'engine:white', 'engine:black', 'White Engine', 'Black Engine', 'eve', 'completed', 'link'),
           ('short-timeout', 'dark-chess', 'black-wins', 'timeout', 4, $3, $3,
            'timeout-white', 'timeout-black', NULL, NULL, 'pvp', 'completed', 'public'),
           ('private-pve', 'dark-chess', 'black-wins', 'timeout', 24, $4, $4,
            'human-client-private', 'random-engine', NULL, NULL, 'pve', 'completed', 'private'),
           ('private-pvp', 'dark-chess', 'draw', 'truncated', 6, $4, $4,
            'private-white', 'private-black', NULL, NULL, 'pvp', 'completed', 'private')`,
        [now, shortDecisive, shortTimeout, older, oneMove],
      );
      for (const roomId of [
        'public-pvp',
        'public-pve',
        'link-pve',
        'short-capture',
        'one-move-public',
        'link-eve',
        'short-timeout',
        'private-pve',
        'private-pvp',
      ]) {
        await client.query(
          `INSERT INTO events (room_id, seq, type, payload)
           VALUES ($1, 0, 'room-created', $2)`,
          [
            roomId,
            {
              type: 'room-created',
              at: now.getTime(),
              roomId,
              variant: 'dark-chess',
              offer: [],
            },
          ],
        );
      }
    } finally {
      await client.end();
    }

    const games = await listRecentPublicGames(10);
    assert.deepEqual(
      games.map((game) => game.roomId),
      ['public-pvp', 'public-pve', 'link-pve', 'link-eve'],
    );
  });

  test('watch feed lists only fresh unlocked games and counts sealed games in aggregate', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const newest = new Date(now.getTime() - 10 * 60_000);
    const middle = new Date(now.getTime() - 20 * 60_000);
    const oldest = new Date(now.getTime() - 30 * 60_000);
    const outsideWindow = new Date(now.getTime() - 3 * 60 * 60_000);
    const future = new Date(now.getTime() + 60_000);
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO games
           (room_id, variant, result, termination, ply_count, started_at, ended_at,
            white_client, black_client, white_name, black_name, mode, status, visibility)
         VALUES
           ('watch-pvp-newest', 'dark-chess', 'white-wins', 'king-captured', 31, $1, $1,
            'white', 'black', NULL, NULL, 'pvp', 'completed', 'public'),
           ('watch-pve-link', 'dark-chess', 'black-wins', 'timeout', 12, $2, $2,
            'human', 'engine', NULL, NULL, 'pve', 'completed', 'link'),
           ('watch-eve', 'dark-chess', 'draw', 'truncated', 28, $3, $3,
            'engine-white', 'engine-black', 'White Engine', 'Black Engine', 'eve', 'completed', 'unlisted'),
           ('watch-old', 'dark-chess', 'white-wins', 'king-captured', 40, $4, $4,
            'white', 'black', NULL, NULL, 'pvp', 'completed', 'public'),
           ('watch-future', 'dark-chess', 'white-wins', 'king-captured', 40, $5, $5,
            'white', 'black', NULL, NULL, 'pvp', 'completed', 'public'),
           ('watch-no-event', 'dark-chess', 'white-wins', 'king-captured', 40, $1, $1,
            'white', 'black', NULL, NULL, 'pvp', 'completed', 'public'),
           ('watch-private-pvp', 'dark-chess', 'white-wins', 'king-captured', 40, $1, $1,
            'white', 'black', NULL, NULL, 'pvp', 'completed', 'private'),
           ('watch-private-eve', 'dark-chess', 'draw', 'truncated', 40, $1, $1,
            'engine-white', 'engine-black', NULL, NULL, 'eve', 'completed', 'private'),
           ('watch-short-pvp', 'dark-chess', 'white-wins', 'king-captured', 12, $1, $1,
            'white', 'black', NULL, NULL, 'pvp', 'completed', 'public'),
           ('watch-short-pve', 'dark-chess', 'white-wins', 'king-captured', 1, $1, $1,
            'human', 'engine', NULL, NULL, 'pve', 'completed', 'public'),
           ('watch-short-timeout', 'dark-chess', 'black-wins', 'timeout', 4, $1, $1,
            'white', 'black', NULL, NULL, 'pvp', 'completed', 'public'),
           ('watch-imported-public', 'dark-chess', 'white-wins', 'king-captured', 40, $1, $1,
            'white', 'black', NULL, NULL, 'imported', 'completed', 'public')`,
        [newest, middle, oldest, outsideWindow, future],
      );
      await client.query(
        `INSERT INTO games
           (room_id, variant, result, termination, ply_count, started_at, ended_at,
            white_client, black_client, white_name, black_name, mode, status, visibility)
         VALUES
           ('sealed-public-pvp', 'dark-chess', NULL, NULL, 0, $1, NULL,
            'white', 'black', NULL, NULL, 'pvp', 'running', 'public'),
           ('sealed-link-pve', 'dark-chess', NULL, NULL, 0, $1, NULL,
            'human', 'engine', NULL, NULL, 'pve', 'running', 'link'),
           ('sealed-unlisted-eve', 'dark-chess', NULL, NULL, 0, $1, NULL,
            'engine-white', 'engine-black', NULL, NULL, 'eve', 'running', 'unlisted'),
           ('sealed-private-pvp', 'dark-chess', NULL, NULL, 0, $1, NULL,
            'white', 'black', NULL, NULL, 'pvp', 'running', 'private'),
           ('sealed-imported', 'dark-chess', NULL, NULL, 0, $1, NULL,
            'white', 'black', NULL, NULL, 'imported', 'running', 'public'),
           ('sealed-manual', 'dark-chess', NULL, NULL, 0, $1, NULL,
            'white', 'black', NULL, NULL, 'manual', 'running', 'public')`,
        [now],
      );
      for (const roomId of [
        'watch-pvp-newest',
        'watch-pve-link',
        'watch-eve',
        'watch-old',
        'watch-future',
        'watch-private-pvp',
        'watch-private-eve',
        'watch-short-pvp',
        'watch-short-pve',
        'watch-short-timeout',
        'watch-imported-public',
      ]) {
        await client.query(
          `INSERT INTO events (room_id, seq, type, payload)
           VALUES ($1, 0, 'room-created', $2)`,
          [
            roomId,
            {
              type: 'room-created',
              at: now.getTime(),
              roomId,
              variant: 'dark-chess',
              offer: [],
            },
          ],
        );
      }
    } finally {
      await client.end();
    }

    const unlocked = await listWatchUnlockedGames({
      limit: 10,
      now,
      unlockWindowMs: 2 * 60 * 60_000,
    });
    assert.deepEqual(
      unlocked.map((game) => game.roomId),
      ['watch-pvp-newest', 'watch-pve-link', 'watch-eve'],
    );
    assert.equal(await countWatchSealedGames(), 3);
  });

  test('listCorpusGames filters timeout games shorter than ten ply', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO games
           (room_id, variant, result, termination, ply_count, started_at, ended_at,
            white_name, black_name, corpus_id, mode, status)
         VALUES
           ('corpus-decisive-short', 'dark-chess', 'white-wins', 'king-captured', 6, $1, $1,
            'white', 'black', 'featured-corpus', 'imported', 'completed'),
           ('corpus-timeout-short', 'dark-chess', 'black-wins', 'timeout', 4, $1, $1,
            'white', 'black', 'featured-corpus', 'imported', 'completed'),
           ('corpus-timeout-ten', 'dark-chess', 'black-wins', 'timeout', 10, $1, $1,
            'white', 'black', 'featured-corpus', 'imported', 'completed')`,
        [now],
      );
    } finally {
      await client.end();
    }

    const games = await listCorpusGames('featured-corpus');
    assert.deepEqual(
      games.map((game) => game.roomId),
      ['corpus-decisive-short', 'corpus-timeout-ten'],
    );
  });

  test('listCompletedGames returns completed games in date range with participants', async () => {
    const day = new Date('2026-05-08T12:00:00.000Z');
    const older = new Date('2026-05-07T23:59:59.000Z');
    const newer = new Date('2026-05-09T00:00:00.000Z');
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO games
           (room_id, variant, result, termination, ply_count, started_at, ended_at,
            white_client, black_client, white_name, black_name, mode, status)
         VALUES
           ('range-older', 'dark-chess', 'draw', 'truncated', 4, $1, $1,
            'old-white', 'old-black', NULL, NULL, 'pvp', 'completed'),
           ('range-eve', 'dark-chess', 'black-wins', 'timeout', 12, $2, $2,
            'engine:white', 'engine:black', 'White Engine', 'Black Engine', 'eve', 'completed'),
           ('range-newer', 'dark-chess', 'draw', 'truncated', 5, $3, $3,
            'new-white', 'new-black', NULL, NULL, 'pvp', 'completed'),
           ('range-running', 'dark-chess', NULL, NULL, 0, $2, NULL,
            NULL, NULL, NULL, NULL, 'pvp', 'running')`,
        [older, day, newer],
      );
    } finally {
      await client.end();
    }
    await recordGameEnd('range-pve', {
      variant: 'dark-chess',
      mode: 'pve',
      result: 'white-wins',
      termination: 'king-captured',
      plyCount: 9,
      startedAt: day,
      endedAt: day,
      whiteClient: 'human-client',
      blackClient: 'random-engine',
      whiteName: null,
      blackName: null,
      corpusId: null,
    });

    const games = await listCompletedGames({
      endedFrom: new Date('2026-05-08T00:00:00.000Z'),
      endedTo: new Date('2026-05-09T00:00:00.000Z'),
    });
    assert.deepEqual(
      games.map((game) => game.roomId),
      ['range-pve', 'range-eve'],
    );
    assert.equal(games[0]?.mode, 'pve');
    assert.deepEqual(games[0]?.participants, [
      {
        color: 'white',
        displayName: 'Guest',
        subjectType: 'guest',
        subjectId: null,
        visibility: 'public',
      },
      {
        color: 'black',
        displayName: 'Random Legal v1',
        subjectType: 'engine-version',
        subjectId: 'builtin-random-legal',
        visibility: 'public',
      },
    ]);

    const eveGames = await listCompletedGames({
      endedFrom: new Date('2026-05-08T00:00:00.000Z'),
      endedTo: new Date('2026-05-09T00:00:00.000Z'),
      mode: 'eve',
    });
    assert.deepEqual(
      eveGames.map((game) => game.roomId),
      ['range-eve'],
    );
  });

  test('getGameSummary returns completed game metadata without events', async () => {
    const now = new Date();
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO games
           (room_id, variant, result, termination, ply_count, started_at, ended_at,
            white_name, black_name, mode, status)
         VALUES
           ('summary-pve', 'dark-chess', 'white-wins', 'king-captured', 17, $1, $1,
            'human', 'engine', 'pve', 'completed'),
           ('summary-running', 'dark-chess', NULL, NULL, 0, $1, NULL,
            NULL, NULL, 'pvp', 'running')`,
        [now],
      );
    } finally {
      await client.end();
    }

    const summary = await getGameSummary('summary-pve');
    assert.equal(summary?.roomId, 'summary-pve');
    assert.equal(summary?.mode, 'pve');
    assert.equal(summary?.whiteName, 'human');
    assert.equal(summary?.blackName, 'engine');
    assert.equal(summary?.plyCount, 17);
    assert.deepEqual(summary?.participants, [
      {
        color: 'white',
        displayName: 'human',
        subjectType: 'guest',
        subjectId: null,
        visibility: 'public',
      },
      {
        color: 'black',
        displayName: 'engine',
        subjectType: 'guest',
        subjectId: null,
        visibility: 'public',
      },
    ]);
    assert.equal(await getGameSummary('summary-running'), null);
    assert.equal(await getGameSummary('missing-summary'), null);
  });

  test('listGameDebugArtifactSummaries groups artifact availability for review panels', async () => {
    const now = new Date();
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO games
           (room_id, variant, result, termination, ply_count, started_at, ended_at, mode, status)
         VALUES ('artifact-summary-game', 'dark-chess', 'white-wins', 'king-captured', 17, $1, $1, 'eve', 'completed')`,
        [now],
      );
      await client.query(
        `INSERT INTO game_debug_artifacts
           (game_id, ply, engine_color, artifact_type, storage, payload)
         VALUES
           ('artifact-summary-game', 3, 'white', 'belief-snapshot', 'jsonb', '{"snapshot_kind":"decision"}'::jsonb),
           ('artifact-summary-game', 4, 'white', 'belief-snapshot', 'jsonb', '{"snapshot_kind":"after-own-move"}'::jsonb)`,
      );
    } finally {
      await client.end();
    }
    await recordGameDebugArtifact({
      gameId: 'artifact-summary-game',
      ply: 5,
      engineColor: 'black',
      artifactType: 'engine-move-choice',
      payload: { selected_move: { from: 'e2', to: 'e4' } },
    });

    assert.deepEqual(await listGameDebugArtifactSummaries('artifact-summary-game'), [
      {
        artifactType: 'belief-snapshot',
        count: 2,
        engineColors: ['white'],
        minPly: 3,
        maxPly: 4,
        snapshotKinds: ['after-own-move', 'decision'],
      },
      {
        artifactType: 'engine-move-choice',
        count: 1,
        engineColors: ['black'],
        minPly: 5,
        maxPly: 5,
        snapshotKinds: [],
      },
    ]);

    const payloads = await listGameDebugArtifactPayloads('artifact-summary-game', {
      artifactType: 'belief-snapshot',
      engineColors: ['white'],
    });
    assert.deepEqual(
      payloads.map((artifact) => ({
        artifactType: artifact.artifactType,
        engineColor: artifact.engineColor,
        ply: artifact.ply,
        snapshotKind: artifact.payload.snapshot_kind,
      })),
      [
        {
          artifactType: 'belief-snapshot',
          engineColor: 'white',
          ply: 3,
          snapshotKind: 'decision',
        },
        {
          artifactType: 'belief-snapshot',
          engineColor: 'white',
          ply: 4,
          snapshotKind: 'after-own-move',
        },
      ],
    );
  });
}
