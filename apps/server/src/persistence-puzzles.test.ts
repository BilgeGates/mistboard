import { getPool } from './persistence-db.js';
import { getOrCreateDailyPuzzleSelection } from './persistence-puzzles.js';
import { assert, definePersistenceTests, test } from './persistence-test-support.js';

definePersistenceTests('daily puzzles', () => {
  test('persists and reuses the homepage daily puzzle assignment', async () => {
    const first = await getOrCreateDailyPuzzleSelection('2026-07-01', 'homepage');
    const second = await getOrCreateDailyPuzzleSelection('2026-07-01', 'homepage');

    assert.equal(first.persisted, true);
    assert.equal(second.persisted, true);
    assert.equal(second.puzzleId, first.puzzleId);
    assert.equal(second.variant, first.variant);
    assert.equal(second.day, '2026-07-01');
    assert.equal(second.slot, 'homepage');

    const { rows } = await getPool().query<{ count: string }>(
      `SELECT count(*)::text FROM puzzle_daily_selections WHERE day = $1::date AND slot = $2`,
      ['2026-07-01', 'homepage'],
    );
    assert.equal(rows[0]?.count, '1');
  });
});
