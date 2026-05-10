ALTER TABLE games
  DROP CONSTRAINT IF EXISTS games_termination_check;

ALTER TABLE games
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
