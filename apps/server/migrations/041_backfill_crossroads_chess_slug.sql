-- 041_backfill_crossroads_chess_slug.sql
-- Canonicalize the pre-launch Dual Chess slugs after the product rename to
-- Crossroads Chess.
--
-- The deployed code accepts both old and new IDs at read boundaries, so this is
-- read-invisible and safe to apply while compatibility aliases remain. Scope:
--   1. games.variant, the aggregate used by profiles, watch, postgame routing,
--      and leaderboard attribution.
--   2. events.payload.gameSpecId / events.payload.variant, the append-only room
--      event JSON used for hydration and replay.
--   3. engine_game_tasks.config.gameSpecId / config.variant, for any queued or
--      historical engine task config that still carries the old selector.
--
-- Each predicate matches only rows carrying the legacy spelling, so re-runs are
-- no-ops.

UPDATE games
SET variant = 'crossroads-chess'
WHERE variant = 'dual-chess';

UPDATE games
SET variant = 'dark-crossroads-chess'
WHERE variant = 'dark-dual-chess';

UPDATE events
SET payload = jsonb_set(payload, '{gameSpecId}', '"crossroads-chess"')
WHERE payload->>'gameSpecId' = 'dual-chess';

UPDATE events
SET payload = jsonb_set(payload, '{gameSpecId}', '"dark-crossroads-chess"')
WHERE payload->>'gameSpecId' = 'dark-dual-chess';

UPDATE events
SET payload = jsonb_set(payload, '{variant}', '"crossroads-chess"')
WHERE payload->>'variant' = 'dual-chess';

UPDATE events
SET payload = jsonb_set(payload, '{variant}', '"dark-crossroads-chess"')
WHERE payload->>'variant' = 'dark-dual-chess';

UPDATE engine_game_tasks
SET config = jsonb_set(config, '{gameSpecId}', '"crossroads-chess"')
WHERE config->>'gameSpecId' = 'dual-chess';

UPDATE engine_game_tasks
SET config = jsonb_set(config, '{gameSpecId}', '"dark-crossroads-chess"')
WHERE config->>'gameSpecId' = 'dark-dual-chess';

UPDATE engine_game_tasks
SET config = jsonb_set(config, '{variant}', '"crossroads-chess"')
WHERE config->>'variant' = 'dual-chess';

UPDATE engine_game_tasks
SET config = jsonb_set(config, '{variant}', '"dark-crossroads-chess"')
WHERE config->>'variant' = 'dark-dual-chess';
