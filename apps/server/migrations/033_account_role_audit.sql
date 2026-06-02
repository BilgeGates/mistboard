-- 033_account_role_audit.sql
-- Tamper-evident audit of every account_role change, recorded at the database
-- layer so a manual psql UPDATE is logged just like an app write. No app code
-- grants admin today; this guarantees we would see it if any path ever did.

CREATE TABLE IF NOT EXISTS account_role_changes (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_role    TEXT,
  new_role    TEXT NOT NULL,
  changed_by  TEXT NOT NULL,          -- Postgres login role that made the write
  app_actor   TEXT,                   -- best-effort app context (app.actor GUC); NULL for manual SQL
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_role_changes_user_idx
  ON account_role_changes (user_id, changed_at DESC);

CREATE OR REPLACE FUNCTION log_account_role_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO account_role_changes (user_id, old_role, new_role, changed_by, app_actor)
  VALUES (
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.account_role ELSE NULL END,
    NEW.account_role,
    current_user,
    current_setting('app.actor', true)   -- 'true' = return NULL if unset, do not error
  );
  RETURN NEW;
END;
$$;

-- Grants/revokes (UPDATE) + any account created with a non-default role (INSERT).
DROP TRIGGER IF EXISTS trg_account_role_change_update ON users;
CREATE TRIGGER trg_account_role_change_update
  AFTER UPDATE OF account_role ON users
  FOR EACH ROW WHEN (OLD.account_role IS DISTINCT FROM NEW.account_role)
  EXECUTE FUNCTION log_account_role_change();

DROP TRIGGER IF EXISTS trg_account_role_change_insert ON users;
CREATE TRIGGER trg_account_role_change_insert
  AFTER INSERT ON users
  FOR EACH ROW WHEN (NEW.account_role <> 'player')
  EXECUTE FUNCTION log_account_role_change();
