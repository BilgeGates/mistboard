-- 056_engine_level_bot_profiles.sql
-- Public bot profiles for the three player-facing levels of the UCI-backed
-- Jieqi and Crossroads engines. Keep the original ids as the Strong profiles so
-- existing URLs and historical game attribution remain stable.

INSERT INTO bot_profiles
  (id, display_name, bio, active_engine_id, default_game_spec_id,
   supported_game_spec_ids, play_initial_ms, play_increment_ms, visibility)
VALUES
  (
    'pika-jieqi-amateur',
    'PikaJieQi - Amateur',
    'A depth-capped first-party Jieqi bot served through Mistboard''s UCI engine adapter.',
    'pikafish-jieqi-amateur',
    'jieqi',
    ARRAY['jieqi'],
    180000,
    2000,
    'public'
  ),
  (
    'pika-jieqi',
    'PikaJieQi - Strong',
    'Mistboard''s standard first-party Jieqi bot served through the PikaJieQi UCI engine.',
    'pikafish-jieqi-strong',
    'jieqi',
    ARRAY['jieqi'],
    180000,
    2000,
    'public'
  ),
  (
    'pika-jieqi-strongest',
    'PikaJieQi - Strongest',
    'Mistboard''s strongest first-party Jieqi bot served through the PikaJieQi UCI engine.',
    'pikafish-jieqi-strongest',
    'jieqi',
    ARRAY['jieqi'],
    180000,
    2000,
    'public'
  ),
  (
    'fairy-stockfish-crossroads-amateur',
    'Fairy Stockfish Crossroads - Amateur',
    'A skill-capped first-party Crossroads Chess bot backed by Fairy-Stockfish.',
    'fairy-stockfish-crossroads-amateur',
    'crossroads-chess',
    ARRAY['crossroads-chess'],
    180000,
    2000,
    'public'
  ),
  (
    'fairy-stockfish-crossroads',
    'Fairy Stockfish Crossroads - Strong',
    'Mistboard''s standard first-party Crossroads Chess bot backed by Fairy-Stockfish.',
    'fairy-stockfish-crossroads-strong',
    'crossroads-chess',
    ARRAY['crossroads-chess'],
    180000,
    2000,
    'public'
  ),
  (
    'fairy-stockfish-crossroads-strongest',
    'Fairy Stockfish Crossroads - Strongest',
    'Mistboard''s strongest first-party Crossroads Chess bot backed by Fairy-Stockfish.',
    'fairy-stockfish-crossroads-very-strong',
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
