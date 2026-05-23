-- 023_rewrite_fog_of_war_variant_json.sql
-- Final step of the fog-of-war -> dark-chess rename: rewrite the legacy slug
-- everywhere it still persists inside JSON, so the read-time normalizeVariantId
-- alias can be deleted and the codebase carries a single canonical slug.
--
-- Migration 022 cleaned the games.variant column. This cleans the two remaining
-- JSON homes:
--   1. events.payload — room-created events store the slug as a top-level
--      "variant" key. This is the replay/reconnect source of truth, so old games
--      would otherwise replay 'fog-of-war' forever and need the alias.
--   2. engine_game_tasks.config — queued/historical engine tasks carry the slug
--      as config.variant.
--
-- jsonb_set on a known top-level key; both predicates match only rows that carry
-- the legacy slug, so re-runs are no-ops. After this, no persisted 'fog-of-war'
-- remains and variantForId can fail loud on any unknown slug.

UPDATE events
SET payload = jsonb_set(payload, '{variant}', '"dark-chess"')
WHERE payload->>'variant' = 'fog-of-war';

UPDATE engine_game_tasks
SET config = jsonb_set(config, '{variant}', '"dark-chess"')
WHERE config->>'variant' = 'fog-of-war';
