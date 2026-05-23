-- 022_rename_fog_of_war_variant.sql
-- Phase 3 of the fog-of-war -> dark-chess slug rename. Rewrites the legacy
-- variant slug on the games aggregate table to the canonical 'dark-chess'.
--
-- Safe to run while the deployed code reads both spellings: normalizeVariantId
-- already maps 'fog-of-war' -> 'dark-chess' at every read boundary (event
-- replay, row->record mappers, PGN export), so this migration is read-invisible
-- and exists to let Phase 4 remove the alias.
--
-- Scope is games.variant only. Persisted room-created event JSON is intentionally
-- NOT rewritten (the alias normalizes it on replay), user_ratings.variant uses a
-- separate bucket enum ('fog' / 'fog_draft960'), and eve_games carries no variant
-- column. There is no CHECK constraint on games.variant, so no ALTER is needed.

UPDATE games SET variant = 'dark-chess' WHERE variant = 'fog-of-war';
