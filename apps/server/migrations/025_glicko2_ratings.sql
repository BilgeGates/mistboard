-- 025_glicko2_ratings.sql
-- Migrate the human PvP ladder from fixed-K Elo (elo.ts) to Glicko-2 (glicko.ts).
--
-- Adds rating deviation + volatility to the per-bucket ratings, RD history to
-- game_participants, and re-bases the human pool to the Glicko-2 default 1500.
-- Re-basing is safe: no rated games have been played yet (rated launches WITH
-- this change). The engine EvE Elo pool lives elsewhere and is untouched.
--
-- elo_rating keeps its name (now holds a Glicko-2 rating, rounded for storage);
-- full-precision RD + volatility live alongside it.

ALTER TABLE user_ratings
  ADD COLUMN IF NOT EXISTS rating_deviation DOUBLE PRECISION NOT NULL DEFAULT 350,
  ADD COLUMN IF NOT EXISTS volatility       DOUBLE PRECISION NOT NULL DEFAULT 0.06,
  ADD COLUMN IF NOT EXISTS last_rated_at    TIMESTAMPTZ;

-- Re-base any pre-existing rows to the Glicko-2 default (no rated games to keep).
UPDATE user_ratings
  SET elo_rating = 1500, rating_deviation = 350, volatility = 0.06;

-- New buckets start at the Glicko-2 base, not the old Elo 1200.
ALTER TABLE user_ratings ALTER COLUMN elo_rating SET DEFAULT 1500;

-- Per-game RD history (game_participants already holds elo_before/elo_after;
-- this completes it into the immutable rating-event log).
ALTER TABLE game_participants
  ADD COLUMN IF NOT EXISTS rd_before DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS rd_after  DOUBLE PRECISION;
