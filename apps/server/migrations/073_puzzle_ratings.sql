-- 073_puzzle_ratings.sql
-- Glicko-2 puzzle ratings. A SEPARATE pool from the live-game user_ratings:
-- puzzle skill is not game skill (this matches lichess). Reuses the existing
-- glicko.ts engine — the user is the "player", the puzzle is the "opponent".
--
-- Three tables:
--   puzzle_ratings       each puzzle's rating, seeded lazily from a difficulty
--                        heuristic on first rated attempt, then floats.
--   user_puzzle_ratings  per (user, variant) puzzle rating.
--   puzzle_attempts      first outcome per (user, puzzle); the primary key makes
--                        rating updates idempotent — only the first attempt at a
--                        puzzle ever moves ratings (retries don't).
--
-- `variant` is a GameSpecId text (e.g. 'fortress-xiangqi'), validated at the app
-- layer against the puzzle registry, so no DB CHECK list is maintained here
-- (unlike the live rating buckets, which gate on a growing CHECK constraint).

CREATE TABLE IF NOT EXISTS puzzle_ratings (
  puzzle_id         TEXT             PRIMARY KEY,
  variant           TEXT             NOT NULL,
  rating            DOUBLE PRECISION NOT NULL DEFAULT 1500,
  rating_deviation  DOUBLE PRECISION NOT NULL DEFAULT 350,
  volatility        DOUBLE PRECISION NOT NULL DEFAULT 0.06,
  plays             INTEGER          NOT NULL DEFAULT 0,
  solves            INTEGER          NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS puzzle_ratings_variant_idx ON puzzle_ratings (variant);

CREATE TABLE IF NOT EXISTS user_puzzle_ratings (
  user_id           TEXT             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  variant           TEXT             NOT NULL,
  rating            DOUBLE PRECISION NOT NULL DEFAULT 1500,
  rating_deviation  DOUBLE PRECISION NOT NULL DEFAULT 350,
  volatility        DOUBLE PRECISION NOT NULL DEFAULT 0.06,
  solved            INTEGER          NOT NULL DEFAULT 0,
  attempts          INTEGER          NOT NULL DEFAULT 0,
  last_rated_at     TIMESTAMPTZ,
  PRIMARY KEY (user_id, variant)
);

CREATE TABLE IF NOT EXISTS puzzle_attempts (
  user_id             TEXT             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_id           TEXT             NOT NULL,
  variant             TEXT             NOT NULL,
  solved              BOOLEAN          NOT NULL,
  rated               BOOLEAN          NOT NULL DEFAULT TRUE,
  user_rating_before  DOUBLE PRECISION,
  user_rating_after   DOUBLE PRECISION,
  created_at          TIMESTAMPTZ      NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, puzzle_id)
);

CREATE INDEX IF NOT EXISTS puzzle_attempts_user_recent_idx
  ON puzzle_attempts (user_id, created_at DESC);
