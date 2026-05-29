-- Allow family-native completed-game summaries for Xiangqi without mapping Red
-- onto White. Dark Xiangqi stays private/unrated while this aggregate surface
-- is hardened for public replay/profile/watch use.

ALTER TABLE games
  DROP CONSTRAINT IF EXISTS games_result_check,
  ADD CONSTRAINT games_result_check
    CHECK (result IS NULL OR result IN ('white-wins', 'black-wins', 'red-wins', 'draw'));

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
        'progress-clock'
      )
    );

ALTER TABLE game_participants
  DROP CONSTRAINT IF EXISTS game_participants_color_check,
  ADD CONSTRAINT game_participants_color_check
    CHECK (color IN ('white', 'black', 'red'));
