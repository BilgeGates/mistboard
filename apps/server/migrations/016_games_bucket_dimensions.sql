-- 016_games_bucket_dimensions.sql
-- Persist matchmaking bucket dimensions on the games row so offline analysis
-- (Elo simulation, calibration, bucket-segmented funnels) can query them.
-- All nullable: existing rows pre-date this column and shouldn't be lied to.

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS initial_ms        INTEGER,
  ADD COLUMN IF NOT EXISTS increment_ms      INTEGER,
  ADD COLUMN IF NOT EXISTS hidden_draft960   BOOLEAN;

CREATE INDEX IF NOT EXISTS games_initial_ms_idx ON games (initial_ms);
