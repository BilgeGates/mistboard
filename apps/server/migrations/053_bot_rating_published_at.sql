-- 053_bot_rating_published_at.sql
-- Promotion time is separate from import/snapshot creation time. A reviewed
-- draft can become the current public rating without rewriting when it was
-- originally calculated.

ALTER TABLE bot_rating_snapshots
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

UPDATE bot_rating_snapshots
   SET published_at = created_at
 WHERE published = true
   AND published_at IS NULL;

ALTER TABLE bot_rating_snapshots
  DROP CONSTRAINT IF EXISTS bot_rating_snapshots_published_at_check;

ALTER TABLE bot_rating_snapshots
  ADD CONSTRAINT bot_rating_snapshots_published_at_check
  CHECK (
    (published = false AND published_at IS NULL)
    OR (published = true AND published_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS bot_rating_snapshots_publication_latest_idx
  ON bot_rating_snapshots (
    bot_id,
    game_spec_id,
    time_class,
    published,
    published_at DESC,
    created_at DESC,
    id DESC
  );
