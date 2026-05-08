import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import pg from 'pg';
import { runMigrations } from './migrate.js';
import {
  claimNextEngineGameTask,
  cleanupStaleEngineGameTasks,
  createEngineGameTask,
  createExperimentJob,
  heartbeatWorkerRun,
  registerWorkerRun,
  releaseEngineGameTaskClaim,
  stopWorkerRun,
} from './engine-experiments.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

let pool: pg.Pool | null = null;

if (!TEST_DATABASE_URL) {
  test('engine experiments (skipped - set TEST_DATABASE_URL or DATABASE_URL to enable)', { skip: true }, () => {});
} else {
  before(async () => {
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await runMigrations(client);
    } finally {
      await client.end();
    }
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
  });

  after(async () => {
    await pool?.end();
    pool = null;
  });

  beforeEach(async () => {
    await getPool().query(
      `TRUNCATE
         game_debug_artifacts,
         eve_games,
         engine_game_tasks,
         engine_worker_runs,
         eve_jobs,
         engine_versions,
         events,
         games
       RESTART IDENTITY CASCADE`,
    );
  });

  test('worker claims the highest-priority queued task and can release it', async () => {
    const job = await createExperimentJob(getPool(), {
      id: 'job-claim-test',
      purpose: 'bakeoff',
      targetGames: 2,
      config: { pairing: { kind: 'baseline-vs-candidate' } },
      createdBy: 'test',
    });

    await createEngineGameTask(getPool(), {
      id: 'task-low',
      jobId: job.id,
      gameIndex: 0,
      priority: 1,
      seed: 100,
      timeControl: { kind: 'per-move', milliseconds: 100 },
    });
    await createEngineGameTask(getPool(), {
      id: 'task-high',
      jobId: job.id,
      gameIndex: 1,
      priority: 5,
      seed: 101,
      timeControl: { kind: 'per-move', milliseconds: 100 },
    });

    const worker = await registerWorkerRun(getPool(), {
      id: 'worker-claim-test',
      provider: 'local',
      providerRunId: 'local-test',
    });

    const claimed = await claimNextEngineGameTask(getPool(), {
      workerRunId: worker.id,
      workerId: 'test-worker',
      provider: 'local',
      providerRunId: 'local-test',
      claimToken: 'claim-token',
    });

    assert.equal(claimed?.id, 'task-high');
    assert.equal(claimed.status, 'running');
    assert.equal(claimed.attemptCount, 1);
    assert.equal(claimed.claimToken, 'claim-token');

    const released = await releaseEngineGameTaskClaim(getPool(), claimed.id, 'claim-token', {
      decrementAttempt: true,
    });
    assert.equal(released.status, 'queued');
    assert.equal(released.attemptCount, 0);
    assert.equal(released.workerRunId, null);

    const heartbeat = await heartbeatWorkerRun(getPool(), worker.id);
    assert.equal(heartbeat.status, 'running');

    const stopped = await stopWorkerRun(getPool(), worker.id);
    assert.equal(stopped.status, 'stopped');
  });

  test('cleanup retries stale claimed tasks that have not started a game', async () => {
    const job = await createExperimentJob(getPool(), {
      id: 'job-stale-retry-test',
      purpose: 'smoke',
      targetGames: 1,
    });
    await createEngineGameTask(getPool(), {
      id: 'task-stale-retry',
      jobId: job.id,
      gameIndex: 0,
      maxAttempts: 2,
      seed: 200,
      timeControl: { kind: 'none' },
    });
    const worker = await registerWorkerRun(getPool(), {
      id: 'worker-stale-retry-test',
      provider: 'local',
    });

    const claimed = await claimNextEngineGameTask(getPool(), {
      workerRunId: worker.id,
      workerId: 'test-worker',
      provider: 'local',
      claimToken: 'stale-retry-token',
      claimTtlMs: -1,
    });
    assert.equal(claimed?.id, 'task-stale-retry');

    const cleanup = await cleanupStaleEngineGameTasks(getPool());
    assert.deepEqual(cleanup, {
      retried: 1,
      failed: 0,
      aborted: 0,
      failedWorkerRuns: 1,
    });

    const { rows } = await getPool().query<{
      status: string;
      attempt_count: number;
      worker_run_id: string | null;
      claim_token: string | null;
    }>('SELECT status, attempt_count, worker_run_id, claim_token FROM engine_game_tasks WHERE id = $1', [
      'task-stale-retry',
    ]);
    assert.deepEqual(rows, [
      {
        status: 'queued',
        attempt_count: 1,
        worker_run_id: null,
        claim_token: null,
      },
    ]);
  });

  test('cleanup aborts stale claimed tasks that already linked a game', async () => {
    const now = new Date();
    const job = await createExperimentJob(getPool(), {
      id: 'job-stale-abort-test',
      purpose: 'smoke',
      targetGames: 1,
    });
    await createEngineGameTask(getPool(), {
      id: 'task-stale-abort',
      jobId: job.id,
      gameIndex: 0,
      maxAttempts: 2,
      seed: 201,
      timeControl: { kind: 'none' },
    });
    const worker = await registerWorkerRun(getPool(), {
      id: 'worker-stale-abort-test',
      provider: 'local',
    });
    const claimed = await claimNextEngineGameTask(getPool(), {
      workerRunId: worker.id,
      workerId: 'test-worker',
      provider: 'local',
      claimToken: 'stale-abort-token',
      claimTtlMs: -1,
    });
    assert.equal(claimed?.id, 'task-stale-abort');

    await getPool().query(
      `INSERT INTO games
         (room_id, variant, result, termination, ply_count, started_at, ended_at, mode, status)
       VALUES ('stale-game', 'fog-of-war', NULL, NULL, 0, $1, NULL, 'eve', 'running')`,
      [now],
    );
    await getPool().query('UPDATE engine_game_tasks SET game_id = $2 WHERE id = $1', [
      'task-stale-abort',
      'stale-game',
    ]);

    const cleanup = await cleanupStaleEngineGameTasks(getPool());
    assert.deepEqual(cleanup, {
      retried: 0,
      failed: 0,
      aborted: 1,
      failedWorkerRuns: 1,
    });

    const { rows: tasks } = await getPool().query<{
      status: string;
      failure_reason: string | null;
    }>('SELECT status, failure_reason FROM engine_game_tasks WHERE id = $1', [
      'task-stale-abort',
    ]);
    assert.deepEqual(tasks, [
      {
        status: 'aborted',
        failure_reason: 'stale engine task claim',
      },
    ]);

    const { rows: games } = await getPool().query<{
      status: string;
      result: string | null;
      termination: string | null;
      aborted_reason: string | null;
    }>('SELECT status, result, termination, aborted_reason FROM games WHERE room_id = $1', [
      'stale-game',
    ]);
    assert.deepEqual(games, [
      {
        status: 'aborted',
        result: null,
        termination: 'worker-aborted',
        aborted_reason: 'stale engine task claim',
      },
    ]);

    const { rows: jobs } = await getPool().query<{ status: string; failed_games: number }>(
      'SELECT status, failed_games FROM eve_jobs WHERE id = $1',
      [job.id],
    );
    assert.deepEqual(jobs, [{ status: 'completed', failed_games: 1 }]);
  });
}

function getPool(): pg.Pool {
  if (!pool) throw new Error('test pool is not initialized');
  return pool;
}
