-- 009_email_auth.sql
-- One-time email login challenges for minimal passwordless accounts.

CREATE TABLE IF NOT EXISTS email_login_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS email_login_challenges_email_idx
  ON email_login_challenges (lower(email), created_at DESC);
CREATE INDEX IF NOT EXISTS email_login_challenges_expires_at_idx
  ON email_login_challenges (expires_at);
