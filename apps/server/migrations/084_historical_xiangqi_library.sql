-- Historical standard-xiangqi archive. This is intentionally separate from the
-- live Mistboard games/events store: imported games need provenance, dedupe,
-- and bulk search, not reconnect/watch/rating semantics.

CREATE TABLE IF NOT EXISTS historical_xiangqi_sources (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL CHECK (char_length(btrim(slug)) > 0),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) > 0),
  source_type TEXT NOT NULL CHECK (char_length(btrim(source_type)) > 0),
  source_url TEXT,
  license TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS historical_xiangqi_import_batches (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES historical_xiangqi_sources(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'canceled')),
  input_uri TEXT,
  input_sha256 TEXT,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (status = 'running' AND finished_at IS NULL)
    OR (status <> 'running' AND finished_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS historical_xiangqi_import_batches_source_idx
  ON historical_xiangqi_import_batches (source_id, created_at DESC);

CREATE TABLE IF NOT EXISTS historical_xiangqi_players (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL CHECK (char_length(btrim(display_name)) > 0),
  normalized_name TEXT NOT NULL CHECK (char_length(btrim(normalized_name)) > 0),
  country TEXT,
  external_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (normalized_name)
);

CREATE TABLE IF NOT EXISTS historical_xiangqi_games (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES historical_xiangqi_sources(id) ON DELETE RESTRICT,
  import_batch_id TEXT REFERENCES historical_xiangqi_import_batches(id) ON DELETE SET NULL,
  source_game_id TEXT,
  source_url TEXT,
  content_sha256 TEXT NOT NULL,
  event_name TEXT,
  site TEXT,
  round TEXT,
  board TEXT,
  played_on DATE,
  red_player_id TEXT REFERENCES historical_xiangqi_players(id) ON DELETE SET NULL,
  black_player_id TEXT REFERENCES historical_xiangqi_players(id) ON DELETE SET NULL,
  red_name_raw TEXT,
  black_name_raw TEXT,
  result TEXT NOT NULL CHECK (result IN ('1-0', '0-1', '1/2-1/2', '*')),
  termination TEXT,
  ply_count INTEGER NOT NULL CHECK (ply_count >= 0),
  move_format TEXT NOT NULL CHECK (char_length(btrim(move_format)) > 0),
  moves JSONB NOT NULL,
  tags JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality_flags TEXT[] NOT NULL DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('private', 'unlisted', 'public')),
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_sha256)
);

CREATE INDEX IF NOT EXISTS historical_xiangqi_games_played_on_idx
  ON historical_xiangqi_games (played_on DESC, id DESC);
CREATE INDEX IF NOT EXISTS historical_xiangqi_games_event_idx
  ON historical_xiangqi_games (event_name);
CREATE INDEX IF NOT EXISTS historical_xiangqi_games_red_player_idx
  ON historical_xiangqi_games (red_player_id, played_on DESC);
CREATE INDEX IF NOT EXISTS historical_xiangqi_games_black_player_idx
  ON historical_xiangqi_games (black_player_id, played_on DESC);
CREATE INDEX IF NOT EXISTS historical_xiangqi_games_source_idx
  ON historical_xiangqi_games (source_id, played_on DESC);
CREATE INDEX IF NOT EXISTS historical_xiangqi_games_source_game_idx
  ON historical_xiangqi_games (source_id, source_game_id)
  WHERE source_game_id IS NOT NULL;
