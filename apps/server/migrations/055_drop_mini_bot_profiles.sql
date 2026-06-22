-- 055_drop_mini_bot_profiles.sql
-- One public bot profile per built-in Drop Mini Xiangqi level. The bot id is
-- the stable public identity; active_engine_id is the executable in-process
-- level implementation.

INSERT INTO bot_profiles
  (id, display_name, bio, active_engine_id, default_game_spec_id,
   supported_game_spec_ids, play_initial_ms, play_increment_ms, visibility)
VALUES
  (
    'misty-drop-mini-level-1',
    'Misty Drop Mini level 1',
    'Mistboard''s entry-level Drop Mini Xiangqi bot.',
    'misty-drop-mini-level-1',
    'drop-mini-xiangqi',
    ARRAY['drop-mini-xiangqi'],
    180000,
    2000,
    'public'
  ),
  (
    'misty-drop-mini-level-2',
    'Misty Drop Mini level 2',
    'Mistboard''s standard Drop Mini Xiangqi bot.',
    'misty-drop-mini-level-2',
    'drop-mini-xiangqi',
    ARRAY['drop-mini-xiangqi'],
    180000,
    2000,
    'public'
  ),
  (
    'misty-drop-mini-level-3',
    'Misty Drop Mini level 3',
    'Mistboard''s strongest in-process Drop Mini Xiangqi bot.',
    'misty-drop-mini-level-3',
    'drop-mini-xiangqi',
    ARRAY['drop-mini-xiangqi'],
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
