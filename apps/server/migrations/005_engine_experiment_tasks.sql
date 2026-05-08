-- 005_engine_experiment_tasks.sql
-- Generalize EvE from "background self-play" into provider-neutral engine
-- experiment work. Jobs describe the experiment; tasks are individual games
-- that local, Railway, Modal, or future workers can claim independently.

ALTER TABLE eve_jobs
  DROP CONSTRAINT IF EXISTS eve_jobs_purpose_check,
  ADD CONSTRAINT eve_jobs_purpose_check
    CHECK (purpose IN ('mining', 'bakeoff', 'calibration', 'smoke', 'regression'));

CREATE TABLE IF NOT EXISTS engine_worker_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider <> ''),
  provider_run_id TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'draining', 'stopped', 'failed')),
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  resource_limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at TIMESTAMPTZ,
  failure_reason TEXT,
  CHECK (
    (status IN ('running', 'draining') AND stopped_at IS NULL)
    OR (status IN ('stopped', 'failed') AND stopped_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS engine_worker_runs_provider_idx
  ON engine_worker_runs (provider, started_at DESC);
CREATE INDEX IF NOT EXISTS engine_worker_runs_heartbeat_idx
  ON engine_worker_runs (status, heartbeat_at);

CREATE TABLE IF NOT EXISTS engine_game_tasks (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES eve_jobs(id) ON DELETE CASCADE,
  game_index INTEGER NOT NULL CHECK (game_index >= 0),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'aborted', 'canceled')),
  priority INTEGER NOT NULL DEFAULT 0,
  game_id TEXT UNIQUE REFERENCES games(room_id) ON DELETE SET NULL,
  worker_run_id TEXT REFERENCES engine_worker_runs(id) ON DELETE SET NULL,
  worker_id TEXT,
  provider TEXT,
  provider_run_id TEXT,
  claim_token TEXT,
  claim_expires_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts > 0),
  white_engine_id TEXT REFERENCES engine_versions(id),
  black_engine_id TEXT REFERENCES engine_versions(id),
  seed BIGINT NOT NULL,
  time_control JSONB NOT NULL,
  opening_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  artifact_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  resource_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, game_index),
  CHECK (attempt_count <= max_attempts),
  CHECK (
    (status = 'queued' AND finished_at IS NULL)
    OR (status = 'running' AND started_at IS NOT NULL AND finished_at IS NULL)
    OR (status IN ('completed', 'failed', 'aborted', 'canceled') AND finished_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS engine_game_tasks_claim_idx
  ON engine_game_tasks (status, priority DESC, scheduled_at, created_at);
CREATE INDEX IF NOT EXISTS engine_game_tasks_job_status_idx
  ON engine_game_tasks (job_id, status);
CREATE INDEX IF NOT EXISTS engine_game_tasks_worker_run_idx
  ON engine_game_tasks (worker_run_id, status);
CREATE INDEX IF NOT EXISTS engine_game_tasks_provider_idx
  ON engine_game_tasks (provider, status, heartbeat_at);
CREATE INDEX IF NOT EXISTS engine_game_tasks_white_engine_idx
  ON engine_game_tasks (white_engine_id);
CREATE INDEX IF NOT EXISTS engine_game_tasks_black_engine_idx
  ON engine_game_tasks (black_engine_id);

ALTER TABLE eve_games
  ADD COLUMN IF NOT EXISTS task_id TEXT REFERENCES engine_game_tasks(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS eve_games_task_id_unique_idx
  ON eve_games (task_id)
  WHERE task_id IS NOT NULL;
