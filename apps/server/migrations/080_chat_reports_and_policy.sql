-- 080_chat_reports_and_policy.sql
-- Lobby chat moderation v1: deterministic policy metadata on lines plus a
-- report queue. Reports preserve the original line and keep triage out of
-- ad-hoc SQL; moderation actions still soft-hide chat_lines.

ALTER TABLE chat_lines
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'clean',
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT CHECK (
    moderation_reason IS NULL OR char_length(moderation_reason) <= 120
  );

ALTER TABLE chat_lines
  DROP CONSTRAINT IF EXISTS chat_lines_moderation_status_check,
  ADD CONSTRAINT chat_lines_moderation_status_check
    CHECK (moderation_status IN ('clean', 'flagged'));

CREATE INDEX IF NOT EXISTS chat_lines_flagged_recent_idx
  ON chat_lines (created_at DESC)
  WHERE moderation_status = 'flagged' AND hidden_at IS NULL;

CREATE TABLE IF NOT EXISTS chat_reports (
  id TEXT PRIMARY KEY,
  line_id TEXT NOT NULL REFERENCES chat_lines(id) ON DELETE CASCADE,
  reporter_account_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 240),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution_note TEXT CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 240),
  resolved_by_account_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_reports_open_recent_idx
  ON chat_reports (created_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS chat_reports_status_recent_idx
  ON chat_reports (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS chat_reports_open_line_once_idx
  ON chat_reports (reporter_account_id, line_id)
  WHERE status = 'open';
