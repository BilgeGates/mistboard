import { hostname } from 'node:os';
import pg from 'pg';
import {
  claimNextEngineGameTask,
  cleanupStaleEngineGameTasks,
  finishEngineGameTask,
  heartbeatWorkerRun,
  reconcileExperimentJob,
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
const execute = process.argv.includes('--execute');
const loop = process.argv.includes('--loop');
const dryRun = !execute;
const maxTasks = parsePositiveInteger(process.env.WORKER_MAX_TASKS) ?? (loop ? Number.POSITIVE_INFINITY : 1);
const idleSleepMs = parsePositiveInteger(process.env.WORKER_IDLE_SLEEP_MS) ?? 5_000;
const cleanupIntervalMs = parsePositiveInteger(process.env.WORKER_CLEANUP_INTERVAL_MS) ?? 60_000;
const workerCapabilities = { engine_games: true };
const workerResourceLimits = {
  concurrency: Number.parseInt(process.env.WORKER_CONCURRENCY ?? '1', 10),
};

const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
let activeWorkerRunId: string | null = null;
let activeTask: EngineGameTask | null = null;
let shuttingDown = false;

process.on('SIGINT', () => {
  shuttingDown = true;
  log('worker_shutdown_requested', { signal: 'SIGINT' });
});
process.on('SIGTERM', () => {
  shuttingDown = true;
  log('worker_shutdown_requested', { signal: 'SIGTERM' });
});

try {
  await migrate(databaseUrl);
  await cleanupStaleTasks();
  let nextCleanupAt = Date.now() + cleanupIntervalMs;

  const workerRun = await registerWorkerRun(pool, {
    provider,
    providerRunId,
    capabilities: workerCapabilities,
    resourceLimits: workerResourceLimits,
  });
  activeWorkerRunId = workerRun.id;

  log('worker_started', {
    workerRunId: workerRun.id,
    workerId,
    provider,
    providerRunId,
    dryRun,
    loop,
    maxTasks: Number.isFinite(maxTasks) ? maxTasks : 'unbounded',
  });

  let processedTasks = 0;
  while (!shuttingDown && processedTasks < maxTasks) {
    await heartbeatWorkerRun(pool, workerRun.id);

    if (Date.now() >= nextCleanupAt) {
      await cleanupStaleTasks();
      nextCleanupAt = Date.now() + cleanupIntervalMs;
    }

    const task = await claimNextEngineGameTask(pool, {
      workerRunId: workerRun.id,
      workerId,
      provider,
      providerRunId,
      capabilities: workerCapabilities,
    });
    activeTask = task;

    if (!task) {
      log('worker_no_task', { workerRunId: workerRun.id });
      if (!loop) break;
      await sleep(idleSleepMs);
      continue;
    }

    log('worker_task_claimed', {
      workerRunId: workerRun.id,
      taskId: task.id,
      jobId: task.jobId,
      gameIndex: task.gameIndex,
      dryRun,
    });

    if (dryRun) {
      await releaseEngineGameTaskClaim(pool, task.id, task.claimToken!, { decrementAttempt: true });
      log('worker_task_released', {
        workerRunId: workerRun.id,
        taskId: task.id,
        reason: 'dry-run',
      });
    } else {
      try {
        const result = await runRandomLegalEngineGame(pool, task);
        log('worker_task_finished', {
          workerRunId: workerRun.id,
          taskId: task.id,
          gameId: result.gameId,
          status: result.status,
          plyCount: result.plyCount,
        });
      } catch (taskErr) {
        const error = (taskErr as Error).message;
        await finishFailedTask(task, error);
        log('worker_task_failed', {
          workerRunId: workerRun.id,
          taskId: task.id,
          error,
        });
      }
    }

    processedTasks += 1;
    activeTask = null;
    if (!loop) break;
  }

  await stopWorkerRun(pool, workerRun.id, shuttingDown ? 'stopped' : 'stopped');
  activeWorkerRunId = null;
  log('worker_stopped', {
    workerRunId: workerRun.id,
    processedTasks,
    shuttingDown,
  });
} catch (err) {
  const error = (err as Error).message;
  if (activeTask?.claimToken) {
    await finishFailedTask(activeTask, error);
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

async function cleanupStaleTasks(): Promise<void> {
  const cleanup = await cleanupStaleEngineGameTasks(pool);
  if (hasStaleCleanupWork(cleanup)) {
    log('worker_stale_tasks_cleaned', cleanup);
  }
}

function hasStaleCleanupWork(cleanup: Awaited<ReturnType<typeof cleanupStaleEngineGameTasks>>): boolean {
  return cleanup.retried > 0
    || cleanup.failed > 0
    || cleanup.aborted > 0
    || cleanup.failedWorkerRuns > 0
    || cleanup.staleWorkerRuns > 0;
}

async function finishFailedTask(task: EngineGameTask, error: string): Promise<void> {
  if (!task.claimToken) return;
  try {
    await finishEngineGameTask(pool, task.id, task.claimToken, 'failed', error);
    await reconcileExperimentJob(pool, task.jobId);
  } catch (finishErr) {
    log('worker_task_failure_record_failed', { error: (finishErr as Error).message });
  }
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function log(kind: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: 'info', kind, at: new Date().toISOString(), ...data }));
}
