import pg from 'pg';
import {
  createEngineGameTask,
  createExperimentJob,
} from './engine-experiments.js';
import { runMigrations } from './migrate.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to enqueue an engine smoke task');
  process.exit(1);
}

const seed = process.env.ENGINE_SMOKE_SEED ?? Date.now().toString();
const maxPlies = Number.parseInt(process.env.ENGINE_SMOKE_MAX_PLIES ?? '160', 10);
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });

try {
  await migrate(databaseUrl);
  const job = await createExperimentJob(pool, {
    purpose: 'smoke',
    targetGames: 1,
    config: {
      pairing: { kind: 'builtin-random-legal' },
      sample: { target_games: 1 },
      review_policy: { enqueue_engine_lab: true, initial_review_status: 'unreviewed' },
    },
    createdBy: 'engine-smoke-cli',
  });
  const task = await createEngineGameTask(pool, {
    jobId: job.id,
    gameIndex: 0,
    seed,
    timeControl: { kind: 'none' },
    openingPolicy: { kind: 'standard' },
    resourcePolicy: { providers: ['local'], concurrency: 1 },
    config: { variant: 'fog-of-war', max_plies: maxPlies },
  });

  console.log(JSON.stringify({
    level: 'info',
    kind: 'engine_smoke_task_enqueued',
    jobId: job.id,
    taskId: task.id,
    seed: task.seed,
    maxPlies,
  }));
} finally {
  await pool.end();
}

async function migrate(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const applied = await runMigrations(client);
    if (applied.length > 0) {
      console.log(JSON.stringify({ level: 'info', kind: 'migrations_applied', applied }));
    }
  } finally {
    await client.end();
  }
}
