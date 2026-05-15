-- 017_user_bucket_ratings.sql
-- Per-bucket Elo ratings keyed by (user, variant, time_class). Replaces
-- users.elo_rating for leaderboard purposes; that column stays for now
-- so existing reads/writes don't break, but new bucket-aware writes go
-- here and the leaderboard reads here.
--
-- Bucket axes (canonical, 2026-05-14):
--   variant    in ('fog', 'fog_draft960')
--   time_class in ('bullet', 'blitz')   -- bullet=1+1, blitz=3+2 or 5+3
--
-- Rows are created lazily on the first rated game in a bucket.

CREATE TABLE IF NOT EXISTS user_ratings (
  user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  variant      TEXT         NOT NULL,
  time_class   TEXT         NOT NULL,
  elo_rating   INTEGER      NOT NULL DEFAULT 1200,
  games_played INTEGER      NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, variant, time_class),
  CHECK (variant IN ('fog', 'fog_draft960')),
  CHECK (time_class IN ('bullet', 'blitz'))
);

CREATE INDEX IF NOT EXISTS user_ratings_bucket_rating_idx
  ON user_ratings (variant, time_class, elo_rating DESC);
