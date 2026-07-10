-- 088_user_titles.sql
-- Title verification pipeline (lichess verify-title equivalent, xiangqi-first).
--
-- users.title: the single verified title a user holds (the highest they chose
-- to claim). NULL = untitled. Closed vocabulary, enforced by a named CHECK so
-- an unknown value can never land: xiangqi (WXF/CXA-style) titles first, then
-- FIDE chess titles, since the site hosts both families.
--
-- title_verification_requests: one row per submission. A partial unique index
-- enforces at most ONE pending request per user; rejected requests stay as
-- history and the user may resubmit. decided_by is the reviewing admin's user
-- id (SET NULL if that account ever disappears, the decision itself remains).

ALTER TABLE users ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_title_check;
ALTER TABLE users ADD CONSTRAINT users_title_check CHECK (
  title IS NULL OR title IN (
    'xgm', 'xim', 'xnm', 'xwgm', 'xwim',
    'gm', 'im', 'fm', 'cm', 'wgm', 'wim', 'wfm', 'wcm'
  )
);

CREATE TABLE IF NOT EXISTS title_verification_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (
    title IN (
      'xgm', 'xim', 'xnm', 'xwgm', 'xwim',
      'gm', 'im', 'fm', 'cm', 'wgm', 'wim', 'wfm', 'wcm'
    )
  ),
  -- Free text: federation profile links, real name, rating claims. The form
  -- caps length client- and server-side; the CHECK only rejects empty noise.
  evidence TEXT NOT NULL CHECK (char_length(btrim(evidence)) > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (status = 'pending' AND decided_at IS NULL)
    OR (status <> 'pending' AND decided_at IS NOT NULL)
  )
);

-- At most one live (pending) request per user.
CREATE UNIQUE INDEX IF NOT EXISTS title_verification_requests_one_pending
  ON title_verification_requests (user_id) WHERE status = 'pending';

-- Admin queue reads pending oldest-first; history reads decided newest-first.
CREATE INDEX IF NOT EXISTS title_verification_requests_status_idx
  ON title_verification_requests (status, created_at);
