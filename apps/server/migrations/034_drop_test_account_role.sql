-- 034_drop_test_account_role.sql
-- Retire the unused 'test' account_role. It was only ever set by the local
-- profile-fixture seeder and read nowhere as a gate; bots are modeled as
-- engine-version participants (game_participants.subject_type), not users, so
-- no non-human account role is needed. Coerce any stragglers to 'player'
-- before tightening the CHECK constraint (a no-op behavior change, since
-- nothing branched on 'test'). Runs after 033, so each coercion is audited.

UPDATE users SET account_role = 'player', updated_at = now()
WHERE account_role = 'test';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_account_role_check,
  ADD CONSTRAINT users_account_role_check
    CHECK (account_role IN ('player', 'admin'));
