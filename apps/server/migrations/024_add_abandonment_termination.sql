-- 024_add_abandonment_termination.sql
-- Add 'abandonment' to the games_termination_check constraint.
--
-- This is the WIN-by-opponent-leaving terminal reason: a player disconnects
-- from an in-progress game (post-move-1) and doesn't return within the forfeit
-- countdown, so the present player wins. It is distinct from 'abandoned', which
-- is a NO-RESULT abort (status='aborted', result NULL) used for pre-move and
-- guest-pre-start timeouts. A seat-forfeited game is status='completed' with a
-- real winner and termination='abandonment'.

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
        'abandonment',
        'no-legal-moves',
        'truncated',
        'resignation'
      )
    );
