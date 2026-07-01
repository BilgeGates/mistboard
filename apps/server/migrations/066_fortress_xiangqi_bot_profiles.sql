-- 066_fortress_xiangqi_bot_profiles.sql
-- First-party Fortress Xiangqi bots, served by Fairy-Stockfish (matching the
-- Drop Mini Xiangqi / Crossroads naming convention). The public bot id is
-- separate from the executable engine id (active_engine_id). Fortress is new, so
-- there is no historical PvE attribution to re-key and no old profiles to retire.

INSERT INTO bot_profiles
  (id, display_name, bio, active_engine_id, default_game_spec_id,
   supported_game_spec_ids, play_initial_ms, play_increment_ms, visibility)
VALUES
  (
    'fairy-stockfish-fortress-xiangqi-amateur',
    'Fairy Stockfish Fortress Xiangqi - Amateur',
    'A skill-capped first-party Fortress Xiangqi bot backed by Fairy-Stockfish.',
    'fairy-stockfish-fortress-xiangqi-amateur',
    'fortress-xiangqi',
    ARRAY['fortress-xiangqi'],
    180000,
    2000,
    'public'
  ),
  (
    'fairy-stockfish-fortress-xiangqi',
    'Fairy Stockfish Fortress Xiangqi - Strong',
    'Mistboard''s standard first-party Fortress Xiangqi bot backed by Fairy-Stockfish.',
    'fairy-stockfish-fortress-xiangqi-strong',
    'fortress-xiangqi',
    ARRAY['fortress-xiangqi'],
    180000,
    2000,
    'public'
  ),
  (
    'fairy-stockfish-fortress-xiangqi-strongest',
    'Fairy Stockfish Fortress Xiangqi - Strongest',
    'Mistboard''s strongest first-party Fortress Xiangqi bot backed by Fairy-Stockfish.',
    'fairy-stockfish-fortress-xiangqi-very-strong',
    'fortress-xiangqi',
    ARRAY['fortress-xiangqi'],
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
