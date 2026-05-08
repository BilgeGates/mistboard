import { randomUUID } from 'node:crypto';
import pg from 'pg';

type Queryable = Pick<pg.Client | pg.Pool | pg.PoolClient, 'query'>;
type JsonObject = Record<string, unknown>;

export type EngineExperimentPurpose = 'mining' | 'bakeoff' | 'calibration' | 'smoke' | 'regression';
export type EngineWorkerStatus = 'running' | 'draining' | 'stopped' | 'failed';
export type EngineGameTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'aborted' | 'canceled';

export type EngineExperimentJob = {
  id: string;
  status: string;
  purpose: EngineExperimentPurpose;
  targetGames: number;
  completedGames: number;
  failedGames: number;
  config: JsonObject;
  createdBy: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type EngineWorkerRun = {
  id: string;
  provider: string;
  providerRunId: string | null;
  status: EngineWorkerStatus;
  capabilities: JsonObject;
  resourceLimits: JsonObject;
  startedAt: Date;
  heartbeatAt: Date;
  stoppedAt: Date | null;
  failureReason: string | null;
};

export type EngineGameTask = {
  id: string;
  jobId: string;
  gameIndex: number;
  status: EngineGameTaskStatus;
  priority: number;
  gameId: string | null;
  workerRunId: string | null;
  workerId: string | null;
  provider: string | null;
  providerRunId: string | null;
  claimToken: string | null;
  claimExpiresAt: Date | null;
  heartbeatAt: Date | null;
  attemptCount: number;
  maxAttempts: number;
  whiteEngineId: string | null;
  blackEngineId: string | null;
  seed: string;
  timeControl: JsonObject;
  openingPolicy: JsonObject;
  artifactPolicy: JsonObject;
  resourcePolicy: JsonObject;
  config: JsonObject;
  scheduledAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
};

export type CreateExperimentJobInput = {
  id?: string;
  purpose: EngineExperimentPurpose;
  targetGames: number;
  config?: JsonObject;
  createdBy?: string | null;
};

export type CreateEngineGameTaskInput = {
  id?: string;
  jobId: string;
  gameIndex: number;
  priority?: number;
  maxAttempts?: number;
  whiteEngineId?: string | null;
  blackEngineId?: string | null;
  seed: bigint | number | string;
  timeControl: JsonObject;
  openingPolicy?: JsonObject;
  artifactPolicy?: JsonObject;
  resourcePolicy?: JsonObject;
  config?: JsonObject;
  scheduledAt?: Date;
};

export type RegisterWorkerRunInput = {
  id?: string;
  provider: string;
  providerRunId?: string | null;
  capabilities?: JsonObject;
  resourceLimits?: JsonObject;
};

export type ClaimNextTaskInput = {
  workerRunId: string;
  workerId: string;
  provider: string;
  providerRunId?: string | null;
  claimTtlMs?: number;
  claimToken?: string;
};

export async function createExperimentJob(
  db: Queryable,
  input: CreateExperimentJobInput,
): Promise<EngineExperimentJob> {
  const id = input.id ?? `job_${randomUUID()}`;
  const { rows } = await db.query<EveJobRow>(
    `INSERT INTO eve_jobs
       (id, purpose, target_games, config, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      id,
      input.purpose,
      input.targetGames,
      input.config ?? {},
      input.createdBy ?? null,
    ],
  );
  return mapJob(rows[0]!);
}

export async function createEngineGameTask(
  db: Queryable,
  input: CreateEngineGameTaskInput,
): Promise<EngineGameTask> {
  const id = input.id ?? `task_${randomUUID()}`;
  const { rows } = await db.query<EngineGameTaskRow>(
    `INSERT INTO engine_game_tasks
       (id, job_id, game_index, priority, max_attempts, white_engine_id, black_engine_id,
        seed, time_control, opening_policy, artifact_policy, resource_policy, config, scheduled_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      id,
      input.jobId,
      input.gameIndex,
      input.priority ?? 0,
      input.maxAttempts ?? 1,
      input.whiteEngineId ?? null,
      input.blackEngineId ?? null,
      input.seed.toString(),
      input.timeControl,
      input.openingPolicy ?? {},
      input.artifactPolicy ?? {},
      input.resourcePolicy ?? {},
      input.config ?? {},
      input.scheduledAt ?? new Date(),
    ],
  );
  return mapTask(rows[0]!);
}

export async function registerWorkerRun(
  db: Queryable,
  input: RegisterWorkerRunInput,
): Promise<EngineWorkerRun> {
  const id = input.id ?? `worker_${randomUUID()}`;
  const { rows } = await db.query<EngineWorkerRunRow>(
    `INSERT INTO engine_worker_runs
       (id, provider, provider_run_id, capabilities, resource_limits)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      id,
      input.provider,
      input.providerRunId ?? null,
      input.capabilities ?? {},
      input.resourceLimits ?? {},
    ],
  );
  return mapWorkerRun(rows[0]!);
}

export async function heartbeatWorkerRun(db: Queryable, workerRunId: string): Promise<EngineWorkerRun> {
  const { rows } = await db.query<EngineWorkerRunRow>(
    `UPDATE engine_worker_runs
     SET heartbeat_at = now()
     WHERE id = $1
       AND status IN ('running', 'draining')
     RETURNING *`,
    [workerRunId],
  );
  if (rows.length === 0) throw new Error(`worker run ${workerRunId} is not active`);
  return mapWorkerRun(rows[0]!);
}

export async function stopWorkerRun(
  db: Queryable,
  workerRunId: string,
  status: Extract<EngineWorkerStatus, 'stopped' | 'failed'> = 'stopped',
  failureReason: string | null = null,
): Promise<EngineWorkerRun> {
  const { rows } = await db.query<EngineWorkerRunRow>(
    `UPDATE engine_worker_runs
     SET status = $2,
         stopped_at = now(),
         failure_reason = $3
     WHERE id = $1
     RETURNING *`,
    [workerRunId, status, failureReason],
  );
  if (rows.length === 0) throw new Error(`worker run ${workerRunId} not found`);
  return mapWorkerRun(rows[0]!);
}

export async function claimNextEngineGameTask(
  pool: pg.Pool,
  input: ClaimNextTaskInput,
): Promise<EngineGameTask | null> {
  const claimToken = input.claimToken ?? randomUUID();
  const claimExpiresAt = new Date(Date.now() + (input.claimTtlMs ?? 5 * 60_000));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<EngineGameTaskRow>(
      `WITH next_task AS (
         SELECT id
         FROM engine_game_tasks
         WHERE status = 'queued'
           AND scheduled_at <= now()
           AND attempt_count < max_attempts
         ORDER BY priority DESC, scheduled_at, created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE engine_game_tasks task
       SET status = 'running',
           worker_run_id = $1,
           worker_id = $2,
           provider = $3,
           provider_run_id = $4,
           claim_token = $5,
           claim_expires_at = $6,
           heartbeat_at = now(),
           attempt_count = task.attempt_count + 1,
           started_at = now(),
           finished_at = NULL,
           failure_reason = NULL
       FROM next_task
       WHERE task.id = next_task.id
       RETURNING task.*`,
      [
        input.workerRunId,
        input.workerId,
        input.provider,
        input.providerRunId ?? null,
        claimToken,
        claimExpiresAt,
      ],
    );
    await client.query('COMMIT');
    return rows[0] ? mapTask(rows[0]) : null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function heartbeatEngineGameTask(
  db: Queryable,
  taskId: string,
  claimToken: string,
): Promise<EngineGameTask> {
  const { rows } = await db.query<EngineGameTaskRow>(
    `UPDATE engine_game_tasks
     SET heartbeat_at = now(),
         claim_expires_at = now() + (claim_expires_at - heartbeat_at)
     WHERE id = $1
       AND claim_token = $2
       AND status = 'running'
     RETURNING *`,
    [taskId, claimToken],
  );
  if (rows.length === 0) throw new Error(`task ${taskId} is not claimed by this worker`);
  return mapTask(rows[0]!);
}

export async function releaseEngineGameTaskClaim(
  db: Queryable,
  taskId: string,
  claimToken: string,
  options: { decrementAttempt?: boolean } = {},
): Promise<EngineGameTask> {
  const { rows } = await db.query<EngineGameTaskRow>(
    `UPDATE engine_game_tasks
     SET status = 'queued',
         worker_run_id = NULL,
         worker_id = NULL,
         provider = NULL,
         provider_run_id = NULL,
         claim_token = NULL,
         claim_expires_at = NULL,
         heartbeat_at = NULL,
         started_at = NULL,
         failure_reason = NULL,
         attempt_count = CASE
           WHEN $3 THEN GREATEST(attempt_count - 1, 0)
           ELSE attempt_count
         END
     WHERE id = $1
       AND claim_token = $2
       AND status = 'running'
       AND game_id IS NULL
     RETURNING *`,
    [taskId, claimToken, options.decrementAttempt ?? false],
  );
  if (rows.length === 0) throw new Error(`task ${taskId} cannot be released`);
  return mapTask(rows[0]!);
}

export async function finishEngineGameTask(
  db: Queryable,
  taskId: string,
  claimToken: string,
  status: Extract<EngineGameTaskStatus, 'completed' | 'failed' | 'aborted'>,
  failureReason: string | null = null,
): Promise<EngineGameTask> {
  const { rows } = await db.query<EngineGameTaskRow>(
    `UPDATE engine_game_tasks
     SET status = $3,
         finished_at = now(),
         failure_reason = $4,
         claim_expires_at = NULL
     WHERE id = $1
       AND claim_token = $2
       AND status = 'running'
     RETURNING *`,
    [taskId, claimToken, status, failureReason],
  );
  if (rows.length === 0) throw new Error(`task ${taskId} is not claimed by this worker`);
  return mapTask(rows[0]!);
}

type EveJobRow = {
  id: string;
  status: string;
  purpose: EngineExperimentPurpose;
  target_games: number;
  completed_games: number;
  failed_games: number;
  config: JsonObject;
  created_by: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
};

type EngineWorkerRunRow = {
  id: string;
  provider: string;
  provider_run_id: string | null;
  status: EngineWorkerStatus;
  capabilities: JsonObject;
  resource_limits: JsonObject;
  started_at: Date;
  heartbeat_at: Date;
  stopped_at: Date | null;
  failure_reason: string | null;
};

type EngineGameTaskRow = {
  id: string;
  job_id: string;
  game_index: number;
  status: EngineGameTaskStatus;
  priority: number;
  game_id: string | null;
  worker_run_id: string | null;
  worker_id: string | null;
  provider: string | null;
  provider_run_id: string | null;
  claim_token: string | null;
  claim_expires_at: Date | null;
  heartbeat_at: Date | null;
  attempt_count: number;
  max_attempts: number;
  white_engine_id: string | null;
  black_engine_id: string | null;
  seed: string;
  time_control: JsonObject;
  opening_policy: JsonObject;
  artifact_policy: JsonObject;
  resource_policy: JsonObject;
  config: JsonObject;
  scheduled_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  failure_reason: string | null;
  created_at: Date;
};

function mapJob(row: EveJobRow): EngineExperimentJob {
  return {
    id: row.id,
    status: row.status,
    purpose: row.purpose,
    targetGames: row.target_games,
    completedGames: row.completed_games,
    failedGames: row.failed_games,
    config: row.config,
    createdBy: row.created_by,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function mapWorkerRun(row: EngineWorkerRunRow): EngineWorkerRun {
  return {
    id: row.id,
    provider: row.provider,
    providerRunId: row.provider_run_id,
    status: row.status,
    capabilities: row.capabilities,
    resourceLimits: row.resource_limits,
    startedAt: row.started_at,
    heartbeatAt: row.heartbeat_at,
    stoppedAt: row.stopped_at,
    failureReason: row.failure_reason,
  };
}

function mapTask(row: EngineGameTaskRow): EngineGameTask {
  return {
    id: row.id,
    jobId: row.job_id,
    gameIndex: row.game_index,
    status: row.status,
    priority: row.priority,
    gameId: row.game_id,
    workerRunId: row.worker_run_id,
    workerId: row.worker_id,
    provider: row.provider,
    providerRunId: row.provider_run_id,
    claimToken: row.claim_token,
    claimExpiresAt: row.claim_expires_at,
    heartbeatAt: row.heartbeat_at,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    whiteEngineId: row.white_engine_id,
    blackEngineId: row.black_engine_id,
    seed: row.seed,
    timeControl: row.time_control,
    openingPolicy: row.opening_policy,
    artifactPolicy: row.artifact_policy,
    resourcePolicy: row.resource_policy,
    config: row.config,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
  };
}
