-- 015_rated_games.sql
-- Add rated flag to games. Unrated (casual) games don't affect Elo.
-- Default true so all existing games remain rated.

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS rated BOOLEAN NOT NULL DEFAULT true;
