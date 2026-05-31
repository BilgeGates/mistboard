import { getPublicSiteStats } from './persistence.js';
import {
  assert,
  definePersistenceTests,
  pg,
  TEST_DATABASE_URL,
  test,
} from './persistence-test-support.js';

definePersistenceTests('site stats', () => {
  test('getPublicSiteStats returns public-safe completed game aggregates', async () => {
    const now = new Date('2026-05-29T12:00:00.000Z');
    const weekOne = new Date('2026-04-06T12:00:00.000Z');
    const weekTwo = new Date('2026-05-12T12:00:00.000Z');
    const recent = new Date('2026-05-29T11:00:00.000Z');
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO games
           (room_id, variant, result, termination, ply_count, started_at, ended_at,
            white_client, black_client, white_name, black_name, mode, status, visibility)
         VALUES
           ('stats-pvp-old', 'dark-chess', 'white-wins', 'king-captured', 30, $1, $1,
            'white', 'black', NULL, NULL, 'pvp', 'completed', 'public'),
           ('stats-pve-old', 'dark-chess', 'black-wins', 'timeout', 22, $1, $1,
            'human', 'engine', NULL, NULL, 'pve', 'completed', 'link'),
           ('stats-eve-recent', 'dark-chess', 'draw', 'truncated', 40, $2, $2,
            'engine:white', 'engine:black', 'White Engine', 'Black Engine', 'eve', 'completed', 'unlisted'),
           ('stats-pvp-recent', 'dark-chess', 'black-wins', 'resignation', 18, $3, $3,
            'white', 'black', NULL, NULL, 'pvp', 'completed', 'private'),
           ('stats-imported', 'dark-chess', 'white-wins', 'resignation', 50, $3, $3,
            'white', 'black', NULL, NULL, 'imported', 'completed', 'public'),
           ('stats-running', 'dark-chess', NULL, NULL, 0, $3, NULL,
            'white', 'black', NULL, NULL, 'pvp', 'running', 'public'),
           ('stats-aborted', 'dark-chess', NULL, 'abandoned', 0, $3, $3,
            'white', 'black', NULL, NULL, 'pve', 'aborted', 'public')`,
        [weekOne, weekTwo, recent],
      );
    } finally {
      await client.end();
    }

    const stats = await getPublicSiteStats({ now });

    assert.equal(stats.generatedAt, now.toISOString());
    assert.equal(stats.totalCompletedGames, 3);
    assert.equal(stats.last30dCompletedGames, 1);
    assert.equal(stats.publicGames, 1);
    assert.deepEqual(stats.modeTotals, { pvp: 2, pve: 1, eve: 1 });
    assert.equal(stats.dailyCompletedGames.length, 54);
    assert.deepEqual(stats.dailyCompletedGames[0], {
      date: '2026-04-06',
      completedGames: 2,
      cumulativeGames: 2,
    });
    assert.deepEqual(stats.dailyCompletedGames[36], {
      date: '2026-05-12',
      completedGames: 0,
      cumulativeGames: 2,
    });
    assert.deepEqual(stats.dailyCompletedGames.at(-1), {
      date: '2026-05-29',
      completedGames: 1,
      cumulativeGames: 3,
    });
  });
});
