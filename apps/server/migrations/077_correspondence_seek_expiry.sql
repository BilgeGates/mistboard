-- 077_correspondence_seek_expiry.sql
-- Expiry for correspondence challenges (async-challenge-loop foundation). A
-- shareable "play me" link or a direct challenge should not live forever: it is
-- a spam and staleness surface (lichess expires open challenges in a day). Only
-- private challenges carry an expiry; public board seeks stay standing
-- invitations (expires_at NULL) so the open-seek board is unchanged.
--
-- expires_at NULL   → never expires (public board seek).
-- expires_at <= now → swept away and unacceptable (a lapsed challenge).

ALTER TABLE correspondence_seeks
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;

-- The expiry sweep and the "still live?" list filter both scan the expiring rows.
CREATE INDEX IF NOT EXISTS correspondence_seeks_expires_at_idx
  ON correspondence_seeks (expires_at) WHERE expires_at IS NOT NULL;
