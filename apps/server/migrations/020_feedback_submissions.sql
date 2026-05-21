-- 020_feedback_submissions.sql
-- /contact form submissions. Anonymous-friendly; email is optional.

CREATE TABLE IF NOT EXISTS feedback_submissions (
  id           UUID         PRIMARY KEY,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  message      TEXT         NOT NULL,
  email        TEXT,
  path         TEXT,
  user_id      UUID,
  user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS feedback_submissions_created_at_idx
  ON feedback_submissions (created_at DESC);
