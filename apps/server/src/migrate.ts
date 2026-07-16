import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_TABLE = '_migrations';
const MIGRATIONS_LOCK_KEY = 'mistboard:migrations';

// Migrations are ordered by filename sort, so two files sharing a numeric
// prefix apply in an order that is easy to get wrong and easy to collide on
// across branches. These three pairs already shipped (and are recorded by
// filename in _migrations on prod), so they cannot be renamed; every other
// prefix must be unique. Exact file sets, not bare prefixes: a THIRD file
// joining an allowlisted prefix is still an error.
const LEGACY_DUPLICATE_PREFIXES: ReadonlyMap<string, readonly string[]> = new Map([
  ['051', ['051_allow_drop_mini_xiangqi_rating_bucket.sql', '051_bot_profiles.sql']],
  ['064', ['064_allow_jungle_rating_buckets.sql', '064_puzzle_daily_selections.sql']],
  ['081', ['081_align_forum_categories.sql', '081_xiangqi_broadcasts.sql']],
]);

export function assertUniqueMigrationPrefixes(files: readonly string[]): void {
  const byPrefix = new Map<string, string[]>();
  for (const file of files) {
    const match = /^(\d+)_/.exec(file);
    if (!match) continue;
    const group = byPrefix.get(match[1]);
    if (group) group.push(file);
    else byPrefix.set(match[1], [file]);
  }

  const collisions: string[] = [];
  for (const [prefix, group] of byPrefix) {
    if (group.length < 2) continue;
    const legacy = LEGACY_DUPLICATE_PREFIXES.get(prefix);
    const sorted = [...group].sort();
    if (legacy && legacy.length === sorted.length && legacy.every((f, i) => f === sorted[i])) {
      continue;
    }
    collisions.push(`${prefix}: ${sorted.join(', ')}`);
  }

  if (collisions.length > 0) {
    throw new Error(
      `duplicate migration number prefixes detected (rename the NEW file to the next free number):\n${collisions.join('\n')}`,
    );
  }
}

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
    assertUniqueMigrationPrefixes(files);

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
