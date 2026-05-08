import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import pg from 'pg';
import { runMigrations } from './migrate.js';
import {
  claimNextEngineGameTask,
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
}

function getPool(): pg.Pool {
  if (!pool) throw new Error('test pool is not initialized');
  return pool;
}
