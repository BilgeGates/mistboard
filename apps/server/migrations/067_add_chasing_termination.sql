-- Fortress Xiangqi enforces the xiangqi chasing rule: a perpetual check is a
-- loss for the checker, recorded with termination 'chasing'. Add it to the
-- games_termination_check allowlist so those finished games persist. (Its other
-- endings -- checkmate, stalemate, repetition, timeout, resignation,
-- abandonment -- are already allowed.)

ALTER TABLE games
  DROP CONSTRAINT IF EXISTS games_termination_check,
  ADD CONSTRAINT games_termination_check
    CHECK (
      termination IS NULL
      OR termination IN (
        'king-captured',
        'general-captured',
        'timeout',
        'checkmate',
        'draw',
        'resignation',
        'engine-failure',
        'worker-aborted',
        'server-restarted',
        'abandoned',
        'abandonment',
        'no-legal-moves',
        'stalemate',
        'truncated',
        'repetition',
        'progress-clock',
        'race',
        'chasing'
      )
    );
