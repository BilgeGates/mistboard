// Sample game for the Crossroads Chess rules article.
//
// A real Fairy-Stockfish self-play game from the meerkat x_L5 balance sweep —
// replay fixture game 0 (CROSSROADS_CHESS_REPLAY_GAMES[0]), which White wins by the
// race, the king reaching the eighth rank on move 44 (f7f8). The move list is
// replayed through the real Crossroads Chess kernel by crossroads-chess-replay.ts; no
// precomputed board images are shipped.

export const CROSSROADS_CHESS_SAMPLE_GAME = {
  white: 'Fairy-Stockfish',
  red: 'Fairy-Stockfish',
  event: 'Fairy-Stockfish self-play',
  result: 'White marches the king up to f8 on the eighth rank. The race is won, and White wins.',
  moves:
    'a2a3 b7b6 c2c3 a8b7 b2b3 e7e6 b3b4 e6e5 b4b5 f7f6 a3a4 f6f5 a4a5 f5f4 b5c5 e5e4 ' +
    'd2d3 e4d4 e1d2 d7d6 c3c4 d8e6 a5a6 d4c4 d3c4 e8d8 c1d3 f4e4 c5c6 f8f7 e2e3 e4d4 ' +
    'e3d4 d8d4 d2c2 d4d1 c2d1 e6d4 f1e2 b8a8 c6b6 c7b6 d1d2 d6d5 a1a3 f7c7 c4d5 c7d7 ' +
    'a6a7 c8a7 b1a1 b7d5 d2e3 a8b8 a1a7 d5c4 a7a4 d4c6 a4b4 b8c7 a3a7 c7d8 a7d7 d8d7 ' +
    'b4b2 d7e6 e2f3 c4b5 b2b6 e6d7 d3c5 d7c7 e3d4 c6e7 d4e5 b5c4 e5f6 c7d8 b6e6 c4e6 ' +
    'c5e6 d8e8 f3d5 e8d7 f6f7 d7d8 f7f8',
};
