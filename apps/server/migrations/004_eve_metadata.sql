-- 004_eve_metadata.sql
-- Extend the canonical games/events store so PvP, PvE, EvE, and imported
-- games share one replay table while EvE-specific lifecycle data lives in
-- side tables.

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'pvp',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN IF NOT EXISTS aborted_reason TEXT;

-- Backfill: corpus-imported games default to mode='imported'. Filtered to
-- mode='pvp' (the previous schema default) so a re-run won't overwrite any
-- row whose mode was deliberately set to something else (e.g. 'manual',
-- 'eve') after this migration first applied.
UPDATE games
SET mode = 'imported'
WHERE corpus_id IS NOT NULL
  AND mode = 'pvp';

ALTER TABLE games
  ALTER COLUMN result DROP NOT NULL,
  ALTER COLUMN termination DROP NOT NULL,
  ALTER COLUMN ended_at DROP NOT NULL;

ALTER TABLE games
  DROP CONSTRAINT IF EXISTS games_result_check,
  DROP CONSTRAINT IF EXISTS games_termination_check,
  ADD CONSTRAINT games_mode_check
    CHECK (mode IN ('pvp', 'pve', 'eve', 'imported', 'manual')),
  ADD CONSTRAINT games_status_check
    CHECK (status IN ('running', 'completed', 'aborted')),
  ADD CONSTRAINT games_review_status_check
    CHECK (review_status IN ('unreviewed', 'flagged', 'reviewed', 'training', 'rejected')),
  ADD CONSTRAINT games_result_check
    CHECK (result IS NULL OR result IN ('white-wins', 'black-wins', 'draw')),
  ADD CONSTRAINT games_termination_check
    CHECK (
      termination IS NULL
      OR termination IN (
        'king-captured',
        'timeout',
        'checkmate',
        'draw',
        'engine-failure',
        'worker-aborted',
        'server-restarted',
        'no-legal-moves',
        'truncated'
      )
    ),
  ADD CONSTRAINT games_status_shape_check
    CHECK (
      (
        status = 'running'
        AND result IS NULL
        AND termination IS NULL
        AND ended_at IS NULL
      )
      OR (
        status = 'completed'
        AND result IS NOT NULL
        AND termination IS NOT NULL
        AND ended_at IS NOT NULL
      )
      OR (
        status = 'aborted'
        AND result IS NULL
        AND termination IS NOT NULL
        AND ended_at IS NOT NULL
      )
    );

CREATE INDEX IF NOT EXISTS games_mode_status_idx ON games (mode, status, ended_at DESC);
CREATE INDEX IF NOT EXISTS games_review_status_idx ON games (review_status, ended_at DESC);

CREATE TABLE IF NOT EXISTS engine_versions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  play_signature TEXT NOT NULL,
  engine_version_pin TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (config_hash, play_signature)
);

CREATE INDEX IF NOT EXISTS engine_versions_name_idx ON engine_versions (name);
CREATE INDEX IF NOT EXISTS engine_versions_created_at_idx ON engine_versions (created_at DESC);

CREATE TABLE IF NOT EXISTS eve_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'aborted', 'failed')),
  purpose TEXT NOT NULL
    CHECK (purpose IN ('mining', 'calibration', 'smoke')),
  target_games INTEGER NOT NULL CHECK (target_games > 0),
  completed_games INTEGER NOT NULL DEFAULT 0 CHECK (completed_games >= 0),
  failed_games INTEGER NOT NULL DEFAULT 0 CHECK (failed_games >= 0),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS eve_jobs_status_created_at_idx ON eve_jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS eve_jobs_purpose_idx ON eve_jobs (purpose);

CREATE TABLE IF NOT EXISTS eve_games (
  game_id TEXT PRIMARY KEY REFERENCES games(room_id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES eve_jobs(id) ON DELETE CASCADE,
  game_index INTEGER NOT NULL CHECK (game_index >= 0),
  worker_id TEXT,
  white_engine_id TEXT REFERENCES engine_versions(id),
  black_engine_id TEXT REFERENCES engine_versions(id),
  white_config_hash TEXT NOT NULL,
  black_config_hash TEXT NOT NULL,
  white_play_signature TEXT NOT NULL,
  black_play_signature TEXT NOT NULL,
  time_control JSONB NOT NULL,
  opening_policy JSONB,
  seed BIGINT NOT NULL,
  abort_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, game_index)
);

CREATE INDEX IF NOT EXISTS eve_games_job_id_idx ON eve_games (job_id);
CREATE INDEX IF NOT EXISTS eve_games_white_engine_id_idx ON eve_games (white_engine_id);
CREATE INDEX IF NOT EXISTS eve_games_black_engine_id_idx ON eve_games (black_engine_id);

CREATE TABLE IF NOT EXISTS game_debug_artifacts (
  id BIGSERIAL PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(room_id) ON DELETE CASCADE,
  ply INTEGER CHECK (ply IS NULL OR ply >= 0),
  engine_color TEXT CHECK (engine_color IS NULL OR engine_color IN ('white', 'black')),
  artifact_type TEXT NOT NULL,
  storage TEXT NOT NULL DEFAULT 'jsonb' CHECK (storage IN ('jsonb', 'local', 's3', 'r2')),
  payload JSONB,
  uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (storage = 'jsonb' AND payload IS NOT NULL AND uri IS NULL)
    OR (storage <> 'jsonb' AND payload IS NULL AND uri IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS game_debug_artifacts_game_id_idx ON game_debug_artifacts (game_id);
CREATE INDEX IF NOT EXISTS game_debug_artifacts_type_idx ON game_debug_artifacts (artifact_type);
