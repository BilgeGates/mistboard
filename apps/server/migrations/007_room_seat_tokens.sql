-- 007_room_seat_tokens.sql
-- Durable reconnect authority for live room seats. Raw tokens are issued once
-- to seated clients; only hashes are persisted here.

CREATE TABLE IF NOT EXISTS room_seat_tokens (
  room_id     TEXT        NOT NULL,
  seat        TEXT        NOT NULL CHECK (seat IN ('white', 'black')),
  client_id   TEXT        NOT NULL,
  token_hash  TEXT        NOT NULL,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ,
  PRIMARY KEY (room_id, seat),
  UNIQUE (room_id, token_hash)
);

CREATE INDEX IF NOT EXISTS room_seat_tokens_room_id_idx ON room_seat_tokens (room_id);
CREATE INDEX IF NOT EXISTS room_seat_tokens_last_seen_at_idx ON room_seat_tokens (last_seen_at);
