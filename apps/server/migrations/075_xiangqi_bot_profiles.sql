-- 075_xiangqi_bot_profiles.sql
-- First-party standard-Xiangqi bots, served by mainline Pikafish (matching the
-- Fortress Xiangqi / Jieqi naming convention). The public bot id is separate from
-- the executable engine id (active_engine_id). Xiangqi PvE is new, so there is no
-- historical attribution to re-key and no old profiles to retire.

INSERT INTO bot_profiles
  (id, display_name, bio, active_engine_id, default_game_spec_id,
   supported_game_spec_ids, play_initial_ms, play_increment_ms, visibility)
VALUES
  (
    'pikafish-xiangqi-amateur',
    'Pikafish Xiangqi - Amateur',
    'A skill-capped first-party Xiangqi bot backed by mainline Pikafish.',
    'pikafish-xiangqi-amateur',
    'xiangqi',
    ARRAY['xiangqi'],
    180000,
    2000,
    'public'
  ),
  (
    'pikafish-xiangqi',
    'Pikafish Xiangqi - Strong',
    'Mistboard''s standard first-party Xiangqi bot backed by mainline Pikafish.',
    'pikafish-xiangqi-strong',
    'xiangqi',
    ARRAY['xiangqi'],
    180000,
    2000,
    'public'
  ),
  (
    'pikafish-xiangqi-strongest',
    'Pikafish Xiangqi - Strongest',
    'Mistboard''s strongest first-party Xiangqi bot backed by mainline Pikafish.',
    'pikafish-xiangqi-strongest',
    'xiangqi',
    ARRAY['xiangqi'],
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
