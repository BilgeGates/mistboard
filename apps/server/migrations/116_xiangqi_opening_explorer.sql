-- 116_xiangqi_opening_explorer.sql
--
-- Aggregate move statistics for the standard-xiangqi opening explorer.
--
-- One row per (position, move played from it): how many corpus games played it
-- and how they finished. This is a DERIVED table, rebuilt in full by
-- `npm run build:xiangqi-explorer --workspace @mistboard/server`; nothing here
-- is a source of truth, so a rebuild may safely truncate it.
--
-- Rights note: the builder only ingests games whose SOURCE is license-cleared
-- (historical_xiangqi_sources.license_status = 'cleared'). Aggregates derived
-- from a not-cleared corpus would republish that corpus in statistical form,
-- which is exactly what the source's license_status is there to prevent. The
-- builder enforces it; this comment records why.

CREATE TABLE IF NOT EXISTS xiangqi_opening_moves (
  -- standardXiangqiPositionKey: "<placement> <r|b>". Placement plus side to
  -- move is the whole key; the explorer is transposition-aware by construction.
  position_key    text     NOT NULL,
  -- Kernel move as "<from><to>" (e.g. "h3e3"), the same spelling the games
  -- table stores. The client renders it into notation.
  move            text     NOT NULL,
  games           integer  NOT NULL DEFAULT 0,
  red_wins        integer  NOT NULL DEFAULT 0,
  black_wins      integer  NOT NULL DEFAULT 0,
  draws           integer  NOT NULL DEFAULT 0,
  -- Games with no recorded result ('*'). Counted so `games` always equals the
  -- sum of the four outcome buckets and the UI can say so honestly.
  unknowns        integer  NOT NULL DEFAULT 0,
  -- A few game ids that played this move, for the "example games" drill-down.
  -- Capped by the builder; deterministic (first encountered in id order).
  sample_game_ids text[]   NOT NULL DEFAULT '{}',
  PRIMARY KEY (position_key, move)
);

-- The explorer's only read pattern: every move from one position, most played
-- first. Covering the ordering here keeps the lookup a single index scan.
CREATE INDEX IF NOT EXISTS xiangqi_opening_moves_position_idx
  ON xiangqi_opening_moves (position_key, games DESC);

-- Provenance for the derived table as a whole: what the current contents were
-- built from, so the explorer can state its corpus size and freshness instead
-- of implying more data than it has. Single row, id = 'current'.
CREATE TABLE IF NOT EXISTS xiangqi_opening_build (
  id             text        PRIMARY KEY,
  game_count     integer     NOT NULL,
  position_count integer     NOT NULL,
  max_ply        smallint    NOT NULL,
  source_slugs   text[]      NOT NULL DEFAULT '{}',
  built_at       timestamptz NOT NULL DEFAULT now()
);
