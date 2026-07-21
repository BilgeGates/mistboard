-- 107_xiangqi_puzzle_mining.sql
-- Durable, resumable standard-xiangqi puzzle-mining state.
--
-- The immutable manifest is the run boundary. A run owns ordered membership,
-- leased/resumable shards, candidates, versioned engine judgments, and human
-- editorial reviews. Large raw engine traces may live elsewhere, but the
-- settings, verdicts, factual evidence, and optional artifact hash remain here.

CREATE TABLE IF NOT EXISTS xiangqi_puzzle_mining_runs (
  id                  text PRIMARY KEY,
  source_id           text NOT NULL REFERENCES historical_xiangqi_sources(id) ON DELETE RESTRICT,
  import_batch_id     text NOT NULL REFERENCES historical_xiangqi_import_batches(id) ON DELETE RESTRICT,
  manifest_format     text NOT NULL,
  eligibility_version text NOT NULL,
  selection_seed      text NOT NULL,
  manifest_sha256     text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  serialized_sha256   text CHECK (serialized_sha256 IS NULL OR serialized_sha256 ~ '^[0-9a-f]{64}$'),
  manifest            json NOT NULL,
  engine_profile      jsonb NOT NULL DEFAULT '{}'::jsonb,
  scan_profile        jsonb NOT NULL DEFAULT '{}'::jsonb,
  audit_profile       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status              text NOT NULL DEFAULT 'ready'
    CHECK (status IN (
      'ready', 'scanning', 'verifying', 'auditing', 'review',
      'completed', 'failed', 'canceled'
    )),
  counters            jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure             jsonb,
  started_at          timestamptz,
  finished_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_batch_id, manifest_sha256),
  CHECK (
    (status IN ('completed', 'failed', 'canceled') AND finished_at IS NOT NULL)
    OR (status NOT IN ('completed', 'failed', 'canceled') AND finished_at IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS xiangqi_puzzle_mining_games (
  run_id              text NOT NULL REFERENCES xiangqi_puzzle_mining_runs(id) ON DELETE CASCADE,
  historical_game_id  text NOT NULL REFERENCES historical_xiangqi_games(id) ON DELETE RESTRICT,
  selection_index     integer NOT NULL CHECK (selection_index >= 0),
  cohort              text NOT NULL
    CHECK (cohort IN ('representative-live', 'coverage-live', 'correspondence')),
  selection_evidence  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, historical_game_id),
  UNIQUE (run_id, selection_index)
);

CREATE INDEX IF NOT EXISTS xiangqi_puzzle_mining_games_game_idx
  ON xiangqi_puzzle_mining_games (historical_game_id, run_id);

CREATE TABLE IF NOT EXISTS xiangqi_puzzle_mining_shards (
  run_id              text NOT NULL REFERENCES xiangqi_puzzle_mining_runs(id) ON DELETE CASCADE,
  shard_index         integer NOT NULL CHECK (shard_index >= 0),
  selection_start     integer NOT NULL CHECK (selection_start >= 0),
  selection_end       integer NOT NULL CHECK (selection_end > selection_start),
  next_selection_index integer NOT NULL CHECK (next_selection_index >= selection_start),
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempt_count       integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  worker_id           text,
  claim_token         text,
  lease_expires_at    timestamptz,
  last_heartbeat_at   timestamptz,
  failure             jsonb,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, shard_index),
  CHECK (next_selection_index <= selection_end),
  CHECK (
    (status = 'running' AND worker_id IS NOT NULL AND claim_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR status <> 'running'
  ),
  CHECK (
    (status = 'completed' AND next_selection_index = selection_end AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS xiangqi_puzzle_mining_shards_claim_idx
  ON xiangqi_puzzle_mining_shards (run_id, status, lease_expires_at, shard_index);

CREATE TABLE IF NOT EXISTS xiangqi_puzzle_mining_candidates (
  id                  text PRIMARY KEY,
  run_id              text NOT NULL REFERENCES xiangqi_puzzle_mining_runs(id) ON DELETE CASCADE,
  historical_game_id  text NOT NULL,
  post_blunder_ply    integer NOT NULL CHECK (post_blunder_ply >= 0),
  position_key        text NOT NULL,
  trigger             text NOT NULL,
  status              text NOT NULL DEFAULT 'scanned'
    CHECK (status IN (
      'scanned', 'rejected', 'verified', 'audit-failed', 'review',
      'approved', 'published'
    )),
  rejection_reason    text,
  puzzle_data         json,
  scan_evidence       jsonb NOT NULL,
  artifact_sha256     text CHECK (artifact_sha256 IS NULL OR artifact_sha256 ~ '^[0-9a-f]{64}$'),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, historical_game_id, post_blunder_ply),
  FOREIGN KEY (run_id, historical_game_id)
    REFERENCES xiangqi_puzzle_mining_games(run_id, historical_game_id) ON DELETE CASCADE,
  CHECK ((status = 'rejected') = (rejection_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS xiangqi_puzzle_mining_candidates_review_idx
  ON xiangqi_puzzle_mining_candidates (run_id, status, created_at, id);
CREATE INDEX IF NOT EXISTS xiangqi_puzzle_mining_candidates_position_idx
  ON xiangqi_puzzle_mining_candidates (position_key, run_id);

CREATE TABLE IF NOT EXISTS xiangqi_puzzle_mining_judgments (
  id                  bigserial PRIMARY KEY,
  candidate_id        text NOT NULL REFERENCES xiangqi_puzzle_mining_candidates(id) ON DELETE CASCADE,
  stage               text NOT NULL CHECK (stage IN ('verify', 'audit')),
  profile_version     text NOT NULL,
  verdict             text NOT NULL CHECK (verdict IN ('pass', 'reject', 'error')),
  reason              text,
  engine_profile      jsonb NOT NULL,
  evidence            jsonb NOT NULL,
  artifact_sha256     text CHECK (artifact_sha256 IS NULL OR artifact_sha256 ~ '^[0-9a-f]{64}$'),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, stage, profile_version)
);

CREATE INDEX IF NOT EXISTS xiangqi_puzzle_mining_judgments_stage_idx
  ON xiangqi_puzzle_mining_judgments (stage, verdict, created_at, id);

CREATE TABLE IF NOT EXISTS xiangqi_puzzle_editorial_reviews (
  id                  bigserial PRIMARY KEY,
  candidate_id        text NOT NULL REFERENCES xiangqi_puzzle_mining_candidates(id) ON DELETE CASCADE,
  reviewer_user_id    text REFERENCES users(id) ON DELETE SET NULL,
  verdict             text NOT NULL CHECK (verdict IN ('approve', 'reject', 'needs-work')),
  reason              text NOT NULL CHECK (reason IN (
    'publishable', 'ordinary-tactic', 'forced-recapture', 'already-decided',
    'non-unique', 'unstable', 'duplicate', 'unclear', 'too-long',
    'source-provenance-problem', 'correctness-defect', 'other'
  )),
  notes               text,
  reviewed_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS xiangqi_puzzle_editorial_reviews_candidate_idx
  ON xiangqi_puzzle_editorial_reviews (candidate_id, reviewed_at DESC, id DESC);

ALTER TABLE puzzles
  ADD COLUMN IF NOT EXISTS mining_candidate_id text
    REFERENCES xiangqi_puzzle_mining_candidates(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS puzzles_mining_candidate_unique_idx
  ON puzzles (mining_candidate_id)
  WHERE mining_candidate_id IS NOT NULL;
