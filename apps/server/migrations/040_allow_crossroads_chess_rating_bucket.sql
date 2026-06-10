-- Allow Crossroads Chess to have a distinct rating/profile bucket. Live
-- Crossroads rooms remain casual/private unless their room policy opts into
-- rated public play.

ALTER TABLE user_ratings
  DROP CONSTRAINT IF EXISTS user_ratings_variant_check;

ALTER TABLE user_ratings
  ADD CONSTRAINT user_ratings_variant_check
  CHECK (variant IN ('fog', 'fog_draft960', 'dark_mini_xiangqi', 'crossroads_chess_open'));
