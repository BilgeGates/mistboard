import {
  listGameDebugArtifactPayloads,
  listGameDebugArtifactSummaries,
  recordGameDebugArtifact,
} from './persistence.js';
import {
  assert,
  definePersistenceTests,
  pg,
  TEST_DATABASE_URL,
  test,
} from './persistence-test-support.js';

definePersistenceTests('debug artifacts', () => {
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
});
