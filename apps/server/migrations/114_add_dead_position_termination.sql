-- Flip Jungle adjudicates a fully-revealed two-piece endgame that neither side
-- can win as a draw, recorded with termination 'dead-position'. That value was
-- never added to the games_termination_check allowlist, so recordGameEnd's whole
-- transaction failed: the games row and its game_participants rows both rolled
-- back, leaving the finished game with NO row at all. getGameSummary requires
-- status='completed', so the postgame API 404s ("Game not found") and the game is
-- missing from profile lists. Add it to the allowlist. (Its other endings --
-- stalemate, repetition, progress-clock, timeout, resignation, abandonment --
-- are already allowed.)

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
        'chasing',
        'dead-position'
      )
    );
