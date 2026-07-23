-- 117_xiangqi_explorer_samples.sql
--
-- Opening-explorer sample games gain their rating, result, and date, so the
-- "Top games" list can rank by strength without a second query per lookup.
--
-- Also the point at which stored positions became MIRROR-CANONICAL (see
-- xiangqi-opening-mirror.ts): xiangqi's opening position is symmetric about the
-- central file, so an opening and its mirror are one line and must share a row.
-- Both changes are pure rebuild concerns — xiangqi_opening_moves is derived, so
-- the next `build:xiangqi-explorer` repopulates it in the new shape.

ALTER TABLE xiangqi_opening_moves
  DROP COLUMN IF EXISTS sample_game_ids,
  ADD COLUMN IF NOT EXISTS sample_games jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Stale rows are in the pre-mirror keying and would read as a second, phantom
-- half of every opening until the rebuild lands. Empty is honest; half-merged is
-- not. The API reports "no games" for an empty corpus, and the builder refuses
-- to publish an empty build, so this cannot be mistaken for a successful run.
TRUNCATE xiangqi_opening_moves;
DELETE FROM xiangqi_opening_build;
