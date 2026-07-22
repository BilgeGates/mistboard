-- 112_puzzle_quality_sessions.sql
-- Privacy-minimal quality telemetry for the served puzzle corpus.
--
-- A session id is generated fresh for one puzzle visit and is never reused for
-- another puzzle. There is deliberately no user id, account id, IP address,
-- cookie id, or other cross-puzzle identifier. This gives the mining quality
-- loop deduplicated funnels and mutable thumb votes without turning an
-- account-optional training surface into user tracking.

CREATE TABLE IF NOT EXISTS puzzle_quality_sessions (
  puzzle_id       text        NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  session_id      uuid        NOT NULL,
  variant         text        NOT NULL,
  viewed_at       timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  completed_at    timestamptz,
  outcome         text CHECK (outcome IS NULL OR outcome IN ('solved', 'revealed', 'abandoned')),
  wrong_attempts  integer     NOT NULL DEFAULT 0 CHECK (wrong_attempts >= 0),
  hint_count      integer     NOT NULL DEFAULT 0 CHECK (hint_count >= 0),
  vote            smallint    CHECK (vote IS NULL OR vote IN (-1, 1)),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (puzzle_id, session_id)
);

CREATE INDEX IF NOT EXISTS puzzle_quality_sessions_puzzle_viewed_idx
  ON puzzle_quality_sessions (puzzle_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS puzzle_quality_sessions_variant_viewed_idx
  ON puzzle_quality_sessions (variant, viewed_at DESC);

-- Quality reports aggregate signed-in first attempts by puzzle. The original
-- primary key is user-first, so add the reverse access path now that reports
-- operate puzzle-first.
CREATE INDEX IF NOT EXISTS puzzle_attempts_puzzle_created_idx
  ON puzzle_attempts (puzzle_id, created_at DESC);
