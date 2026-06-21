-- Allow the remaining live PvP variants to have rating/profile buckets. The
-- global rated flag still controls whether rated rows are written; this only
-- keeps the user_ratings allowlist in sync with the game-spec rated flags.

ALTER TABLE user_ratings
  DROP CONSTRAINT IF EXISTS user_ratings_variant_check;

ALTER TABLE user_ratings
  ADD CONSTRAINT user_ratings_variant_check
  CHECK (variant IN ('fog', 'fog_draft960', 'dark_mini_xiangqi', 'dark_xiangqi', 'crossroads_chess_open', 'crossroads_chess', 'jieqi', 'banqi', 'reveal_chess', 'dark_shogi', 'dark_crazyhouse'));
