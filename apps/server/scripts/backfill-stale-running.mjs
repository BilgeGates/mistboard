/**
 * One-off backfill: abort all `status='running'` games that have had no event
 * activity in the last 24 hours. Sweeps the CI smoke leaks plus any
 * genuinely-abandoned real games. Idempotent — safe to re-run.
 *
 * Run with --apply to actually write; default is dry-run.
 */
import pg from 'pg';

const apply = process.argv.includes('--apply');

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const q = (sql, params = []) => pool.query(sql, params).then((r) => r.rows);

try {
  const STALE_HOURS = 24;

  // 1. Find candidates: running games whose latest event is older than the threshold.
  const candidates = await q(
    `WITH last_evt AS (
       SELECT room_id, MAX(created_at) AS last_event_at
       FROM events
       GROUP BY room_id
     )
     SELECT
       g.room_id,
       g.mode,
       g.started_at,
       le.last_event_at,
       g.white_client,
       g.black_client
     FROM games g
     LEFT JOIN last_evt le ON le.room_id = g.room_id
     WHERE g.status = 'running'
       AND (le.last_event_at IS NULL OR le.last_event_at < now() - ($1 || ' hours')::interval);`,
    [String(STALE_HOURS)],
  );

  console.log(`Candidates to abort (status='running', stale >${STALE_HOURS}h): ${candidates.length}`);
  for (const c of candidates) {
    const last = c.last_event_at ? new Date(c.last_event_at).toISOString() : '(no events)';
    console.log(`  ${c.room_id}  mode=${c.mode}  last_event=${last}`);
  }

  if (!apply) {
    console.log('\nDry run. Pass --apply to perform the update.');
  } else {

  const reason = `backfill: stale running >${STALE_HOURS}h`;
  const { rowCount } = await pool.query(
    `UPDATE games
     SET status = 'aborted',
         result = NULL,
         termination = 'abandoned',
         ended_at = COALESCE(
           (SELECT MAX(created_at) FROM events WHERE events.room_id = games.room_id),
           games.started_at,
           now()
         ),
         aborted_reason = $1
     WHERE status = 'running'
       AND room_id IN (
         SELECT g.room_id
         FROM games g
         LEFT JOIN (SELECT room_id, MAX(created_at) AS last_event_at FROM events GROUP BY room_id) le
           ON le.room_id = g.room_id
         WHERE g.status = 'running'
           AND (le.last_event_at IS NULL OR le.last_event_at < now() - ($2 || ' hours')::interval)
       );`,
    [reason, String(STALE_HOURS)],
  );
  console.log(`\nUpdated ${rowCount} rows.`);

  const totals = await q(`SELECT status, COUNT(*)::int AS n FROM games GROUP BY 1 ORDER BY 1;`);
  console.log('\nPost-backfill status counts:');
  for (const r of totals) console.log(`  ${r.status.padEnd(10)} ${r.n}`);
  }
} catch (err) {
  console.error('query failed:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
