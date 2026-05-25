ALTER TABLE games
  ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'global';

CREATE INDEX IF NOT EXISTS games_region_status_idx
  ON games (region, status, ended_at DESC);
