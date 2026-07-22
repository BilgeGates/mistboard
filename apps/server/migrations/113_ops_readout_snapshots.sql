-- 113_ops_readout_snapshots.sql
-- Durable, aggregate operating readouts. Payloads are versioned and redacted
-- before insertion; this table never stores request data or user identifiers.

CREATE TABLE IF NOT EXISTS ops_readout_snapshots (
  id                    text        PRIMARY KEY,
  schema_version        integer     NOT NULL CHECK (schema_version > 0),
  trigger               text        NOT NULL CHECK (trigger IN ('daily', 'weekly', 'manual')),
  snapshot_key          text        UNIQUE,
  period_start          timestamptz NOT NULL,
  period_end            timestamptz NOT NULL,
  verdict               text        NOT NULL CHECK (
    verdict IN ('healthy', 'watch', 'action', 'blocked', 'unknown')
  ),
  decision_fingerprint  text        NOT NULL,
  payload               jsonb       NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end > period_start),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS ops_readout_snapshots_created_idx
  ON ops_readout_snapshots (created_at DESC);

CREATE INDEX IF NOT EXISTS ops_readout_snapshots_fingerprint_idx
  ON ops_readout_snapshots (decision_fingerprint, created_at DESC);
