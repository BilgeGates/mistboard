-- 003_games_display_names.sql
-- Add display names + corpus grouping to games rows.
--
-- white_name / black_name: human-readable labels (engine names like "Tier-1",
--   real handles later). NULL for live anonymous games — UI shows "anonymous".
-- corpus_id: groups imported corpus games (e.g. "tier1-self-v1"). NULL for
--   live games. Lets the homepage filter to a curated featured set.

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS white_name TEXT,
  ADD COLUMN IF NOT EXISTS black_name TEXT,
  ADD COLUMN IF NOT EXISTS corpus_id  TEXT;

CREATE INDEX IF NOT EXISTS games_corpus_id_idx ON games (corpus_id);
