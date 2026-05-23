-- 011_public_profiles_and_account_roles.sql
-- Early public-alpha posture: accounts and completed games are public by
-- default. Account roles are metadata only; they do not grant live-room
-- authority or admin-debug access.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_role TEXT NOT NULL DEFAULT 'player';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_account_role_check,
  ADD CONSTRAINT users_account_role_check
    CHECK (account_role IN ('player', 'test', 'admin'));

ALTER TABLE users
  ALTER COLUMN profile_visibility SET DEFAULT 'public';

-- The WHERE clauses below act as their own idempotency guard: value-filtered
-- UPDATEs are no-ops on re-run. CAVEAT: if a user opts back to 'private' after
-- this migration applies, a manual re-run of this file would un-do that opt-out.
-- The `_migrations` table dedup is what actually prevents that — do not run
-- this file directly via psql.
UPDATE users
SET profile_visibility = 'public'
WHERE profile_visibility = 'private';

ALTER TABLE games
  ALTER COLUMN visibility SET DEFAULT 'public';

UPDATE games
SET visibility = 'public'
WHERE visibility = 'link';

ALTER TABLE game_participants
  ALTER COLUMN visibility SET DEFAULT 'public';

UPDATE game_participants
SET visibility = 'public'
WHERE visibility = 'link';

CREATE INDEX IF NOT EXISTS users_account_role_idx ON users (account_role);
