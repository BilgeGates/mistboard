-- 111_consolidated_bot_identities.sql
-- Bot-identity consolidation (2026-07-21): three public families replace the
-- per-variant roster.
--   misty                     — the house player: fog chess, fog xiangqi,
--                               banqi, jungle, flip jungle.
--   pikafish                  — the boss: xiangqi + jieqi, one level.
--   fairy-stockfish-level-1..8 — the ladder: xiangqi + fortress xiangqi.
-- Pre-consolidation rows go unlisted (their ids keep resolving in code via
-- legacyBotIds); persisted game attribution and published rating snapshots are
-- remapped/copied onto the merged ids so profile pages carry full history.

-- 1) Merged public profiles.
INSERT INTO bot_profiles
  (id, display_name, bio, active_engine_id, default_game_spec_id,
   supported_game_spec_ids, play_initial_ms, play_increment_ms, visibility)
VALUES
  (
    'misty',
    'Misty',
    'Mistboard''s house player: one identity for every hidden-information and house-built game, from fog chess and fog xiangqi to banqi, jungle, and flip jungle.',
    'python-v2-v1.5',
    'dark-chess',
    ARRAY['dark-chess', 'dark-draft960', 'dark-xiangqi', 'banqi', 'jungle', 'jungle-flip'],
    180000,
    2000,
    'public'
  ),
  (
    'pikafish',
    'Pikafish',
    'Mistboard''s elite challenge, backed by mainline Pikafish: full strength in standard xiangqi, and the strongest available jieqi profile.',
    'pikafish-xiangqi-level-8',
    'xiangqi',
    ARRAY['xiangqi', 'jieqi'],
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

INSERT INTO bot_profiles
  (id, display_name, bio, active_engine_id, default_game_spec_id,
   supported_game_spec_ids, play_initial_ms, play_increment_ms, visibility)
SELECT
  'fairy-stockfish-level-' || level,
  'Fairy-Stockfish Level ' || level,
  'Level ' || level || ' of Mistboard''s eight-level ladder, backed by Fairy-Stockfish. Plays standard and fortress xiangqi.',
  'fairy-stockfish-xiangqi-level-' || level,
  'xiangqi',
  ARRAY['xiangqi', 'fortress-xiangqi'],
  180000,
  2000,
  'public'
FROM generate_series(1, 8) AS levels(level)
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

-- 2) Retire the pre-consolidation rows from the public directory. Ids keep
-- resolving in code (legacyBotIds) and their history is remapped below.
UPDATE bot_profiles
SET visibility = 'unlisted', updated_at = now()
WHERE id <> 'misty'
  AND id <> 'pikafish'
  AND id NOT LIKE 'fairy-stockfish-level-%'
  AND (
    id IN ('misty-dark-chess', 'misty-dmx', 'misty-banqi')
    OR active_engine_id LIKE 'pikafish-xiangqi%'
    OR active_engine_id LIKE 'pikafish-jieqi%'
    OR active_engine_id LIKE 'fairy-stockfish-xiangqi-level-%'
    OR active_engine_id LIKE 'fairy-stockfish-fortress-xiangqi-%'
    OR active_engine_id LIKE 'fairy-stockfish-crossroads-%'
    OR active_engine_id LIKE 'fairy-stockfish-drop-mini-xiangqi-%'
    OR active_engine_id LIKE 'fairy-stockfish-mini-xiangqi-%'
  );

-- 3) Remap persisted game attribution onto the merged identities.
UPDATE game_participants
SET subject_id = mapping.new_id
FROM (
  VALUES
    ('misty-dark-chess', 'misty'),
    ('misty-dmx', 'misty'),
    ('misty-banqi', 'misty'),
    ('pika-jieqi', 'pikafish'),
    ('pika-jieqi-amateur', 'pikafish'),
    ('pika-jieqi-strongest', 'pikafish'),
    ('pikafish-xiangqi-level-1', 'pikafish'),
    ('pikafish-xiangqi-amateur', 'pikafish'),
    ('pikafish-xiangqi-level-3', 'pikafish'),
    ('pikafish-xiangqi-level-4', 'pikafish'),
    ('pikafish-xiangqi', 'pikafish'),
    ('pikafish-xiangqi-level-6', 'pikafish'),
    ('pikafish-xiangqi-level-7', 'pikafish'),
    ('pikafish-xiangqi-strongest', 'pikafish'),
    ('fairy-stockfish-xiangqi-level-1', 'fairy-stockfish-level-1'),
    ('fairy-stockfish-xiangqi-level-2', 'fairy-stockfish-level-2'),
    ('fairy-stockfish-xiangqi-level-3', 'fairy-stockfish-level-3'),
    ('fairy-stockfish-xiangqi-level-4', 'fairy-stockfish-level-4'),
    ('fairy-stockfish-xiangqi-level-5', 'fairy-stockfish-level-5'),
    ('fairy-stockfish-xiangqi-level-6', 'fairy-stockfish-level-6'),
    ('fairy-stockfish-xiangqi-level-7', 'fairy-stockfish-level-7'),
    ('fairy-stockfish-xiangqi-level-8', 'fairy-stockfish-level-8'),
    ('fairy-stockfish-fortress-xiangqi-amateur', 'fairy-stockfish-level-2'),
    ('fairy-stockfish-fortress-xiangqi', 'fairy-stockfish-level-5'),
    ('fairy-stockfish-fortress-xiangqi-strongest', 'fairy-stockfish-level-8')
) AS mapping(old_id, new_id)
WHERE game_participants.subject_type = 'bot'
  AND game_participants.subject_id = mapping.old_id;

-- 4) Carry published rating snapshots onto the merged ids: copy the latest
-- published snapshot per (spec, time class) from each row whose ENGINE the
-- merged bot actually fronts (so a weaker retired tier's rating never lands on
-- the merged identity). The fortress Strong/Strongest tiers match Level 5/8
-- parameters exactly; the retired Amateur tier matches nothing and is skipped.
INSERT INTO bot_rating_snapshots
  (bot_id, game_spec_id, time_class, rating, rating_deviation, games,
   source, source_ref, published, published_at, created_at)
SELECT
  mapping.new_id,
  ranked.game_spec_id,
  ranked.time_class,
  ranked.rating,
  ranked.rating_deviation,
  ranked.games,
  ranked.source,
  ranked.source_ref,
  true,
  now(),
  now()
FROM (
  VALUES
    ('misty-dark-chess', 'misty'),
    ('misty-banqi', 'misty'),
    ('pika-jieqi', 'pikafish'),
    ('pikafish-xiangqi-strongest', 'pikafish'),
    ('fairy-stockfish-xiangqi-level-1', 'fairy-stockfish-level-1'),
    ('fairy-stockfish-xiangqi-level-2', 'fairy-stockfish-level-2'),
    ('fairy-stockfish-xiangqi-level-3', 'fairy-stockfish-level-3'),
    ('fairy-stockfish-xiangqi-level-4', 'fairy-stockfish-level-4'),
    ('fairy-stockfish-xiangqi-level-5', 'fairy-stockfish-level-5'),
    ('fairy-stockfish-xiangqi-level-6', 'fairy-stockfish-level-6'),
    ('fairy-stockfish-xiangqi-level-7', 'fairy-stockfish-level-7'),
    ('fairy-stockfish-xiangqi-level-8', 'fairy-stockfish-level-8'),
    ('fairy-stockfish-fortress-xiangqi', 'fairy-stockfish-level-5'),
    ('fairy-stockfish-fortress-xiangqi-strongest', 'fairy-stockfish-level-8')
) AS mapping(old_id, new_id)
JOIN LATERAL (
  SELECT DISTINCT ON (game_spec_id, time_class)
         game_spec_id, time_class, rating, rating_deviation, games, source, source_ref
    FROM bot_rating_snapshots
   WHERE bot_id = mapping.old_id
     AND published = true
   ORDER BY game_spec_id, time_class,
            published_at DESC NULLS LAST, created_at DESC, id DESC
) ranked ON true
-- Idempotence: skip specs the merged bot already carries a published row for.
WHERE NOT EXISTS (
  SELECT 1
    FROM bot_rating_snapshots existing
   WHERE existing.bot_id = mapping.new_id
     AND existing.game_spec_id = ranked.game_spec_id
     AND existing.time_class = ranked.time_class
     AND existing.published = true
);
