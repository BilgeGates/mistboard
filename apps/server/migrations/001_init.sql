-- 001_init.sql
-- Initial schema: events (append-only log) + games (aggregate, written on game-end).

CREATE TABLE IF NOT EXISTS events (
  room_id    TEXT        NOT NULL,
  seq        INTEGER     NOT NULL,
  type       TEXT        NOT NULL,
  payload    JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, seq)
);

CREATE INDEX IF NOT EXISTS events_created_at_idx ON events (created_at);

CREATE TABLE IF NOT EXISTS games (
  room_id        TEXT        PRIMARY KEY,
  variant        TEXT        NOT NULL,
  result         TEXT        NOT NULL,
  termination    TEXT        NOT NULL,
  ply_count      INTEGER     NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL,
  ended_at       TIMESTAMPTZ NOT NULL,
  white_client   TEXT,
  black_client   TEXT
);

CREATE INDEX IF NOT EXISTS games_ended_at_idx ON games (ended_at DESC);
CREATE INDEX IF NOT EXISTS games_variant_idx  ON games (variant);
