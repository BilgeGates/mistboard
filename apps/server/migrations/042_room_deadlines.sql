-- Durable per-move deadlines for correspondence (days-per-move) rooms.
-- A denormalized index over the room event log: the deadline sweeper
-- re-derives the deadline from the hydrated room before acting, so a stale
-- row can never flag a game early. The same table indexes the "your move"
-- dashboard (seat_user_id) and the deadline-warning email queue (warned_at).
CREATE TABLE IF NOT EXISTS room_deadlines (
  room_id      TEXT        PRIMARY KEY,
  game_spec_id TEXT        NOT NULL,
  seat         TEXT        NOT NULL,
  seat_user_id TEXT,
  due_at       TIMESTAMPTZ NOT NULL,
  warned_at    TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_deadlines_due_at_idx
  ON room_deadlines (due_at);

CREATE INDEX IF NOT EXISTS room_deadlines_seat_user_id_idx
  ON room_deadlines (seat_user_id)
  WHERE seat_user_id IS NOT NULL;
