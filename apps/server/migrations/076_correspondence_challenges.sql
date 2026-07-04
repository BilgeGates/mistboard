-- 076_correspondence_challenges.sql
-- Directed + link-only challenges on top of the open correspondence-seek board
-- (the async-challenge-loop foundation: player-to-player challenges, shareable).
-- A seek gains two dimensions:
--   target_user_id — when set, ONLY that account may accept: a direct challenge
--     to a named player. The row never appears on the public board and instead
--     surfaces in the target's "challenges to me" list.
--   visibility     — 'public' seeks are the open board (anyone accepts);
--     'private' seeks are off-board and accepted by link, i.e. by whoever holds
--     the unguessable seek id (the shareable "play me" URL). A private seek with
--     target_user_id set is the direct challenge above.
-- The existing open board is exactly visibility='public' AND target_user_id IS
-- NULL, so the DEFAULT 'public' + NULL target keeps every pre-existing row on
-- the board unchanged.

ALTER TABLE correspondence_seeks
  ADD COLUMN IF NOT EXISTS target_user_id TEXT NULL REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';

ALTER TABLE correspondence_seeks
  DROP CONSTRAINT IF EXISTS correspondence_seeks_visibility_check,
  ADD CONSTRAINT correspondence_seeks_visibility_check
    CHECK (visibility IN ('public', 'private'));

-- "Challenges to me" lookup — only the directed rows carry a target.
CREATE INDEX IF NOT EXISTS correspondence_seeks_target_idx
  ON correspondence_seeks (target_user_id) WHERE target_user_id IS NOT NULL;
