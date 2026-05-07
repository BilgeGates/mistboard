-- 002_games_check_constraints.sql
-- Constrain games.result and games.termination to the values the application
-- actually writes. Catches bugs at the DB layer rather than allowing arbitrary
-- strings into the aggregate table. ALTER the constraint when new termination
-- types ship (e.g., resignation).

ALTER TABLE games
  ADD CONSTRAINT games_result_check
  CHECK (result IN ('white-wins', 'black-wins', 'draw'));

ALTER TABLE games
  ADD CONSTRAINT games_termination_check
  CHECK (termination IN ('king-captured', 'timeout', 'checkmate', 'draw'));
