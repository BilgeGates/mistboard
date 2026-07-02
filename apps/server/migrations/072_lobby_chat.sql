-- 072_lobby_chat.sql
-- Global lobby chat (gate-cleared 2026-07-02; ships behind
-- MISTBOARD_LOBBY_CHAT_ENABLED, default OFF). One row per line, playstrategy
-- semantics: last ~200 lines retained per room (pruned opportunistically),
-- 140-char lines, moderation columns from day one. Timeouts are short (15
-- min) rows checked at post time; expiry is implicit (until < now), no
-- sweeper needed.

CREATE TABLE IF NOT EXISTS chat_lines (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  author_account_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  body_text TEXT NOT NULL
    CHECK (char_length(btrim(body_text)) BETWEEN 1 AND 140),
  shadow BOOLEAN NOT NULL DEFAULT false,
  hidden_at TIMESTAMPTZ,
  hidden_by_account_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  hidden_reason TEXT CHECK (hidden_reason IS NULL OR char_length(hidden_reason) <= 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_lines_room_recent_idx
  ON chat_lines (room, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_lines_author_recent_idx
  ON chat_lines (author_account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_timeouts (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 240),
  until TIMESTAMPTZ NOT NULL,
  created_by_account_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_timeouts_room_user_idx
  ON chat_timeouts (room, user_id, until DESC);
