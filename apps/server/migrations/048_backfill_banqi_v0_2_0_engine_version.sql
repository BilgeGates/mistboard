-- Backfill engine_version for the banqi v0.2.0 games played AFTER the v0.2.0 deploy (the
-- consolidated 'misty-banqi' id) but BEFORE migration 047 added the column. The 'misty-banqi'
-- subject_id only exists from the v0.2.0 ship onward (earlier games used the tiered ids
-- 'misty-banqi-strong/amateur/strongest' = v0.1.0), so this precisely tags the untagged
-- v0.2.0-era rows. Idempotent: the IS NULL guard makes a re-run a no-op, and rows written
-- live after 047 already carry '0.2.0'.
UPDATE game_participants
   SET engine_version = '0.2.0'
 WHERE subject_id = 'misty-banqi' AND engine_version IS NULL;
