-- 070_dm_inbox.sql
-- Direct messages (lichess msg model, #88). One thread per unordered user
-- pair: the thread id is the two user ids sorted and joined with '/', so
-- posting always resolves the same thread and new-vs-reply is an existence
-- check. Read state lives ONLY on the denormalized last message (no
-- per-message cursor). Deletion is per side and a new message from either
-- party un-deletes the thread for both. Reports clone the forum_reports shape
-- so DM moderation rides the same admin queue pattern.

CREATE TABLE IF NOT EXISTS dm_threads (
  id TEXT PRIMARY KEY,                    -- "<user_lo>/<user_hi>"
  user_lo TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_hi TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL,               -- thread starter (new-thread rate limits)
  last_text TEXT NOT NULL,                -- truncated preview, see DM_PREVIEW_MAX
  last_sender_id TEXT NOT NULL,
  last_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read BOOLEAN NOT NULL DEFAULT false,
  deleted_by_lo_at TIMESTAMPTZ,
  deleted_by_hi_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_lo < user_hi)
);

CREATE INDEX IF NOT EXISTS dm_threads_lo_recent_idx ON dm_threads (user_lo, last_at DESC);
CREATE INDEX IF NOT EXISTS dm_threads_hi_recent_idx ON dm_threads (user_hi, last_at DESC);
CREATE INDEX IF NOT EXISTS dm_threads_creator_recent_idx ON dm_threads (created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS dm_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
  sender_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  body_text TEXT NOT NULL
    CHECK (char_length(btrim(body_text)) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dm_messages_thread_recent_idx
  ON dm_messages (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dm_messages_sender_recent_idx
  ON dm_messages (sender_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dm_reports (
  id TEXT PRIMARY KEY,
  reporter_account_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  thread_id TEXT NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 240),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution_note TEXT CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 240),
  resolved_by_account_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dm_reports_open_recent_idx
  ON dm_reports (created_at DESC)
  WHERE status = 'open';

CREATE UNIQUE INDEX IF NOT EXISTS dm_reports_open_thread_once_idx
  ON dm_reports (reporter_account_id, thread_id)
  WHERE status = 'open';
