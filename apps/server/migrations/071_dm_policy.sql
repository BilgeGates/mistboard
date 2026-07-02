-- 071_dm_policy.sql
-- Per-user DM policy (#93, lichess message-pref model): who may START a
-- conversation with you. Replies to an existing thread are always allowed
-- regardless of policy, so the column only gates thread-creating sends.
-- 'friends' means players the RECIPIENT follows (the directed user_relations
-- follow edge), matching lichess's Message.FRIEND semantics.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS dm_policy TEXT NOT NULL DEFAULT 'always';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_dm_policy_check,
  ADD CONSTRAINT users_dm_policy_check
    CHECK (dm_policy IN ('never', 'friends', 'always'));
