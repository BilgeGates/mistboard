-- 063_drop_mini_fsf_bot_profiles.sql
-- Rename the Drop Mini Xiangqi bots to the Fairy-Stockfish naming convention
-- (matching Mini Xiangqi / Crossroads in 056), now that Drop Mini PvE is served by
-- Fairy-Stockfish (commit 8d2c9dd1) rather than the retired in-process "Misty"
-- heuristic. Public bot id is separate from the executable engine id.
--
-- Historical PvE attribution lives in game_participants.subject_id, a free-text
-- engine-version label (no FK, per 047), so it is re-keyed old engine id -> new so
-- past alpha games show under the renamed bots. The old Misty-branded profiles are
-- retired (set private), not deleted, to avoid cascading bot_rating_snapshots.

INSERT INTO bot_profiles
  (id, display_name, bio, active_engine_id, default_game_spec_id,
   supported_game_spec_ids, play_initial_ms, play_increment_ms, visibility)
VALUES
  (
    'fairy-stockfish-drop-mini-xiangqi-amateur',
    'Fairy Stockfish Drop Mini Xiangqi - Amateur',
    'A skill-capped first-party Drop Mini Xiangqi bot backed by Fairy-Stockfish.',
    'fairy-stockfish-drop-mini-xiangqi-amateur',
    'drop-mini-xiangqi',
    ARRAY['drop-mini-xiangqi'],
    180000,
    2000,
    'public'
  ),
  (
    'fairy-stockfish-drop-mini-xiangqi',
    'Fairy Stockfish Drop Mini Xiangqi - Strong',
    'Mistboard''s standard first-party Drop Mini Xiangqi bot backed by Fairy-Stockfish.',
    'fairy-stockfish-drop-mini-xiangqi-strong',
    'drop-mini-xiangqi',
    ARRAY['drop-mini-xiangqi'],
    180000,
    2000,
    'public'
  ),
  (
    'fairy-stockfish-drop-mini-xiangqi-strongest',
    'Fairy Stockfish Drop Mini Xiangqi - Strongest',
    'Mistboard''s strongest first-party Drop Mini Xiangqi bot backed by Fairy-Stockfish.',
    'fairy-stockfish-drop-mini-xiangqi-very-strong',
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

-- Re-key historical PvE attribution from the retired heuristic engine ids to the
-- new Fairy-Stockfish engine ids (strength-preserving: level-1->amateur,
-- level-2->strong, level-3->very-strong).
UPDATE game_participants
  SET subject_id = 'fairy-stockfish-drop-mini-xiangqi-amateur'
  WHERE subject_type = 'engine-version' AND subject_id = 'misty-drop-mini-level-1';
UPDATE game_participants
  SET subject_id = 'fairy-stockfish-drop-mini-xiangqi-strong'
  WHERE subject_type = 'engine-version' AND subject_id = 'misty-drop-mini-level-2';
UPDATE game_participants
  SET subject_id = 'fairy-stockfish-drop-mini-xiangqi-very-strong'
  WHERE subject_type = 'engine-version' AND subject_id = 'misty-drop-mini-level-3';

-- Retire the old Misty-branded profiles from public listings.
UPDATE bot_profiles
  SET visibility = 'private', updated_at = now()
  WHERE id IN (
    'misty-drop-mini-level-1',
    'misty-drop-mini-level-2',
    'misty-drop-mini-level-3'
  );
