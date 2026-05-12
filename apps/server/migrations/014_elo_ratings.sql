-- 014_elo_ratings.sql
-- Add Elo ratings to users, and elo_before/elo_after to game_participants
-- for rated PvP games.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS elo_rating INTEGER NOT NULL DEFAULT 1200;

CREATE INDEX IF NOT EXISTS users_elo_rating_idx ON users (elo_rating DESC);

ALTER TABLE game_participants
  ADD COLUMN IF NOT EXISTS elo_before INTEGER,
  ADD COLUMN IF NOT EXISTS elo_after INTEGER;
