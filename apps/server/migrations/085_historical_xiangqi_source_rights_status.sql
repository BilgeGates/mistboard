-- Track whether a historical xiangqi source is license-cleared before exposing
-- imported games publicly. The free-text license field alone is not enough for
-- safe bulk ingest operations.

ALTER TABLE historical_xiangqi_sources
  ADD COLUMN IF NOT EXISTS license_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (license_status IN ('unknown', 'test-only', 'permission-requested', 'cleared', 'restricted'));
