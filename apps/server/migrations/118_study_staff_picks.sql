-- 118_study_staff_picks.sql
-- Staff-curated public studies. The timestamp is both the curation marker and
-- the deliberate display order: newly selected studies rise to the top.

ALTER TABLE studies
  ADD COLUMN IF NOT EXISTS featured_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS studies_featured_idx
  ON studies (featured_at DESC)
  WHERE featured_at IS NOT NULL AND visibility = 'public';

-- The existing Mistboard archive studies are the launch collection. Future
-- picks are explicit admin actions rather than automatic by owner.
UPDATE studies
   SET featured_at = updated_at
 WHERE featured_at IS NULL
   AND visibility = 'public'
   AND owner_id IN (SELECT id FROM users WHERE handle = 'mistboard');
