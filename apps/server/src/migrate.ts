import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_TABLE = '_migrations';
const MIGRATIONS_LOCK_KEY = 'mistboard:migrations';

export async function runMigrations(
  client: pg.Client | pg.PoolClient,
  migrationsDir?: string,
): Promise<string[]> {
  const dir = migrationsDir ?? defaultMigrationsDir();
  const newlyApplied: string[] = [];

  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [MIGRATIONS_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        name       TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const applied = await client.query<{ name: string }>(`SELECT name FROM ${MIGRATIONS_TABLE}`);
    const appliedSet = new Set(applied.rows.map((row) => row.name));

    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      if (appliedSet.has(file)) continue;
      const sql = await readFile(join(dir, file), 'utf-8');
      await client.query(sql);
      await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ($1)`, [file]);
      newlyApplied.push(file);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  return newlyApplied;
}

function defaultMigrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', 'migrations');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required to run migrations');
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const applied = await runMigrations(client);
    if (applied.length === 0) console.log('No new migrations.');
    else console.log(`Applied: ${applied.join(', ')}`);
  } finally {
    await client.end();
  }
}
