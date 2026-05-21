import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

const q = (sql, params = []) => pool.query(sql, params).then((r) => r.rows);

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : n);

try {
  const [dbSize] = await q(
    "SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size",
  );
  console.log('DB size:', dbSize.db_size);

  const tables = await q(`
    SELECT
      c.relname AS table_name,
      pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
      pg_total_relation_size(c.oid) AS total_bytes,
      s.n_live_tup AS live_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public'
    ORDER BY total_bytes DESC
    LIMIT 15;
  `);
  console.log('\nTop tables by size:');
  for (const t of tables) {
    console.log(`  ${t.table_name.padEnd(32)} ${t.total_size.padStart(10)}  rows≈${fmt(Number(t.live_rows))}`);
  }

  const [games] = await q('SELECT COUNT(*)::int AS n FROM games');
  console.log('\ngames total:', fmt(games.n));

  const byMode = await q(
    `SELECT mode, status, COUNT(*)::int AS n
     FROM games
     GROUP BY mode, status
     ORDER BY n DESC`,
  );
  console.log('\ngames by mode × status:');
  for (const r of byMode) {
    console.log(`  ${String(r.mode).padEnd(10)} ${String(r.status).padEnd(12)} ${fmt(r.n).padStart(8)}`);
  }

  const [events] = await q('SELECT COUNT(*)::int AS n FROM events');
  console.log('\nevents total:', fmt(events.n));

  const monthly = await q(`
    SELECT
      date_trunc('month', ended_at) AS month,
      COUNT(*)::int AS n
    FROM games
    WHERE ended_at IS NOT NULL
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 12;
  `);
  console.log('\ngames per month (completed):');
  for (const r of monthly) {
    const m = r.month ? new Date(r.month).toISOString().slice(0, 7) : 'null';
    console.log(`  ${m}  ${fmt(r.n).padStart(8)}`);
  }

  const [oldest] = await q(
    "SELECT MIN(started_at) AS earliest, MAX(ended_at) AS latest FROM games",
  );
  console.log('\nearliest game:', oldest.earliest);
  console.log('latest game:  ', oldest.latest);
} catch (err) {
  console.error('query failed:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
