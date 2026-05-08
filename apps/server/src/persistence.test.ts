import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import pg from 'pg';
import type { GameEvent } from '@bichess/game';
import { runMigrations } from './migrate.js';
import {
  appendEvent,
  close,
  type GameSummary,
  init,
  isInitialized,
  listActiveRoomIds,
  loadRoom,
  recordGameEnd,
} from './persistence.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!TEST_DATABASE_URL) {
  test('persistence (skipped — set TEST_DATABASE_URL or DATABASE_URL to enable)', { skip: true }, () => {});
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
           game_debug_artifacts,
           eve_games,
           engine_game_tasks,
           engine_worker_runs,
           eve_jobs,
           engine_versions,
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
      { type: 'room-created', at: 1000, roomId, variant: 'fog-of-war', offer: [] },
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
      variant: 'fog-of-war',
      offer: [],
    };
    await appendEvent(roomId, 0, event);
    await assert.rejects(
      () => appendEvent(roomId, 0, event),
      /duplicate key|unique constraint/i,
    );
  });

  test('rooms are isolated by room_id', async () => {
    const eventA: GameEvent = {
      type: 'room-created',
      at: 1,
      roomId: 'room-a',
      variant: 'fog-of-war',
      offer: [],
    };
    const eventB: GameEvent = {
      type: 'room-created',
      at: 2,
      roomId: 'room-b',
      variant: 'fog-of-war',
      offer: [],
    };
    await appendEvent('room-a', 0, eventA);
    await appendEvent('room-b', 0, eventB);

    assert.deepEqual(await loadRoom('room-a'), [eventA]);
    assert.deepEqual(await loadRoom('room-b'), [eventB]);
  });

  test('listActiveRoomIds excludes finished games', async () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);

    await appendEvent('active-room', 0, {
      type: 'room-created',
      at: now.getTime(),
      roomId: 'active-room',
      variant: 'fog-of-war',
      offer: [],
    });
    await appendEvent('finished-room', 0, {
      type: 'room-created',
      at: now.getTime(),
      roomId: 'finished-room',
      variant: 'fog-of-war',
      offer: [],
    });
    await recordGameEnd('finished-room', {
      variant: 'fog-of-war',
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
      variant: 'fog-of-war',
      offer: [],
    });

    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO games
           (room_id, variant, result, termination, ply_count, started_at, ended_at, mode, status)
         VALUES ($1, 'fog-of-war', NULL, NULL, 0, $2, NULL, 'eve', 'running')`,
        ['running-room', now],
      );
    } finally {
      await client.end();
    }

    const active = await listActiveRoomIds(earlier);
    assert.deepEqual(active, ['running-room']);
  });

  test('recordGameEnd is idempotent', async () => {
    const now = new Date();
    const summary = {
      variant: 'fog-of-war',
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
         VALUES ($1, 'fog-of-war', NULL, NULL, 0, $2, NULL, 'eve', 'running')`,
        ['running-to-finished', now],
      );
    } finally {
      await client.end();
    }

    await recordGameEnd('running-to-finished', {
      variant: 'fog-of-war',
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
}
