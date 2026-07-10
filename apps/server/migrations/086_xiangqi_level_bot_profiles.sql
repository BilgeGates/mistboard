-- 086_xiangqi_level_bot_profiles.sql
-- Expand the standard-Xiangqi Pikafish ladder from three tiers to eight
-- calibrated levels (lichess/PlayStrategy convention). Mirrors
-- FIRST_PARTY_BOT_PROFILES (apps/server/src/first-party-bots.ts) and
-- XIANGQI_PLAYABLE_ENGINES (apps/server/src/xiangqi-pikafish-engine.ts).
--
-- The three retired tiers are absorbed into the matching levels, keeping their
-- bot ids (migration-056 convention: existing /bots URLs and historical
-- game_participants attribution stay stable):
--   pikafish-xiangqi-amateur   (skill 3)  -> Pikafish - Level 2
--   pikafish-xiangqi           (skill 12) -> Pikafish - Level 5 (the default)
--   pikafish-xiangqi-strongest (skill 20) -> Pikafish - Level 8
-- Historical game_participants/games display names are deliberately left as
-- played (same policy as the Misty engine-version bumps). The retired engine
-- ids stay resolvable in code (legacy tier table + attributionEngineIds), so
-- old replays and postgame pages are unaffected.

INSERT INTO bot_profiles
  (id, display_name, bio, active_engine_id, default_game_spec_id,
   supported_game_spec_ids, play_initial_ms, play_increment_ms, visibility)
VALUES
  (
    'pikafish-xiangqi-level-1',
    'Pikafish - Level 1',
    'Level 1 of Mistboard''s eight-level first-party Xiangqi ladder, backed by mainline Pikafish.',
    'pikafish-xiangqi-level-1',
    'xiangqi',
    ARRAY['xiangqi'],
    180000,
    2000,
    'public'
  ),
  (
    'pikafish-xiangqi-amateur',
    'Pikafish - Level 2',
    'Level 2 of Mistboard''s eight-level first-party Xiangqi ladder, backed by mainline Pikafish.',
    'pikafish-xiangqi-level-2',
    'xiangqi',
    ARRAY['xiangqi'],
    180000,
    2000,
    'public'
  ),
  (
    'pikafish-xiangqi-level-3',
    'Pikafish - Level 3',
    'Level 3 of Mistboard''s eight-level first-party Xiangqi ladder, backed by mainline Pikafish.',
    'pikafish-xiangqi-level-3',
    'xiangqi',
    ARRAY['xiangqi'],
    180000,
    2000,
    'public'
  ),
  (
    'pikafish-xiangqi-level-4',
    'Pikafish - Level 4',
    'Level 4 of Mistboard''s eight-level first-party Xiangqi ladder, backed by mainline Pikafish.',
    'pikafish-xiangqi-level-4',
    'xiangqi',
    ARRAY['xiangqi'],
    180000,
    2000,
    'public'
  ),
  (
    'pikafish-xiangqi',
    'Pikafish - Level 5',
    'Level 5 of Mistboard''s eight-level first-party Xiangqi ladder, backed by mainline Pikafish. The standard opponent.',
    'pikafish-xiangqi-level-5',
    'xiangqi',
    ARRAY['xiangqi'],
    180000,
    2000,
    'public'
  ),
  (
    'pikafish-xiangqi-level-6',
    'Pikafish - Level 6',
    'Level 6 of Mistboard''s eight-level first-party Xiangqi ladder, backed by mainline Pikafish.',
    'pikafish-xiangqi-level-6',
    'xiangqi',
    ARRAY['xiangqi'],
    180000,
    2000,
    'public'
  ),
  (
    'pikafish-xiangqi-level-7',
    'Pikafish - Level 7',
    'Level 7 of Mistboard''s eight-level first-party Xiangqi ladder, backed by mainline Pikafish.',
    'pikafish-xiangqi-level-7',
    'xiangqi',
    ARRAY['xiangqi'],
    180000,
    2000,
    'public'
  ),
  (
    'pikafish-xiangqi-strongest',
    'Pikafish - Level 8',
    'Level 8, the top of Mistboard''s eight-level first-party Xiangqi ladder: full-strength mainline Pikafish within its move-time budget.',
    'pikafish-xiangqi-level-8',
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
