-- 019_lab_self_play.sql
-- Lab self-play corpus storage. One row per game; payload is a complete
-- per-game record (events, per-position rows, manifest fields) as JSONB so
-- corpus schema can evolve without DDL churn.
--
-- corpus_id groups games into a named corpus (e.g. "c-prod-railway-v0").
-- corpus_idx is the per-corpus game ordinal; resume picks up at
-- SELECT MAX(corpus_idx) + 1 WHERE corpus_id = $1.

CREATE TABLE IF NOT EXISTS lab_games (
  game_id     TEXT        PRIMARY KEY,
  corpus_id   TEXT        NOT NULL,
  corpus_idx  INTEGER     NOT NULL,
  data        JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (corpus_id, corpus_idx)
);

CREATE INDEX IF NOT EXISTS lab_games_corpus_idx
  ON lab_games (corpus_id, corpus_idx);
