-- 006_engine_library.sql
-- Add a logical engine-family layer above immutable engine version pins.
-- Existing task/game references continue to point at engine_versions.id.

CREATE TABLE IF NOT EXISTS engines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'admin'
    CHECK (visibility IN ('builtin', 'admin', 'private', 'unlisted', 'public')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'quarantined')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE engine_versions
  ADD COLUMN IF NOT EXISTS engine_id TEXT,
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'builtin'
    CHECK (kind IN ('builtin', 'typescript-bundle', 'wasm', 'container')),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending-validation', 'active', 'disabled', 'quarantined')),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO engines (id, name, visibility, status, notes)
SELECT version.id, version.name, 'builtin', 'active', 'Backfilled from pre-library engine_versions.'
FROM engine_versions version
ON CONFLICT (id) DO NOTHING;

UPDATE engine_versions
SET engine_id = COALESCE(engine_id, id);

ALTER TABLE engine_versions
  ALTER COLUMN engine_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'engine_versions_engine_id_fkey'
  ) THEN
    ALTER TABLE engine_versions
      ADD CONSTRAINT engine_versions_engine_id_fkey
      FOREIGN KEY (engine_id) REFERENCES engines(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS engine_versions_engine_id_idx ON engine_versions (engine_id);
CREATE INDEX IF NOT EXISTS engine_versions_status_idx ON engine_versions (status);
