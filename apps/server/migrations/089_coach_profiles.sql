-- 089_coach_profiles.sql
-- Coach directory (lichess.org/coach equivalent): verified titled players
-- advertise coaching; everyone can browse the public directory.
--
-- One profile per user (user_id is the PK). Title-holding is deliberately NOT
-- enforced here: titles can later be revoked, and a CHECK against users.title
-- could not see that. The route layer requires a held title to publish, and
-- the directory query joins users and only lists rows whose user currently
-- holds a title AND published = true, so a revoked title silently delists the
-- coach (fail-closed) without touching this table.
--
-- headline is the one required field (the directory card line). about,
-- languages, rate, and contact are free text; the form and route cap lengths,
-- the CHECK here only refuses empty-noise headlines and a runaway length.

CREATE TABLE IF NOT EXISTS coach_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline TEXT NOT NULL CHECK (
    char_length(btrim(headline)) > 0 AND char_length(headline) <= 120
  ),
  about TEXT NOT NULL DEFAULT '',
  -- Free text, e.g. "English, Mandarin".
  languages TEXT NOT NULL DEFAULT '',
  -- Free text, e.g. "$25 / hour".
  rate TEXT NOT NULL DEFAULT '',
  -- How students reach the coach (email, Discord, scheduling link).
  contact TEXT NOT NULL DEFAULT '',
  accepting_students BOOLEAN NOT NULL DEFAULT true,
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Directory read: published coaches, accepting-first then newest.
CREATE INDEX IF NOT EXISTS coach_profiles_directory_idx
  ON coach_profiles (published, accepting_students, created_at DESC);
