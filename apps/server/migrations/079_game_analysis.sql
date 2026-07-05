-- 079_game_analysis.sql
-- Cache of whole-game computer analysis (the request-analysis feature). A
-- finished game is immutable, so its eval series is a pure function of
-- (room, engine, depth): compute it once, ever, and serve every later request
-- from this table instead of re-running the engine.
--
-- The key is (room_id, engine_id, depth): a new engine version or a deeper pass
-- is a different key and recomputes; the stale row is harmless and just kept.
-- `plies` is the JSON PlyEval[] the API returns ({ply, cp (Red POV), mate, best}).
-- Variant-agnostic on purpose (engine_id distinguishes Xiangqi/Pikafish from a
-- future Fortress/FSF pass), so the same table serves the next variant wired up.
CREATE TABLE IF NOT EXISTS game_analysis (
  room_id    TEXT NOT NULL,
  engine_id  TEXT NOT NULL,
  depth      INTEGER NOT NULL,
  plies      JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, engine_id, depth)
);
