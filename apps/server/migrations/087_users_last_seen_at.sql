-- 087_users_last_seen_at.sql
-- Durable per-user last-activity timestamp for the Friends page (/following).
-- account_sessions.last_seen_at is per-session (rows expire and get revoked),
-- so the user row carries its own high-water mark. NULL means "no activity
-- recorded since this column landed" and renders as a quiet fallback client
-- side, never an error. The write path lives in getUserByAccountSession
-- (persistence-accounts.ts) and is throttled to roughly once per five minutes
-- per user to avoid per-request write amplification.

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Backfill from the freshest session where one exists.
UPDATE users
SET last_seen_at = sessions.max_last_seen_at
FROM (
  SELECT user_id, MAX(last_seen_at) AS max_last_seen_at
  FROM account_sessions
  GROUP BY user_id
) AS sessions
WHERE users.id = sessions.user_id
  AND users.last_seen_at IS NULL;
