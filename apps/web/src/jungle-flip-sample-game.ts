// Sample game for the Flip Jungle (兽棋 / 翻翻棋) rules article.
//
// A real game played by our own bot against itself: MistyJungleFlip on both
// seats, replayed through the flip-jungle kernel from the recorded deal. The
// game is a clean illustration of 同归于尽 (mutual destruction): the two lions
// meet and both leave the board, Black's elephant then runs through Red's tiger,
// leopard, and dog, and finally the two elephants collide and cancel each other
// too. Stripped of its big pieces, Red runs out of moves and Black wins by
// elimination. Reconstructed from the finished game's deal (public once the game
// ends); verified to replay to the recorded final position (Black wins, 36 plies).

import type { JungleFlipDeal } from '@mistboard/game';

export const JUNGLE_FLIP_SAMPLE_GAME: {
  red: string;
  black: string;
  event: string;
  outcome: string;
  result: string;
  deal: JungleFlipDeal;
  moves: string;
} = {
  red: 'MistyJungleFlip',
  black: 'MistyJungleFlip',
  event: 'Engine self-play',
  outcome: 'Black wins by elimination · 36 moves',
  result:
    'Both lions and both elephants have already traded off the board (同归于尽), and the pieces that survived all belong to Black. Red has nothing left that can move, so the game ends: with no piece to move and no tile to flip, Red loses.',
  // The 16-tile deal in board-index order (a1, b1, c1, d1, a2, …, d4):
  // createInitialJungleFlipState places deal[i] face-down on square i, and a flip
  // reveals it. The first tile a player flips binds their color for the game.
  deal: [
    { color: 'red', role: 'elephant' },
    { color: 'red', role: 'leopard' },
    { color: 'black', role: 'dog' },
    { color: 'red', role: 'cat' },
    { color: 'red', role: 'dog' },
    { color: 'red', role: 'tiger' },
    { color: 'red', role: 'lion' },
    { color: 'black', role: 'lion' },
    { color: 'black', role: 'wolf' },
    { color: 'black', role: 'elephant' },
    { color: 'black', role: 'cat' },
    { color: 'red', role: 'rat' },
    { color: 'black', role: 'leopard' },
    { color: 'black', role: 'rat' },
    { color: 'black', role: 'tiger' },
    { color: 'red', role: 'wolf' },
  ],
  // Space-separated from+to tokens (files a-d, ranks 1-4); a flip is the
  // self-move from==to (e.g. "a1a1"). Replayed via applyJungleFlipMove.
  moves:
    'a1a1 d1d1 a2a2 d2d2 b1b1 c2c2 c2d2 d3d3 d1d2 d4d4 d2c2 c4c4 d3d2 c4d4 d2d1 b4b4 d1d2 a3a3 d2d1 d4d3 b2b2 d3d2 b3b3 b3b2 c1c1 b2b1 a2b2 b1b2 a1b1 b2b1 c2b2 d2d1 a4a4 c3c3 b2c2 c1c2',
};
