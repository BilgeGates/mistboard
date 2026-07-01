-- 068_shorten_fairy_stockfish_bot_names.sql
-- Shorten Fairy-Stockfish bot display names from
-- "Fairy Stockfish <Variant> - <Level>" to "Fairy Stockfish - <Level>". The variant
-- segment is redundant (the board/variant is always shown alongside the name) and
-- overflowed the compact homepage showcase seat. IDs and engine ids are unchanged;
-- this rewrites display text only. Applied everywhere the name is persisted:
--   * bot_profiles.display_name        (canonical bot label: picker, /engines)
--   * game_participants.display_name   (per-game participant labels)
--   * games.white_name / black_name    (baked labels the showcase feed reads)
-- The `LIKE 'Fairy Stockfish % - %'` guard matches only names that still carry a
-- variant segment, so already-short names, PikaJieQi, and Misty bots are untouched
-- and the migration is safe to re-run. Names collide across variants by design
-- (e.g. four "Fairy Stockfish - Strongest"); the variant is always in context and
-- the bot/engine id remains the unique key (no unique index on display_name).

UPDATE bot_profiles
  SET display_name = regexp_replace(display_name, '^Fairy Stockfish .+ - ', 'Fairy Stockfish - '),
      updated_at = now()
  WHERE display_name LIKE 'Fairy Stockfish % - %';

UPDATE game_participants
  SET display_name = regexp_replace(display_name, '^Fairy Stockfish .+ - ', 'Fairy Stockfish - ')
  WHERE display_name LIKE 'Fairy Stockfish % - %';

UPDATE games
  SET white_name = regexp_replace(white_name, '^Fairy Stockfish .+ - ', 'Fairy Stockfish - ')
  WHERE white_name LIKE 'Fairy Stockfish % - %';

UPDATE games
  SET black_name = regexp_replace(black_name, '^Fairy Stockfish .+ - ', 'Fairy Stockfish - ')
  WHERE black_name LIKE 'Fairy Stockfish % - %';
