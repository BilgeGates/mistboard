-- 051_bot_profiles.sql
-- Stable public bot identities layered over internal engine versions.
-- First-party only for now: owner_type='system'. Third-party bots can later
-- reuse the same profile/rating/history shape with owner_type='user'.

CREATE TABLE IF NOT EXISTS bot_profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  owner_type TEXT NOT NULL DEFAULT 'system'
    CHECK (owner_type IN ('system', 'user')),
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  active_engine_id TEXT NOT NULL,
  default_game_spec_id TEXT NOT NULL,
  supported_game_spec_ids TEXT[] NOT NULL DEFAULT '{}',
  play_initial_ms INTEGER NOT NULL DEFAULT 180000,
  play_increment_ms INTEGER NOT NULL DEFAULT 2000,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('private', 'unlisted', 'public')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (owner_type = 'system' AND owner_user_id IS NULL)
    OR (owner_type = 'user' AND owner_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS bot_profiles_visibility_idx
  ON bot_profiles (visibility, display_name);

ALTER TABLE game_participants
  DROP CONSTRAINT IF EXISTS game_participants_subject_type_check,
  ADD CONSTRAINT game_participants_subject_type_check
    CHECK (subject_type IN ('guest', 'user', 'bot', 'engine-version', 'manual', 'imported'));

INSERT INTO bot_profiles
  (id, display_name, bio, active_engine_id, default_game_spec_id,
   supported_game_spec_ids, play_initial_ms, play_increment_ms, visibility)
VALUES
  (
    'misty-dark-chess',
    'Misty',
    'Mistboard''s first-party fog-of-war chess engine.',
    'python-v2-v1.4',
    'dark-chess',
    ARRAY['dark-chess', 'dark-draft960'],
    180000,
    2000,
    'public'
  ),
  (
    'misty-dmx',
    'Misty DMX',
    'Mistboard''s first-party Dark Mini Xiangqi engine.',
    'python-dmx-v1.0',
    'dark-mini-xiangqi',
    ARRAY['dark-mini-xiangqi'],
    180000,
    2000,
    'public'
  ),
  (
    'pika-jieqi',
    'PikaJieQi',
    'A first-party Jieqi bot served through Mistboard''s UCI engine adapter.',
    'pikafish-jieqi-strong',
    'jieqi',
    ARRAY['jieqi'],
    180000,
    2000,
    'public'
  ),
  (
    'misty-banqi',
    'MistyBanqi',
    'Mistboard''s first-party Banqi engine.',
    'misty-banqi',
    'banqi',
    ARRAY['banqi'],
    180000,
    2000,
    'public'
  ),
  (
    'fairy-stockfish-crossroads',
    'Fairy Stockfish Crossroads',
    'A first-party Crossroads Chess bot backed by Fairy-Stockfish.',
    'fairy-stockfish-crossroads-strong',
    'crossroads-chess',
    ARRAY['crossroads-chess'],
    180000,
    2000,
    'public'
  )
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  bio = EXCLUDED.bio,
  active_engine_id = EXCLUDED.active_engine_id,
  default_game_spec_id = EXCLUDED.default_game_spec_id,
  supported_game_spec_ids = EXCLUDED.supported_game_spec_ids,
  play_initial_ms = EXCLUDED.play_initial_ms,
  play_increment_ms = EXCLUDED.play_increment_ms,
  visibility = EXCLUDED.visibility,
  updated_at = now();
