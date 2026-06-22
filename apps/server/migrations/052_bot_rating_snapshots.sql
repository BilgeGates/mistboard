-- 052_bot_rating_snapshots.sql
-- Public bot strength estimates live outside the account-backed human ladder.
-- Rows are append-only snapshots; only published rows can appear on bot pages.

CREATE TABLE IF NOT EXISTS bot_rating_snapshots (
  id BIGSERIAL PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES bot_profiles(id) ON DELETE CASCADE,
  game_spec_id TEXT NOT NULL,
  time_class TEXT NOT NULL DEFAULT 'blitz'
    CHECK (time_class IN ('bullet', 'blitz', 'rapid')),
  rating INTEGER NOT NULL CHECK (rating > 0),
  rating_deviation DOUBLE PRECISION CHECK (rating_deviation IS NULL OR rating_deviation >= 0),
  games INTEGER NOT NULL DEFAULT 0 CHECK (games >= 0),
  source TEXT NOT NULL
    CHECK (source IN ('manual', 'eve-anchor', 'import')),
  source_ref TEXT,
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_rating_snapshots_public_latest_idx
  ON bot_rating_snapshots (bot_id, game_spec_id, time_class, published, created_at DESC, id DESC);
