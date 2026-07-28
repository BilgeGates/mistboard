// Sample game for the Jungle (Dou Shou Qi) rules article.
//
// A real game our own bot played against itself at two different search budgets
// (the old level-3 tier as Red, the old level-2 tier as Black), replayed
// move-for-move through the jungle kernel. The rung names are deliberately NOT in
// the player-facing labels below: jungle ships one bot as of 2026-07-27, and a
// rules article is the wrong place to advertise a ladder players cannot select.
// Jungle is perfect-information, so the spec is just the move list — no
// hidden deal. Red sends a lion across the river early, swims a rat up the far
// lane, uses the rat to take Black's elephant, and marches into Black's den.
// Every signature rule shows up: the lion's river jump, the swimming rat, the
// rat-beats-elephant exception, and the den win. Verified to replay to the
// recorded final position (Red wins by den entry, 69 plies).

export const JUNGLE_SAMPLE_GAME: {
  red: string;
  black: string;
  event: string;
  outcome: string;
  result: string;
  moves: string;
} = {
  red: 'Misty',
  black: 'Misty',
  event: 'Engine vs engine',
  outcome: 'Red wins by reaching the den · 69 plies',
  result:
    'Red’s rat has already taken Blue’s elephant in the open, and with the strongest piece off the board Red walks a piece straight into Blue’s undefended den. Reaching the enemy den ends the game at once, no matter what material is left.',
  // Space-separated from+to tokens (files a-g, ranks 1-9). Replayed via
  // applyJungleMove from the initial position.
  moves:
    'a1a2 a7a6 a3a4 a9a8 a4a5 a6a7 a2a3 a7b7 a3a4 a8a7 a4d4 a7a6 a5b5 a6a5 b2b3 b8c8 b5b6 c7d7 b6c6 b7c7 c3d3 c8d8 b3c3 d7d6 d4d5 a5a4 d5d6 c7d7 d6d5 d7d6 d5d4 a4a3 c6c7 d6d5 d4a4 a3b3 c7c6 b3c3 c6d6 c3d3 f2e2 d5d4 d6d5 d8d7 a4a5 d7d6 d5d4 e7d7 a5d5 f8e8 d5d6 d7c7 d6d7 c7b7 d4d5 g7f7 d7e7 f7f6 e7e8 b7c7 e8d8 c7b7 d5c5 b7a7 c5b5 a7a6 b5a5 a6a5 d8d9',
};
