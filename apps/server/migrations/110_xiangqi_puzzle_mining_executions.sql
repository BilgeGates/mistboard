-- 110_xiangqi_puzzle_mining_executions.sql
-- Let one frozen manifest be evaluated by multiple immutable execution
-- profiles. Existing rows predate execution identities and remain readable as
-- legacy runs with a NULL execution_sha256.

ALTER TABLE xiangqi_puzzle_mining_runs
  ADD COLUMN IF NOT EXISTS execution_sha256 text
    CHECK (execution_sha256 IS NULL OR execution_sha256 ~ '^[0-9a-f]{64}$');

ALTER TABLE xiangqi_puzzle_mining_runs
  DROP CONSTRAINT IF EXISTS xiangqi_puzzle_mining_runs_import_batch_id_manifest_sha256_key;

CREATE UNIQUE INDEX IF NOT EXISTS xiangqi_puzzle_mining_runs_execution_unique_idx
  ON xiangqi_puzzle_mining_runs (import_batch_id, manifest_sha256, execution_sha256)
  WHERE execution_sha256 IS NOT NULL;
