-- Engine version on each game participant — makes PvE games version-queryable across the
-- variant-tenant UCI engines (jieqi / banqi / crossroads), whose subject_id encodes only the
-- tier/family (e.g. 'misty-banqi'), not the engine build. Written at game-summary time from
-- each tenant's per-engine version constant (banqi: BANQI_ENGINE_VERSION, etc.).
--
-- Additive + nullable: existing rows stay NULL ("pre-versioning"); first-party engines
-- (Misty/DMX) already encode the version in subject_id and leave this NULL. Query the newest
-- version with e.g. `WHERE subject_id = 'misty-banqi' AND engine_version = '0.2.0'`.
ALTER TABLE game_participants ADD COLUMN IF NOT EXISTS engine_version TEXT;
