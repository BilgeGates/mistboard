import { getGameSummary, recordGameEnd } from './persistence.js';
import {
  assert,
  definePersistenceTests,
  pg,
  TEST_DATABASE_URL,
  test,
} from './persistence-test-support.js';

definePersistenceTests('game end', () => {
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
});
