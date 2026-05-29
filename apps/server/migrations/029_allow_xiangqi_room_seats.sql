-- Allow non-chess room families to use the shared durable seat-token table.
-- "black" is shared by chess and xiangqi; "red" is the only new seat label.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'room_seat_tokens'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%seat%'
    AND pg_get_constraintdef(oid) LIKE '%white%'
    AND pg_get_constraintdef(oid) LIKE '%black%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE room_seat_tokens DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE room_seat_tokens
  ADD CONSTRAINT room_seat_tokens_seat_check
  CHECK (seat IN ('white', 'black', 'red'));
