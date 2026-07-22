import { getPool } from './persistence-db.js';
import {
  generateMistboardReadout,
  latestMistboardReadout,
} from './persistence-mistboard-readout.js';
import { assert, definePersistenceTests, test } from './persistence-test-support.js';

definePersistenceTests('Mistboard readout', () => {
  test('weekly generation is durable and idempotent', async () => {
    const input = {
      trigger: 'weekly' as const,
      now: new Date('2026-07-20T17:23:00Z'),
      runtime: {
        revision: 'revision-1',
        activeGames: 0,
        databaseRequired: true,
        persistence: 'enabled' as const,
        persistenceErrors: { count1m: 0, lastAt: null },
      },
      db: getPool(),
    };
    const first = await generateMistboardReadout(input);
    const second = await generateMistboardReadout(input);

    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(second.report.snapshotId, first.report.snapshotId);
    assert.equal((await latestMistboardReadout())?.snapshotId, first.report.snapshotId);
    const stored = await getPool().query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ops_readout_snapshots`,
    );
    assert.equal(stored.rows[0]?.count, 1);
  });

  test('dry run does not store a snapshot', async () => {
    const result = await generateMistboardReadout({
      trigger: 'manual',
      now: new Date('2026-07-22T17:23:00Z'),
      dryRun: true,
      runtime: {
        revision: null,
        activeGames: 0,
        databaseRequired: true,
        persistence: 'enabled',
        persistenceErrors: { count1m: 0, lastAt: null },
      },
      db: getPool(),
    });
    assert.match(result.report.snapshotId, /^readout_dry_/);
    assert.equal(await latestMistboardReadout(), null);
  });
});
