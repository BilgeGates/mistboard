import pg from 'pg';
import { createEngineGameTask, createExperimentJob } from './engine-experiments.js';
import { defaultEngineId, upsertBuiltinEngineVersions } from './engine-registry.js';
import { parseEngineTimeControl } from './engine-time-policy.js';
import { runMigrations } from './migrate.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to enqueue an engine smoke task');
  process.exit(1);
}

const seed = process.env.ENGINE_SMOKE_SEED ?? Date.now().toString();
const maxPlies = Number.parseInt(process.env.ENGINE_SMOKE_MAX_PLIES ?? '160', 10);
const gameCount = Number.parseInt(process.env.ENGINE_SMOKE_GAMES ?? '1', 10);
const whiteEngineId = process.env.ENGINE_SMOKE_WHITE_ENGINE ?? 'builtin-capture-seeker';
const blackEngineId = process.env.ENGINE_SMOKE_BLACK_ENGINE ?? defaultEngineId();
const timeControl = parseEngineTimeControl(
  process.env.ENGINE_TIME_CONTROL ?? process.env.ENGINE_SMOKE_TIME_CONTROL ?? 'none',
);
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });

try {
  await migrate(databaseUrl);
  await upsertBuiltinEngineVersions(pool, [whiteEngineId, blackEngineId]);
  const job = await createExperimentJob(pool, {
    purpose: 'smoke',
    targetGames: gameCount,
    config: {
      pairing: {
        kind: 'builtin-engine-vs-engine',
        white_engine_id: whiteEngineId,
        black_engine_id: blackEngineId,
      },
      sample: { target_games: gameCount },
      time_control: timeControl,
      artifact_policy: { move_choices: 'all' },
      review_policy: { enqueue_engine_lab: true, initial_review_status: 'unreviewed' },
    },
    createdBy: 'engine-smoke-cli',
  });

  const tasks = [];
  for (let gameIndex = 0; gameIndex < gameCount; gameIndex++) {
    tasks.push(
      await createEngineGameTask(pool, {
        jobId: job.id,
        gameIndex,
        whiteEngineId,
        blackEngineId,
        seed: nextSeed(seed, gameIndex),
        timeControl,
        openingPolicy: { kind: 'standard' },
        artifactPolicy: { move_choices: 'all', runtime_summary: 'all' },
        resourcePolicy: { providers: ['local', 'railway'], concurrency: 1 },
        config: {
          variant: 'fog-of-war',
          max_plies: maxPlies,
          white_engine_id: whiteEngineId,
          black_engine_id: blackEngineId,
        },
      }),
    );
  }

  console.log(
    JSON.stringify({
      level: 'info',
      kind: 'engine_smoke_tasks_enqueued',
      jobId: job.id,
      taskIds: tasks.map((task) => task.id),
      gameCount,
      seed,
      maxPlies,
      whiteEngineId,
      blackEngineId,
      timeControl,
    }),
  );
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

function nextSeed(baseSeed: string, offset: number): string {
  try {
    return (BigInt(baseSeed) + BigInt(offset)).toString();
  } catch {
    return `${baseSeed}-${offset}`;
  }
}
