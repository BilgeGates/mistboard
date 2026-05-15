-- 018_add_resignation_termination.sql
-- Add 'resignation' to the games_termination_check constraint.
-- The game engine emits status.reason = 'resignation' on resign, but this
-- value was never included in the DB constraint, causing recordGameEnd to
-- silently fail for any PvP game ended by resignation.

ALTER TABLE games
  DROP CONSTRAINT IF EXISTS games_termination_check,
  ADD CONSTRAINT games_termination_check
    CHECK (
      termination IS NULL
      OR termination IN (
        'king-captured',
        'timeout',
        'checkmate',
        'draw',
        'engine-failure',
        'worker-aborted',
        'server-restarted',
        'abandoned',
        'no-legal-moves',
        'truncated',
        'resignation'
      )
    );
