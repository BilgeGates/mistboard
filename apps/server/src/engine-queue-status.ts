import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to inspect the engine queue');
  process.exit(1);
}

const jobId = process.env.ENGINE_QUEUE_JOB_ID ?? null;
const recentLimit = Number.parseInt(process.env.ENGINE_QUEUE_RECENT_LIMIT ?? '5', 10);
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });

try {
  const status = await loadQueueStatus(pool, {
    jobId,
    recentLimit: Number.isFinite(recentLimit) && recentLimit > 0 ? recentLimit : 5,
  });
  console.log(JSON.stringify({
    level: 'info',
    kind: 'engine_queue_status',
    ...status,
  }, null, 2));
} finally {
  await pool.end();
}

type QueueStatusOptions = {
  jobId: string | null;
  recentLimit: number;
};

async function loadQueueStatus(db: pg.Pool, options: QueueStatusOptions): Promise<Record<string, unknown>> {
  const [taskTotals, activeWorkers, recentJobs, recentTasks] = await Promise.all([
    loadTaskTotals(db, options.jobId),
    loadActiveWorkers(db),
    loadRecentJobs(db, options),
    loadRecentTasks(db, options),
  ]);

  return {
    jobId: options.jobId,
    taskTotals,
    activeWorkers,
    recentJobs,
    recentTasks,
  };
}

async function loadTaskTotals(db: pg.Pool, jobId: string | null): Promise<Array<Record<string, unknown>>> {
  const { rows } = await db.query<{
    status: string;
    count: string;
  }>(
    `SELECT status, count(*) AS count
     FROM engine_game_tasks
     WHERE ($1::text IS NULL OR job_id = $1)
     GROUP BY status
     ORDER BY status`,
    [jobId],
  );
  return rows.map((row) => ({
    status: row.status,
    count: Number.parseInt(row.count, 10),
  }));
}

async function loadActiveWorkers(db: pg.Pool): Promise<Array<Record<string, unknown>>> {
  const { rows } = await db.query<{
    id: string;
    provider: string;
    provider_run_id: string | null;
    status: string;
    started_at: Date;
    heartbeat_at: Date;
  }>(
    `SELECT id, provider, provider_run_id, status, started_at, heartbeat_at
     FROM engine_worker_runs
     WHERE status IN ('running', 'draining')
     ORDER BY heartbeat_at DESC
     LIMIT 10`,
  );
  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    providerRunId: row.provider_run_id,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    heartbeatAt: row.heartbeat_at.toISOString(),
  }));
}

async function loadRecentJobs(
  db: pg.Pool,
  options: QueueStatusOptions,
): Promise<Array<Record<string, unknown>>> {
  const { rows } = await db.query<{
    id: string;
    status: string;
    purpose: string;
    target_games: number;
    completed_games: number;
    failed_games: number;
    created_at: Date;
    started_at: Date | null;
    finished_at: Date | null;
  }>(
    `SELECT id, status, purpose, target_games, completed_games, failed_games,
            created_at, started_at, finished_at
     FROM eve_jobs
     WHERE ($1::text IS NULL OR id = $1)
     ORDER BY created_at DESC
     LIMIT $2`,
    [options.jobId, options.recentLimit],
  );
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    purpose: row.purpose,
    targetGames: row.target_games,
    completedGames: row.completed_games,
    failedGames: row.failed_games,
    createdAt: row.created_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    finishedAt: row.finished_at?.toISOString() ?? null,
  }));
}

async function loadRecentTasks(
  db: pg.Pool,
  options: QueueStatusOptions,
): Promise<Array<Record<string, unknown>>> {
  const { rows } = await db.query<{
    id: string;
    job_id: string;
    game_index: number;
    status: string;
    game_id: string | null;
    worker_run_id: string | null;
    attempt_count: number;
    failure_reason: string | null;
    started_at: Date | null;
    finished_at: Date | null;
  }>(
    `SELECT id, job_id, game_index, status, game_id, worker_run_id, attempt_count,
            failure_reason, started_at, finished_at
     FROM engine_game_tasks
     WHERE ($1::text IS NULL OR job_id = $1)
     ORDER BY created_at DESC
     LIMIT $2`,
    [options.jobId, options.recentLimit],
  );
  return rows.map((row) => ({
    id: row.id,
    jobId: row.job_id,
    gameIndex: row.game_index,
    status: row.status,
    gameId: row.game_id,
    workerRunId: row.worker_run_id,
    attemptCount: row.attempt_count,
    failureReason: row.failure_reason,
    startedAt: row.started_at?.toISOString() ?? null,
    finishedAt: row.finished_at?.toISOString() ?? null,
  }));
}
