import {
  type FeaturedGame,
  MISTBOARD_ENGINE_V2_BASE_ID,
  MISTBOARD_ENGINE_V2_BASE_NAME,
  MISTBOARD_ENGINE_V2_KLUSS_ID,
  MISTBOARD_ENGINE_V2_KLUSS_NAME,
} from './game-display.js';

const HOMEPAGE_ENGINE_TIME_CONTROL = {
  kind: 'increment-budget',
  label: '5s increment budget',
  budgetMs: 5_000,
};
export function pickHeroPovForGame(game: FeaturedGame): 'white' | 'black' {
  if (game.playerColor) return game.playerColor;
  // EvE / PvP / unknown: show the winner; draws and unknown results fall back to white.
  if (game.result === 'black-wins' || game.result === '0-1') return 'black';
  return 'white';
}

// v2 self-play showcase: Mistboard Engine v2 with the KLUSS search-scope feature
// (knowledge-limited subgame, k=2) vs the same engine without it. Both sides are
// the v2 engine; `klussColor` marks which side ran KLUSS. Games are the decisive
// (king-captured), substantial (>=33-ply) games from the kluss self-play corpus
// (lab/runs/v2-kluss-self-play-2026-05-25); short early-blunder games are omitted.
export function homepageShowcaseGames(): FeaturedGame[] {
  const specs: Array<{
    index: number;
    plyCount: number;
    klussColor: 'white' | 'black';
    winner: 'white' | 'black';
  }> = [
    { index: 0, plyCount: 78, klussColor: 'white', winner: 'black' },
    { index: 1, plyCount: 62, klussColor: 'black', winner: 'black' },
    { index: 2, plyCount: 78, klussColor: 'white', winner: 'black' },
    { index: 3, plyCount: 35, klussColor: 'black', winner: 'white' },
    { index: 4, plyCount: 43, klussColor: 'black', winner: 'white' },
    { index: 5, plyCount: 98, klussColor: 'white', winner: 'black' },
    { index: 6, plyCount: 59, klussColor: 'black', winner: 'white' },
    { index: 7, plyCount: 67, klussColor: 'black', winner: 'white' },
    { index: 8, plyCount: 71, klussColor: 'black', winner: 'white' },
    { index: 9, plyCount: 69, klussColor: 'black', winner: 'white' },
    { index: 10, plyCount: 57, klussColor: 'black', winner: 'white' },
  ];

  return specs.map((spec) => {
    const klussIsWhite = spec.klussColor === 'white';
    const whiteName = klussIsWhite ? MISTBOARD_ENGINE_V2_KLUSS_NAME : MISTBOARD_ENGINE_V2_BASE_NAME;
    const blackName = klussIsWhite ? MISTBOARD_ENGINE_V2_BASE_NAME : MISTBOARD_ENGINE_V2_KLUSS_NAME;
    const whiteId = klussIsWhite ? MISTBOARD_ENGINE_V2_KLUSS_ID : MISTBOARD_ENGINE_V2_BASE_ID;
    const blackId = klussIsWhite ? MISTBOARD_ENGINE_V2_BASE_ID : MISTBOARD_ENGINE_V2_KLUSS_ID;
    return {
      roomId: `engine-v2-g${String(spec.index).padStart(4, '0')}`,
      variant: 'dark-chess',
      mode: 'eve',
      result: spec.winner === 'white' ? 'white-wins' : 'black-wins',
      termination: 'king-captured',
      plyCount: spec.plyCount,
      whiteName,
      blackName,
      corpusId: 'replay-samples',
      gameIndex: spec.index,
      whiteEngineId: whiteId,
      blackEngineId: blackId,
      timeControl: HOMEPAGE_ENGINE_TIME_CONTROL,
      participants: [
        {
          color: 'white',
          displayName: whiteName,
          subjectType: 'engine-version',
          subjectId: whiteId,
          visibility: 'public',
        },
        {
          color: 'black',
          displayName: blackName,
          subjectType: 'engine-version',
          subjectId: blackId,
          visibility: 'public',
        },
      ],
      // playerColor omitted -> hero POV defaults to the winning side.
    };
  });
}
