// Poll a xiangqi broadcast source snapshot into local Postgres.

import { parseArgs } from 'node:util';
import pg from 'pg';
import { runMigrations } from './migrate.js';
import { close, init } from './persistence.js';
import {
  pollXiangqiBroadcastSourceLoop,
  pollXiangqiBroadcastSourceOnce,
  type XiangqiBroadcastPollResult,
} from './xiangqi-broadcast-poller.js';

type Args = {
  source: string;
  intervalMs: number;
  maxIntervalMs: number;
  backoffMultiplier: number;
  timeoutMs: number;
  allowCorrection: boolean;
  dryRun: boolean;
  once: boolean;
};

function parseCliArgs(argv: string[]): Args {
  const { values } = parseArgs({
    args: argv,
    options: {
      source: { type: 'string' },
      'interval-ms': { type: 'string', default: '1000' },
      'max-interval-ms': { type: 'string', default: '30000' },
      'backoff-multiplier': { type: 'string', default: '2' },
      'timeout-ms': { type: 'string', default: '5000' },
      'allow-correction': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      once: { type: 'boolean', default: false },
    },
  });
  if (!values.source) {
    console.error(
      'usage: poll-xiangqi-broadcast-source --source <url> [--once] [--dry-run] [--interval-ms 1000] [--max-interval-ms 30000] [--backoff-multiplier 2] [--timeout-ms 5000] [--allow-correction]',
    );
    process.exit(1);
  }
  if (values['dry-run'] && !values.once) {
    console.error('--dry-run requires --once (a dry run previews a single poll)');
    process.exit(1);
  }
  const intervalMs = Number(values['interval-ms']);
  if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
    console.error('--interval-ms must be a positive integer');
    process.exit(1);
  }
  const maxIntervalMs = Number(values['max-interval-ms']);
  if (!Number.isInteger(maxIntervalMs) || maxIntervalMs < intervalMs) {
    console.error('--max-interval-ms must be an integer greater than or equal to --interval-ms');
    process.exit(1);
  }
  const backoffMultiplier = Number(values['backoff-multiplier']);
  if (!Number.isFinite(backoffMultiplier) || backoffMultiplier < 1) {
    console.error('--backoff-multiplier must be a number greater than or equal to 1');
    process.exit(1);
  }
  const timeoutMs = Number(values['timeout-ms']);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    console.error('--timeout-ms must be a positive integer');
    process.exit(1);
  }
  return {
    source: values.source,
    intervalMs,
    maxIntervalMs,
    backoffMultiplier,
    timeoutMs,
    allowCorrection: Boolean(values['allow-correction']),
    dryRun: Boolean(values['dry-run']),
    once: Boolean(values.once),
  };
}

function printResult(result: XiangqiBroadcastPollResult): void {
  const label = result.dryRun ? 'poll dry-run' : 'poll';
  if (!result.ok) {
    console.log(`${label} failed kind=${result.kind} message=${result.message}`);
    return;
  }
  const counts = new Map<string, number>();
  for (const update of result.updates) {
    const key = update.ok ? update.status : update.kind;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const updateSummary = [...counts.entries()].map(([key, count]) => `${key}=${count}`).join(' ');
  const sourceSummary =
    result.sourcesSeen > 1 || result.sourcesFailed > 0
      ? ` sources=${result.sourcesSeen} sourcesFailed=${result.sourcesFailed}`
      : '';
  console.log(
    `${label} ok tour=${result.tourSlug} rounds=${result.roundsImported} boards=${result.boardsSeen} failed=${result.boardsFailed}${sourceSummary}${updateSummary ? ` ${updateSummary}` : ''}`,
  );
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
    if (args.once) {
      printResult(
        await pollXiangqiBroadcastSourceOnce({
          sourceUrl: args.source,
          timeoutMs: args.timeoutMs,
          allowCorrection: args.allowCorrection,
          dryRun: args.dryRun,
        }),
      );
      return;
    }

    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort());
    process.once('SIGTERM', () => controller.abort());
    await pollXiangqiBroadcastSourceLoop({
      sourceUrl: args.source,
      intervalMs: args.intervalMs,
      maxIntervalMs: args.maxIntervalMs,
      backoffMultiplier: args.backoffMultiplier,
      timeoutMs: args.timeoutMs,
      allowCorrection: args.allowCorrection,
      signal: controller.signal,
      onResult: printResult,
    });
  } finally {
    await close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
