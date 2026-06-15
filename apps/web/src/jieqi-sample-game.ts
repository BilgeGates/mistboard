// Sample game for the Jieqi rules article.
//
// A real PikaJieQi (Pikafish jieqi_old) self-play game, replayed through the
// jieqi kernel from the recorded deal. Red wins by checkmate on move 36. The
// shuffled deal carries the hidden-identity twist the article explains — e.g.
// Red's a1 corner piece is a soldier, not the chariot its square implies, so
// its first move reveals a surprise. Each side moved from the public (redacted)
// position only; reveals follow the deal below.

import type { JieqiPieceRole } from '@mistboard/game';

export const JIEQI_SAMPLE_GAME: {
  red: string;
  black: string;
  event: string;
  result: string;
  deal: { red: JieqiPieceRole[]; black: JieqiPieceRole[] };
  moves: string;
} = {
  red: 'PikaJieQi',
  black: 'PikaJieQi',
  event: 'PikaJieQi self-play',
  result: 'Red works through the reveals and delivers checkmate on move 36.',
  // Per-side hidden deal in jieqiHomeSquares order (the replay reconstructs the
  // game via createInitialJieqiState(id, deal); a dark piece reveals as its dealt
  // role on first move).
  deal: {
    red: [
      'soldier',
      'advisor',
      'elephant',
      'horse',
      'horse',
      'cannon',
      'chariot',
      'soldier',
      'soldier',
      'elephant',
      'soldier',
      'soldier',
      'chariot',
      'advisor',
      'cannon',
    ],
    black: [
      'chariot',
      'elephant',
      'chariot',
      'soldier',
      'soldier',
      'soldier',
      'soldier',
      'elephant',
      'cannon',
      'advisor',
      'advisor',
      'horse',
      'horse',
      'soldier',
      'cannon',
    ],
  },
  moves:
    'b1c3 i7i6 a4a5 g7g6 e4e5 c10e8 e5e7 c7c6 d1e2 b10d9 c4c5 c6e4 e7e4 h10i8 e4e6 h8h5 ' +
    'e6g6 h5h4 e2d4 d9e9 e1d1 h4h3 b3h3 e9f9 f1e2 e8f7 g6i6 d10e9 e2g3 b8e8 g4g5 e9f8 ' +
    'i6d6 i10i9 d4c6 f10e9 c6a7 f9f10 a7c6 f8e7 d6h6 i9g9 g1e3 a10c10 h6h9 g9g7 h9h7 g7g3 ' +
    'h1g3 f7g6 h7g7 i8i7 g7g6 g10i8 c6b8 i8h10 b8d7 e7d8 g3f3 e8e7 g6g10 h10g8 g10g8 c10e8 ' +
    'f3f9 i7i6 g8e8 f10h10 e8e9 d8e9 d7c9',
};
