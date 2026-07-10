// Recompute cached English translations (tour/round nameEn, player nameEn)
// for every stored xiangqi broadcast row, without re-importing from source.
//
// Usage:
//   npm run backfill:xiangqi-broadcast-translations --workspace @mistboard/server -- [--dry-run]
//
// --dry-run prints the before/after nameEn values without writing anything.

import { parseArgs } from 'node:util';
import pg from 'pg';
import { runMigrations } from './migrate.js';
import { backfillXiangqiBroadcastTranslations, close, init } from './persistence.js';

function parseCliArgs(argv: string[]): { dryRun: boolean } {
  const { values } = parseArgs({
    args: argv,
    options: {
      'dry-run': { type: 'boolean', default: false },
    },
  });
  return { dryRun: Boolean(values['dry-run']) };
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const migrationClient = new pg.Client({ connectionString: databaseUrl });
  await migrationClient.connect();
  try {
    const applied = await runMigrations(migrationClient);
    if (applied.length > 0) console.log(`migrations applied: ${applied.join(', ')}`);
  } finally {
    await migrationClient.end();
  }

  init(databaseUrl);
  try {
    const result = await backfillXiangqiBroadcastTranslations({ dryRun: args.dryRun });
    const label = result.dryRun ? 'translate-backfill dry-run' : 'translate-backfill';
    for (const change of result.changes) {
      for (const [field, { before, after }] of Object.entries(change.fields)) {
        console.log(
          `  ${change.kind}=${change.id} ${field}: ${before ?? '(none)'} -> ${after ?? '(none)'}`,
        );
      }
    }
    console.log(
      `${label} tours=${result.toursSeen} rounds=${result.roundsSeen} boards=${result.boardsSeen} changed=${result.changes.length}`,
    );
  } finally {
    await close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
