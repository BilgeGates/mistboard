-- Allow Jieqi and Banqi to have their own rating/profile buckets. Both launched
-- casual (PvP only; banqi has no bot yet) and the global rated flag stays off, so
-- no rated rows are written yet -- this only widens the allowlist so the variants
-- participate the moment MISTBOARD_RATED_ENABLED is turned on. Mirrors migration
-- 040 (crossroads_chess_open).

ALTER TABLE user_ratings
  DROP CONSTRAINT IF EXISTS user_ratings_variant_check;

ALTER TABLE user_ratings
  ADD CONSTRAINT user_ratings_variant_check
  CHECK (variant IN ('fog', 'fog_draft960', 'dark_mini_xiangqi', 'crossroads_chess_open', 'jieqi', 'banqi'));
