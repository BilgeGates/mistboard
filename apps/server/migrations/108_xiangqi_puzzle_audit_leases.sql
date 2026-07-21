-- 108_xiangqi_puzzle_audit_leases.sql
-- Independently fenced audit work over verified mining candidates.

ALTER TABLE xiangqi_puzzle_mining_candidates
  ADD COLUMN IF NOT EXISTS audit_worker_id text,
  ADD COLUMN IF NOT EXISTS audit_claim_token text,
  ADD COLUMN IF NOT EXISTS audit_lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS audit_last_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS audit_attempt_count integer NOT NULL DEFAULT 0
    CHECK (audit_attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS audit_failure jsonb;

ALTER TABLE xiangqi_puzzle_mining_candidates
  ADD CONSTRAINT xiangqi_puzzle_mining_candidates_audit_claim_check CHECK (
    (audit_claim_token IS NULL AND audit_worker_id IS NULL AND audit_lease_expires_at IS NULL)
    OR
    (audit_claim_token IS NOT NULL AND audit_worker_id IS NOT NULL AND audit_lease_expires_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS xiangqi_puzzle_mining_candidates_audit_claim_idx
  ON xiangqi_puzzle_mining_candidates
    (run_id, status, audit_lease_expires_at, created_at, id);
