-- Allow Reveal Chess (chess-jieqi) to have its own rating/profile bucket. Built
-- casual and flag-off (PvP only, no bot); the global rated flag stays off, so no
-- rated rows are written yet -- this only widens the allowlist so the variant
-- participates the moment MISTBOARD_RATED_ENABLED is turned on. Mirrors 044.

ALTER TABLE user_ratings
  DROP CONSTRAINT IF EXISTS user_ratings_variant_check;

ALTER TABLE user_ratings
  ADD CONSTRAINT user_ratings_variant_check
  CHECK (variant IN ('fog', 'fog_draft960', 'dark_mini_xiangqi', 'crossroads_chess_open', 'jieqi', 'banqi', 'reveal_chess'));
