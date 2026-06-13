-- 043_correspondence_seeks.sql
-- Open async seeks for correspondence — the C3 liquidity board. A seek is a
-- standing request that anyone can accept later, so games form without the two
-- players ever being online together (the whole point of correspondence).
-- Accepting a seek creates a correspondence room seating BOTH the creator and
-- the accepter, then the seek row is deleted; this table holds only open seeks.
-- Capped per user (enforced in app code) to bound spam.
CREATE TABLE IF NOT EXISTS correspondence_seeks (
  id              TEXT             PRIMARY KEY,
  creator_user_id TEXT             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_spec_id    TEXT             NOT NULL,
  -- Mirrors RoomTimeControl.daysPerMove (double so dev-compressed fractional
  -- allowances round-trip identically to the room create path).
  days_per_move   DOUBLE PRECISION NOT NULL,
  preferred_color TEXT             NOT NULL CHECK (preferred_color IN ('white', 'black', 'random')),
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- Per-user open-seek count (the cap) + "your open seeks" list.
CREATE INDEX IF NOT EXISTS correspondence_seeks_creator_idx
  ON correspondence_seeks (creator_user_id);
-- The public board, newest-or-oldest first.
CREATE INDEX IF NOT EXISTS correspondence_seeks_created_at_idx
  ON correspondence_seeks (created_at);
