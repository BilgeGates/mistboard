-- Allow the Dark Mini Xiangqi rating bucket to appear on leaderboard/profile
-- surfaces. Actual rated play can still be gated by room creation policy.

ALTER TABLE user_ratings
  DROP CONSTRAINT IF EXISTS user_ratings_variant_check;

ALTER TABLE user_ratings
  ADD CONSTRAINT user_ratings_variant_check
  CHECK (variant IN ('fog', 'fog_draft960', 'dark_mini_xiangqi'));
