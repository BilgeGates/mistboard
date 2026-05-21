-- 021_feedback_ip_hash.sql
-- Add ip_hash for anonymous-lane rate limiting (1/day per IP).
-- Hashed so the feedback row holds no raw IP. Only set for anon submissions.

ALTER TABLE feedback_submissions
  ADD COLUMN IF NOT EXISTS ip_hash VARCHAR(64);

CREATE INDEX IF NOT EXISTS feedback_submissions_anon_throttle_idx
  ON feedback_submissions (ip_hash, created_at DESC)
  WHERE user_id IS NULL AND ip_hash IS NOT NULL;
