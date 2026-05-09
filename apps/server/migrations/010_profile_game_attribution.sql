-- 010_profile_game_attribution.sql
-- Attach signed-in account identity to future room seats for game-end
-- attribution. Live authority remains the room-scoped seat token.

ALTER TABLE room_seat_tokens
  ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS room_seat_tokens_user_id_idx
  ON room_seat_tokens (user_id);
