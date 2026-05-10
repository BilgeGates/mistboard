-- 013_guest_abort_policies.sql
-- Add a canonical termination for rooms that never reached active play and
-- were closed by a lifecycle abort policy.

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
        'truncated'
      )
    );
