import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to list accounts');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });

try {
  const { rows } = await pool.query<{
    id: string;
    email: string;
    created_at: Date;
  }>(`SELECT id, email, created_at FROM users ORDER BY created_at ASC`);
  console.table(
    rows.map((r) => ({
      id: r.id,
      email: r.email,
      created_at: r.created_at.toISOString(),
    })),
  );
  console.log(`\n${rows.length} account(s)`);
} finally {
  await pool.end();
}
