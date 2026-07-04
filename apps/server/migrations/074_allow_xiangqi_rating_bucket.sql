-- Allow standard Xiangqi games to have rating/profile buckets, keeping the
-- user_ratings allowlist in sync with the RatingVariant type (game-specs.ts,
-- which already includes 'xiangqi'). Xiangqi currently ships UNRATED (held off
-- the leaderboard until launch) and PvE is unrated, so no 'xiangqi' rows are
-- written yet; this lands the CHECK ahead of the rated flip so the DB and type
-- never drift.

ALTER TABLE user_ratings
  DROP CONSTRAINT IF EXISTS user_ratings_variant_check;

ALTER TABLE user_ratings
  ADD CONSTRAINT user_ratings_variant_check
  CHECK (variant IN ('fog', 'fog_draft960', 'dark_mini_xiangqi', 'drop_mini_xiangqi', 'dark_xiangqi', 'crossroads_chess_open', 'crossroads_chess', 'jieqi', 'banqi', 'reveal_chess', 'dark_shogi', 'dark_crazyhouse', 'kriegspiel', 'jungle', 'jungle_flip', 'fortress_xiangqi', 'xiangqi'));
