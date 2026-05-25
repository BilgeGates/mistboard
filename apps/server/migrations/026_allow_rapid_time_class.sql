-- 026_allow_rapid_time_class.sql
-- Add the rapid bucket for the official 5+5 time control.

ALTER TABLE user_ratings
  DROP CONSTRAINT IF EXISTS user_ratings_time_class_check;

ALTER TABLE user_ratings
  ADD CONSTRAINT user_ratings_time_class_check
  CHECK (time_class IN ('bullet', 'blitz', 'rapid'));
