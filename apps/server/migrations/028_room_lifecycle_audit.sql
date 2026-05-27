CREATE TABLE IF NOT EXISTS room_lifecycle_audit (
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT,
  kind TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  at_ms BIGINT,
  event_seq INTEGER,
  build_revision TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_lifecycle_audit_room_idx
  ON room_lifecycle_audit (room_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS room_lifecycle_audit_kind_idx
  ON room_lifecycle_audit (kind, occurred_at DESC, id DESC);
