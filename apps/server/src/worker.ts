import { hostname } from 'node:os';
import pg from 'pg';
import {
  claimNextEngineGameTask,
  finishEngineGameTask,
  heartbeatWorkerRun,
  registerWorkerRun,
  releaseEngineGameTaskClaim,
  stopWorkerRun,
  type EngineGameTask,
} from './engine-experiments.js';
import { runRandomLegalEngineGame } from './engine-runner.js';
import { runMigrations } from './migrate.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to run the engine worker');
  process.exit(1);
}

const provider = process.env.WORKER_PROVIDER ?? 'local';
const providerRunId = process.env.WORKER_PROVIDER_RUN_ID ?? null;
const workerId = process.env.WORKER_ID ?? `${hostname()}:${process.pid}`;
const dryRun = !process.argv.includes('--execute');

const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
let activeWorkerRunId: string | null = null;
let activeTask: EngineGameTask | null = null;

try {
  await migrate(databaseUrl);
  const workerRun = await registerWorkerRun(pool, {
    provider,
    providerRunId,
    capabilities: { engine_games: true },
    resourceLimits: {
      concurrency: Number.parseInt(process.env.WORKER_CONCURRENCY ?? '1', 10),
    },
  });
  activeWorkerRunId = workerRun.id;

  log('worker_started', {
    workerRunId: workerRun.id,
    workerId,
    provider,
    providerRunId,
    dryRun,
  });

  await heartbeatWorkerRun(pool, workerRun.id);
  const task = await claimNextEngineGameTask(pool, {
    workerRunId: workerRun.id,
    workerId,
    provider,
    providerRunId,
  });
  activeTask = task;

  if (!task) {
    log('worker_no_task', { workerRunId: workerRun.id });
    await stopWorkerRun(pool, workerRun.id);
    activeWorkerRunId = null;
  } else if (dryRun) {
    log('worker_task_claimed', {
      workerRunId: workerRun.id,
      taskId: task.id,
      jobId: task.jobId,
      gameIndex: task.gameIndex,
      dryRun,
    });
    await releaseEngineGameTaskClaim(pool, task.id, task.claimToken!, { decrementAttempt: true });
    log('worker_task_released', {
      workerRunId: workerRun.id,
      taskId: task.id,
      reason: 'dry-run',
    });
    await stopWorkerRun(pool, workerRun.id);
    activeTask = null;
    activeWorkerRunId = null;
  } else {
    log('worker_task_claimed', {
      workerRunId: workerRun.id,
      taskId: task.id,
      jobId: task.jobId,
      gameIndex: task.gameIndex,
      dryRun,
    });
    const result = await runRandomLegalEngineGame(pool, task);
    log('worker_task_finished', {
      workerRunId: workerRun.id,
      taskId: task.id,
      gameId: result.gameId,
      status: result.status,
      plyCount: result.plyCount,
    });
    await stopWorkerRun(pool, workerRun.id);
    activeTask = null;
    activeWorkerRunId = null;
  }
} catch (err) {
  const error = (err as Error).message;
  if (activeTask?.claimToken) {
    try {
      await finishEngineGameTask(pool, activeTask.id, activeTask.claimToken, 'failed', error);
    } catch (finishErr) {
      log('worker_task_failure_record_failed', { error: (finishErr as Error).message });
    }
  }
  if (activeWorkerRunId) {
    try {
      await stopWorkerRun(pool, activeWorkerRunId, 'failed', error);
    } catch (stopErr) {
      log('worker_stop_failed', { error: (stopErr as Error).message });
    }
  }
  log('worker_failed', { error });
  process.exitCode = 1;
} finally {
  await pool.end();
}

async function migrate(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const applied = await runMigrations(client);
    if (applied.length > 0) log('worker_migrations_applied', { applied });
  } finally {
    await client.end();
  }
}

function log(kind: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: 'info', kind, at: new Date().toISOString(), ...data }));
}
