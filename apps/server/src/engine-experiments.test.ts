import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import pg from 'pg';
import { runMigrations } from './migrate.js';
import {
  claimNextEngineGameTask,
  cleanupStaleEngineGameTasks,
  createEngineGameTask,
  createExperimentJob,
  finishEngineGameTask,
  heartbeatEngineGameTask,
  heartbeatWorkerRun,
  reconcileExperimentJob,
  registerWorkerRun,
  releaseEngineGameTaskClaim,
  stopWorkerRun,
} from './engine-experiments.js';
import { loadEngine, upsertBuiltinEngineVersions } from './engine-registry.js';
import { runRandomLegalEngineGame } from './engine-runner.js';

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
         engines,
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

  test('worker only claims tasks matching provider and capabilities', async () => {
    const job = await createExperimentJob(getPool(), {
      id: 'job-resource-policy-test',
      purpose: 'bakeoff',
      targetGames: 3,
    });
    await createEngineGameTask(getPool(), {
      id: 'task-modal',
      jobId: job.id,
      gameIndex: 0,
      priority: 10,
      seed: 110,
      timeControl: { kind: 'none' },
      resourcePolicy: { providers: ['modal'] },
    });
    await createEngineGameTask(getPool(), {
      id: 'task-gpu',
      jobId: job.id,
      gameIndex: 1,
      priority: 9,
      seed: 111,
      timeControl: { kind: 'none' },
      resourcePolicy: { providers: ['railway'], required_capabilities: ['gpu'] },
    });
    await createEngineGameTask(getPool(), {
      id: 'task-railway',
      jobId: job.id,
      gameIndex: 2,
      priority: 8,
      seed: 112,
      timeControl: { kind: 'none' },
      resourcePolicy: { providers: ['railway'], required_capabilities: ['engine_games'] },
    });

    const railwayWorker = await registerWorkerRun(getPool(), {
      id: 'worker-railway-resource-test',
      provider: 'railway',
      capabilities: { engine_games: true },
    });
    const railwayTask = await claimNextEngineGameTask(getPool(), {
      workerRunId: railwayWorker.id,
      workerId: 'railway-test-worker',
      provider: 'railway',
      capabilities: { engine_games: true },
      claimToken: 'railway-resource-token',
    });
    assert.equal(railwayTask?.id, 'task-railway');

    const modalWorker = await registerWorkerRun(getPool(), {
      id: 'worker-modal-resource-test',
      provider: 'modal',
      capabilities: { engine_games: true, gpu: true },
    });
    const modalTask = await claimNextEngineGameTask(getPool(), {
      workerRunId: modalWorker.id,
      workerId: 'modal-test-worker',
      provider: 'modal',
      capabilities: { engine_games: true, gpu: true },
      claimToken: 'modal-resource-token',
    });
    assert.equal(modalTask?.id, 'task-modal');

    const noTask = await claimNextEngineGameTask(getPool(), {
      workerRunId: railwayWorker.id,
      workerId: 'railway-test-worker',
      provider: 'railway',
      capabilities: { engine_games: true },
      claimToken: 'railway-resource-token-2',
    });
    assert.equal(noTask, null);
  });

  test('task heartbeat extends an active claim', async () => {
    const job = await createExperimentJob(getPool(), {
      id: 'job-heartbeat-test',
      purpose: 'smoke',
      targetGames: 1,
    });
    await createEngineGameTask(getPool(), {
      id: 'task-heartbeat',
      jobId: job.id,
      gameIndex: 0,
      seed: 120,
      timeControl: { kind: 'none' },
    });
    const worker = await registerWorkerRun(getPool(), {
      id: 'worker-heartbeat-test',
      provider: 'local',
    });
    const task = await claimNextEngineGameTask(getPool(), {
      workerRunId: worker.id,
      workerId: 'test-worker',
      provider: 'local',
      claimToken: 'heartbeat-token',
      claimTtlMs: 60_000,
    });
    assert.equal(task?.id, 'task-heartbeat');

    const { rows } = await getPool().query<{ claim_expires_at: Date }>(
      `UPDATE engine_game_tasks
       SET heartbeat_at = now() - interval '30 seconds',
           claim_expires_at = now() + interval '30 seconds'
       WHERE id = $1
       RETURNING claim_expires_at`,
      [task.id],
    );
    const preHeartbeatClaimExpiresAt = rows[0]?.claim_expires_at.getTime() ?? 0;
    const heartbeat = await heartbeatEngineGameTask(getPool(), task.id, 'heartbeat-token');
    assert.ok((heartbeat.claimExpiresAt?.getTime() ?? 0) > preHeartbeatClaimExpiresAt);
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
      staleWorkerRuns: 0,
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
      staleWorkerRuns: 0,
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

  test('max-ply truncation completes the task as a draw', async () => {
    const job = await createExperimentJob(getPool(), {
      id: 'job-truncated-draw-test',
      purpose: 'smoke',
      targetGames: 1,
    });
    await createEngineGameTask(getPool(), {
      id: 'task-truncated-draw',
      jobId: job.id,
      gameIndex: 0,
      seed: 300,
      timeControl: { kind: 'none' },
      config: { variant: 'fog-of-war', max_plies: 1 },
    });
    const worker = await registerWorkerRun(getPool(), {
      id: 'worker-truncated-draw-test',
      provider: 'local',
    });
    const task = await claimNextEngineGameTask(getPool(), {
      workerRunId: worker.id,
      workerId: 'test-worker',
      provider: 'local',
      claimToken: 'truncated-draw-token',
    });
    assert.equal(task?.id, 'task-truncated-draw');

    const result = await runRandomLegalEngineGame(getPool(), task);
    assert.equal(result.status, 'completed');
    assert.equal(result.plyCount, 1);

    const { rows: tasks } = await getPool().query<{
      status: string;
      failure_reason: string | null;
    }>('SELECT status, failure_reason FROM engine_game_tasks WHERE id = $1', [
      task.id,
    ]);
    assert.deepEqual(tasks, [{ status: 'completed', failure_reason: null }]);

    const { rows: games } = await getPool().query<{
      status: string;
      result: string | null;
      termination: string | null;
      ply_count: number;
    }>('SELECT status, result, termination, ply_count FROM games WHERE room_id = $1', [
      result.gameId,
    ]);
    assert.deepEqual(games, [
      {
        status: 'completed',
        result: 'draw',
        termination: 'truncated',
        ply_count: 1,
      },
    ]);

    const { rows: jobs } = await getPool().query<{
      status: string;
      completed_games: number;
      failed_games: number;
    }>('SELECT status, completed_games, failed_games FROM eve_jobs WHERE id = $1', [
      job.id,
    ]);
    assert.deepEqual(jobs, [{ status: 'completed', completed_games: 1, failed_games: 0 }]);
  });

  test('failed claimed task aborts linked running game row', async () => {
    const now = new Date();
    const job = await createExperimentJob(getPool(), {
      id: 'job-failed-linked-game-test',
      purpose: 'smoke',
      targetGames: 1,
    });
    await createEngineGameTask(getPool(), {
      id: 'task-failed-linked-game',
      jobId: job.id,
      gameIndex: 0,
      seed: 124,
      timeControl: { kind: 'none' },
      config: { variant: 'fog-of-war', max_plies: 2 },
    });
    const worker = await registerWorkerRun(getPool(), {
      id: 'worker-failed-linked-game-test',
      provider: 'local',
    });
    const task = await claimNextEngineGameTask(getPool(), {
      workerRunId: worker.id,
      workerId: 'test-worker',
      provider: 'local',
      claimToken: 'failed-linked-game-token',
    });
    assert.equal(task?.id, 'task-failed-linked-game');

    await getPool().query(
      `INSERT INTO games
         (room_id, variant, result, termination, ply_count, started_at, ended_at, mode, status)
       VALUES ('failed-linked-game', 'fog-of-war', NULL, NULL, 0, $1, NULL, 'eve', 'running')`,
      [now],
    );
    await getPool().query('UPDATE engine_game_tasks SET game_id = $2 WHERE id = $1', [
      'task-failed-linked-game',
      'failed-linked-game',
    ]);

    await finishEngineGameTask(getPool(), task!.id, task!.claimToken!, 'failed', 'python dependency missing');

    const { rows: games } = await getPool().query<{
      status: string;
      result: string | null;
      termination: string | null;
      aborted_reason: string | null;
    }>('SELECT status, result, termination, aborted_reason FROM games WHERE room_id = $1', [
      'failed-linked-game',
    ]);
    assert.deepEqual(games, [
      {
        status: 'aborted',
        result: null,
        termination: 'engine-failure',
        aborted_reason: 'python dependency missing',
      },
    ]);
  });

  test('runner loads pinned built-in engines and records move-choice artifacts', async () => {
    await upsertBuiltinEngineVersions(getPool(), ['builtin-capture-seeker', 'builtin-random-legal']);
    const job = await createExperimentJob(getPool(), {
      id: 'job-engine-artifact-test',
      purpose: 'smoke',
      targetGames: 1,
    });
    await createEngineGameTask(getPool(), {
      id: 'task-engine-artifact',
      jobId: job.id,
      gameIndex: 0,
      whiteEngineId: 'builtin-capture-seeker',
      blackEngineId: 'builtin-random-legal',
      seed: 500,
      timeControl: { kind: 'none' },
      artifactPolicy: { move_choices: 'all' },
      config: { variant: 'fog-of-war', max_plies: 2 },
    });
    const worker = await registerWorkerRun(getPool(), {
      id: 'worker-engine-artifact-test',
      provider: 'local',
    });
    const task = await claimNextEngineGameTask(getPool(), {
      workerRunId: worker.id,
      workerId: 'test-worker',
      provider: 'local',
      claimToken: 'engine-artifact-token',
    });
    assert.equal(task?.id, 'task-engine-artifact');

    const result = await runRandomLegalEngineGame(getPool(), task);
    assert.equal(result.status, 'completed');

    const { rows: eveGames } = await getPool().query<{
      white_engine_id: string | null;
      black_engine_id: string | null;
      white_play_signature: string;
      black_play_signature: string;
    }>('SELECT white_engine_id, black_engine_id, white_play_signature, black_play_signature FROM eve_games WHERE game_id = $1', [
      result.gameId,
    ]);
    assert.deepEqual(eveGames, [
      {
        white_engine_id: 'builtin-capture-seeker',
        black_engine_id: 'builtin-random-legal',
        white_play_signature: 'builtin-capture-seeker-v1',
        black_play_signature: 'builtin-random-legal-v1',
      },
    ]);

    const { rows: participants } = await getPool().query<{
      color: string;
      display_name: string;
      subject_id: string;
      subject_type: string;
    }>(
      `SELECT color, display_name, subject_id, subject_type
       FROM game_participants
       WHERE game_id = $1
       ORDER BY color DESC`,
      [result.gameId],
    );
    assert.deepEqual(participants, [
      {
        color: 'white',
        display_name: 'Capture Seeker v1',
        subject_id: 'builtin-capture-seeker',
        subject_type: 'engine-version',
      },
      {
        color: 'black',
        display_name: 'Random Legal v1',
        subject_id: 'builtin-random-legal',
        subject_type: 'engine-version',
      },
    ]);

    const { rows: versions } = await getPool().query<{
      id: string;
      engine_id: string;
      kind: string;
      status: string;
    }>(
      `SELECT id, engine_id, kind, status
       FROM engine_versions
       WHERE id IN ('builtin-capture-seeker', 'builtin-random-legal')
       ORDER BY id`,
    );
    assert.deepEqual(versions, [
      {
        id: 'builtin-capture-seeker',
        engine_id: 'capture-seeker',
        kind: 'builtin',
        status: 'active',
      },
      {
        id: 'builtin-random-legal',
        engine_id: 'random-legal',
        kind: 'builtin',
        status: 'active',
      },
    ]);

    const { rows: artifacts } = await getPool().query<{
      artifact_type: string;
      engine_color: string | null;
      payload: {
        engine_id?: string;
        plies_per_second?: number | null;
        runner?: string;
        selected_move?: unknown;
        scored_moves?: unknown[];
        status?: string;
      };
    }>(
      `SELECT artifact_type, engine_color, payload
       FROM game_debug_artifacts
       WHERE game_id = $1
       ORDER BY artifact_type, ply`,
      [result.gameId],
    );
    const moveChoiceArtifacts = artifacts.filter((artifact) => artifact.artifact_type === 'engine-move-choice');
    const runtimeArtifacts = artifacts.filter((artifact) => artifact.artifact_type === 'engine-runtime-summary');
    assert.equal(moveChoiceArtifacts.length, 2);
    assert.equal(moveChoiceArtifacts[0]?.engine_color, 'white');
    assert.equal(moveChoiceArtifacts[0]?.payload.engine_id, 'builtin-capture-seeker');
    assert.ok(moveChoiceArtifacts[0]?.payload.selected_move);
    assert.ok((moveChoiceArtifacts[0]?.payload.scored_moves?.length ?? 0) > 0);
    assert.equal(runtimeArtifacts.length, 1);
    assert.equal(runtimeArtifacts[0]?.engine_color, null);
    assert.equal(runtimeArtifacts[0]?.payload.runner, 'typescript-in-process');
    assert.equal(runtimeArtifacts[0]?.payload.status, 'completed');
    assert.equal(typeof runtimeArtifacts[0]?.payload.plies_per_second, 'number');
  });

  test('registry stores owner-only Python engine versions', async () => {
    await upsertBuiltinEngineVersions(getPool(), [
      'python-tier1-v0.7.0',
      'python-tier1-v0.7.22',
      'python-random-legal',
    ]);
    const tier1 = loadEngine('python-tier1-v0.7.22');
    assert.equal(tier1.kind, 'container');
    assert.equal(tier1.chooseMove, undefined);

    const { rows } = await getPool().query<{
      id: string;
      engine_id: string;
      kind: string;
      config_hash: string;
      play_signature: string;
      metadata: { runtime?: string };
    }>(
      `SELECT id, engine_id, kind, config_hash, play_signature, metadata
       FROM engine_versions
       WHERE id IN ('python-tier1-v0.7.0', 'python-tier1-v0.7.22', 'python-random-legal')
       ORDER BY id`,
    );
    assert.deepEqual(rows, [
      {
        id: 'python-random-legal',
        engine_id: 'random-legal',
        kind: 'container',
        config_hash: 'python-random-legal-v1',
        play_signature: 'python-random-legal-v1',
        metadata: { owner: 'admin', runtime: 'python-subprocess' },
      },
      {
        id: 'python-tier1-v0.7.0',
        engine_id: 'tier1',
        kind: 'container',
        config_hash: 'tier1-v0.7.0-b22f29dd73f5',
        play_signature: 'tier1-v0.7.0-b22f29dd73f5',
        metadata: { owner: 'admin', runtime: 'python-subprocess' },
      },
      {
        id: 'python-tier1-v0.7.22',
        engine_id: 'tier1',
        kind: 'container',
        config_hash: 'tier1-v0.7.22-b22f29dd73f5',
        play_signature: '5d3ddffa74f6',
        metadata: { owner: 'admin', runtime: 'python-subprocess' },
      },
    ]);
  });

  test('job reconciliation derives counters from task state idempotently', async () => {
    const job = await createExperimentJob(getPool(), {
      id: 'job-reconcile-test',
      purpose: 'bakeoff',
      targetGames: 2,
    });
    await createEngineGameTask(getPool(), {
      id: 'task-reconcile-completed',
      jobId: job.id,
      gameIndex: 0,
      seed: 400,
      timeControl: { kind: 'none' },
    });
    await createEngineGameTask(getPool(), {
      id: 'task-reconcile-failed',
      jobId: job.id,
      gameIndex: 1,
      seed: 401,
      timeControl: { kind: 'none' },
    });
    await getPool().query(
      `UPDATE engine_game_tasks
       SET status = CASE WHEN id = 'task-reconcile-completed' THEN 'completed' ELSE 'failed' END,
           started_at = now(),
           finished_at = now()
       WHERE job_id = $1`,
      [job.id],
    );

    await reconcileExperimentJob(getPool(), job.id);
    await reconcileExperimentJob(getPool(), job.id);

    const { rows } = await getPool().query<{
      status: string;
      completed_games: number;
      failed_games: number;
    }>('SELECT status, completed_games, failed_games FROM eve_jobs WHERE id = $1', [
      job.id,
    ]);
    assert.deepEqual(rows, [{ status: 'completed', completed_games: 1, failed_games: 1 }]);
  });

  test('cleanup marks stale workers failed even without claimed tasks', async () => {
    const worker = await registerWorkerRun(getPool(), {
      id: 'worker-stale-heartbeat-test',
      provider: 'local',
    });
    await getPool().query(
      `UPDATE engine_worker_runs
       SET heartbeat_at = now() - interval '10 minutes'
       WHERE id = $1`,
      [worker.id],
    );

    const cleanup = await cleanupStaleEngineGameTasks(
      getPool(),
      new Date(),
      new Date(Date.now() - 2 * 60_000),
    );
    assert.deepEqual(cleanup, {
      retried: 0,
      failed: 0,
      aborted: 0,
      failedWorkerRuns: 0,
      staleWorkerRuns: 1,
    });

    const { rows } = await getPool().query<{
      status: string;
      failure_reason: string | null;
    }>('SELECT status, failure_reason FROM engine_worker_runs WHERE id = $1', [
      worker.id,
    ]);
    assert.deepEqual(rows, [{ status: 'failed', failure_reason: 'stale worker heartbeat' }]);
  });
}

function getPool(): pg.Pool {
  if (!pool) throw new Error('test pool is not initialized');
  return pool;
}
