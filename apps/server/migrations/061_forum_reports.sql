-- 061_forum_reports.sql
-- User reports are the first operational moderation layer for the forum. They
-- keep abuse triage out of ad-hoc SQL while preserving the original content.

CREATE TABLE IF NOT EXISTS forum_reports (
  id TEXT PRIMARY KEY,
  reporter_account_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('topic', 'post')),
  topic_id TEXT REFERENCES forum_topics(id) ON DELETE CASCADE,
  post_id TEXT REFERENCES forum_posts(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 240),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution_note TEXT CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 240),
  resolved_by_account_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (target_type = 'topic' AND topic_id IS NOT NULL AND post_id IS NULL)
    OR
    (target_type = 'post' AND post_id IS NOT NULL AND topic_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS forum_reports_open_recent_idx
  ON forum_reports (created_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS forum_reports_status_recent_idx
  ON forum_reports (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS forum_reports_open_topic_once_idx
  ON forum_reports (reporter_account_id, topic_id)
  WHERE status = 'open' AND topic_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS forum_reports_open_post_once_idx
  ON forum_reports (reporter_account_id, post_id)
  WHERE status = 'open' AND post_id IS NOT NULL;
