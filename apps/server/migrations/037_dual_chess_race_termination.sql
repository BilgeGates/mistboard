-- Dual Chess "race" (Try) win — allow it as a game termination reason.
--
-- The Dual Chess racing win (the King reaches the enemy home rank) finishes a
-- game with termination='race', which the existing games_termination_check
-- rejected. Result stays white-wins / red-wins (already allowed by
-- games_result_check). Kept in sync with the GameTermination union
-- (apps/server/src/persistence-game-lifecycle.ts) via the sql-enums drift check.
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
        'race'
      )
    );
