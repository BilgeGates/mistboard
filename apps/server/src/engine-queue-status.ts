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
  const [taskTotals, artifactTotals, runtimeSummaries, activeWorkers, recentJobs, recentTasks] = await Promise.all([
    loadTaskTotals(db, options.jobId),
    loadArtifactTotals(db, options.jobId),
    loadRuntimeSummaries(db, options.jobId),
    loadActiveWorkers(db),
    loadRecentJobs(db, options),
    loadRecentTasks(db, options),
  ]);

  return {
    jobId: options.jobId,
    taskTotals,
    artifactTotals,
    runtimeSummaries,
    activeWorkers,
    recentJobs,
    recentTasks,
  };
}

async function loadArtifactTotals(db: pg.Pool, jobId: string | null): Promise<Array<Record<string, unknown>>> {
  const { rows } = await db.query<{
    artifact_type: string;
    count: string;
  }>(
    `SELECT artifact.artifact_type, count(*) AS count
     FROM game_debug_artifacts artifact
     JOIN eve_games eve_game ON eve_game.game_id = artifact.game_id
     WHERE ($1::text IS NULL OR eve_game.job_id = $1)
     GROUP BY artifact.artifact_type
     ORDER BY artifact.artifact_type`,
    [jobId],
  );
  return rows.map((row) => ({
    artifactType: row.artifact_type,
    count: Number.parseInt(row.count, 10),
  }));
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

async function loadRuntimeSummaries(db: pg.Pool, jobId: string | null): Promise<Array<Record<string, unknown>>> {
  const { rows } = await db.query<{
    avg_plies_per_second: string | null;
    avg_wall_ms: string | null;
    black_engine_id: string | null;
    games: string;
    max_wall_ms: string | null;
    runner: string | null;
    white_engine_id: string | null;
  }>(
    `SELECT
       artifact.payload->>'runner' AS runner,
       artifact.payload->>'white_engine_id' AS white_engine_id,
       artifact.payload->>'black_engine_id' AS black_engine_id,
       count(*) AS games,
       avg((artifact.payload->>'wall_ms')::double precision) AS avg_wall_ms,
       max((artifact.payload->>'wall_ms')::double precision) AS max_wall_ms,
       avg((artifact.payload->>'plies_per_second')::double precision) AS avg_plies_per_second
     FROM game_debug_artifacts artifact
     JOIN eve_games eve_game ON eve_game.game_id = artifact.game_id
     WHERE artifact.artifact_type = 'engine-runtime-summary'
       AND ($1::text IS NULL OR eve_game.job_id = $1)
     GROUP BY runner, white_engine_id, black_engine_id
     ORDER BY games DESC, runner, white_engine_id, black_engine_id
     LIMIT 20`,
    [jobId],
  );
  return rows.map((row) => ({
    runner: row.runner,
    whiteEngineId: row.white_engine_id,
    blackEngineId: row.black_engine_id,
    games: Number.parseInt(row.games, 10),
    avgWallMs: row.avg_wall_ms === null ? null : Math.round(Number(row.avg_wall_ms)),
    maxWallMs: row.max_wall_ms === null ? null : Math.round(Number(row.max_wall_ms)),
    avgPliesPerSecond: row.avg_plies_per_second === null ? null : Number(row.avg_plies_per_second),
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
       AND heartbeat_at >= now() - interval '2 minutes'
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
