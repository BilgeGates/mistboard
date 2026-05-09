-- 008_identity_foundation.sql
-- Durable identity foundation for future email accounts, game attribution, and
-- artifact ownership. Live move authority remains room-scoped seat tokens.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_verified_at TIMESTAMPTZ,
  handle TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  profile_visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (profile_visibility IN ('private', 'unlisted', 'public')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_profile_visibility_idx ON users (profile_visibility);

CREATE TABLE IF NOT EXISTS account_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS account_sessions_user_id_idx ON account_sessions (user_id);
CREATE INDEX IF NOT EXISTS account_sessions_expires_at_idx ON account_sessions (expires_at);

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'link',
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE games
  DROP CONSTRAINT IF EXISTS games_visibility_check,
  ADD CONSTRAINT games_visibility_check
    CHECK (visibility IN ('private', 'link', 'unlisted', 'public'));

CREATE INDEX IF NOT EXISTS games_visibility_idx ON games (visibility, ended_at DESC);

ALTER TABLE engines
  ADD COLUMN IF NOT EXISTS owner_user_id TEXT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS engines_owner_user_id_idx ON engines (owner_user_id);

CREATE TABLE IF NOT EXISTS game_participants (
  game_id TEXT NOT NULL REFERENCES games(room_id) ON DELETE CASCADE,
  color TEXT NOT NULL CHECK (color IN ('white', 'black')),
  subject_type TEXT NOT NULL
    CHECK (subject_type IN ('guest', 'user', 'engine-version', 'manual', 'imported')),
  subject_id TEXT,
  display_name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('private', 'link', 'unlisted', 'public')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, color)
);

CREATE INDEX IF NOT EXISTS game_participants_subject_idx
  ON game_participants (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS game_participants_visibility_idx
  ON game_participants (visibility);

CREATE TABLE IF NOT EXISTS artifact_owners (
  artifact_type TEXT NOT NULL
    CHECK (artifact_type IN ('game', 'engine', 'engine-version', 'annotation', 'corpus', 'report')),
  artifact_id TEXT NOT NULL,
  owner_type TEXT NOT NULL
    CHECK (owner_type IN ('user', 'system')),
  owner_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner'
    CHECK (role IN ('owner', 'maintainer', 'author', 'reviewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_type, artifact_id, owner_type, owner_id, role)
);

CREATE INDEX IF NOT EXISTS artifact_owners_owner_idx
  ON artifact_owners (owner_type, owner_id);

INSERT INTO game_participants (game_id, color, subject_type, subject_id, display_name, visibility)
SELECT
  games.room_id,
  'white',
  CASE
    WHEN eve_games.white_engine_id IS NOT NULL THEN 'engine-version'
    WHEN games.white_client = 'random-engine'
      OR games.white_client = 'engine:white'
      OR games.white_client = 'engine:black'
      OR games.white_client LIKE 'engine:%'
      OR games.white_client LIKE 'builtin-%'
      OR games.white_client LIKE 'python-%' THEN 'engine-version'
    WHEN games.mode = 'imported' THEN 'imported'
    WHEN games.mode = 'manual' THEN 'manual'
    ELSE 'guest'
  END,
  CASE
    WHEN eve_games.white_engine_id IS NOT NULL THEN eve_games.white_engine_id
    WHEN games.white_client = 'random-engine' THEN 'builtin-random-legal'
    WHEN games.white_client = 'engine:white'
      OR games.white_client = 'engine:black'
      OR games.white_client LIKE 'engine:%'
      OR games.white_client LIKE 'builtin-%'
      OR games.white_client LIKE 'python-%' THEN games.white_client
    ELSE NULL
  END,
  COALESCE(games.white_name, eve_games.white_engine_id, CASE WHEN games.white_client = 'random-engine' THEN 'builtin-random-legal' ELSE games.white_client END, 'White'),
  games.visibility
FROM games
LEFT JOIN eve_games ON eve_games.game_id = games.room_id
WHERE games.status = 'completed'
ON CONFLICT (game_id, color) DO NOTHING;

INSERT INTO game_participants (game_id, color, subject_type, subject_id, display_name, visibility)
SELECT
  games.room_id,
  'black',
  CASE
    WHEN eve_games.black_engine_id IS NOT NULL THEN 'engine-version'
    WHEN games.black_client = 'random-engine'
      OR games.black_client = 'engine:white'
      OR games.black_client = 'engine:black'
      OR games.black_client LIKE 'engine:%'
      OR games.black_client LIKE 'builtin-%'
      OR games.black_client LIKE 'python-%' THEN 'engine-version'
    WHEN games.mode = 'imported' THEN 'imported'
    WHEN games.mode = 'manual' THEN 'manual'
    ELSE 'guest'
  END,
  CASE
    WHEN eve_games.black_engine_id IS NOT NULL THEN eve_games.black_engine_id
    WHEN games.black_client = 'random-engine' THEN 'builtin-random-legal'
    WHEN games.black_client = 'engine:white'
      OR games.black_client = 'engine:black'
      OR games.black_client LIKE 'engine:%'
      OR games.black_client LIKE 'builtin-%'
      OR games.black_client LIKE 'python-%' THEN games.black_client
    ELSE NULL
  END,
  COALESCE(games.black_name, eve_games.black_engine_id, CASE WHEN games.black_client = 'random-engine' THEN 'builtin-random-legal' ELSE games.black_client END, 'Black'),
  games.visibility
FROM games
LEFT JOIN eve_games ON eve_games.game_id = games.room_id
WHERE games.status = 'completed'
ON CONFLICT (game_id, color) DO NOTHING;
