import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to count accounts');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });

try {
  const { rows } = await pool.query<{
    total: number;
    last7d: number;
    last30d: number;
  }>(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE created_at > now() - INTERVAL '7 days')::int AS last7d,
       count(*) FILTER (WHERE created_at > now() - INTERVAL '30 days')::int AS last30d
     FROM users`,
  );
  const row = rows[0];
  console.log(
    JSON.stringify(
      {
        level: 'info',
        kind: 'accounts_count',
        total: row?.total ?? 0,
        newLast7d: row?.last7d ?? 0,
        newLast30d: row?.last30d ?? 0,
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
