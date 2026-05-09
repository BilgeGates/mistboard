-- 012_account_profile_settings.sql
-- Public profile settings for low-friction accounts. Email remains private
-- login identity; handle/display name are editable public identity.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS handle_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS display_name_changed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_handle_reservations (
  handle TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS user_handle_reservations_expires_at_idx
  ON user_handle_reservations (expires_at);
