-- 058_misty_dark_chess_only_bot.sql
-- Misty should expose Dark Chess only as a public bot. Draft960 remains a
-- setup option, not a bot-supported variant.

UPDATE bot_profiles
SET
  supported_game_spec_ids = ARRAY['dark-chess'],
  updated_at = now()
WHERE id = 'misty-dark-chess';
