import {
  type FeaturedGame,
  MISTBOARD_ENGINE_MISTY_ID,
  MISTBOARD_ENGINE_MISTY_NAME,
} from './game-display.js';

const HOMEPAGE_ENGINE_TIME_CONTROL = {
  kind: 'increment-budget',
  label: '5s increment budget',
  budgetMs: 5_000,
};
export function pickHeroPovForGame(game: FeaturedGame): 'white' | 'black' {
  if (game.playerColor === 'white' || game.playerColor === 'black') return game.playerColor;
  // EvE / PvP / unknown: show the winner; draws and unknown results fall back to white.
  if (game.result === 'black-wins' || game.result === '0-1') return 'black';
  return 'white';
}

// Homepage cold-start showcase: Misty 1.0 (the current player-facing engine)
// self-play. Shown only when the live /api/games/showcase pool has fewer than
// three qualifying games. Games are the decisive (king-captured), substantial
// (>=35-ply) games exported from the v2 self-play corpus; short early-blunder
// games are omitted. The replay move data lives in
// apps/web/public/replay-samples/<roomId>.jsonl, so the roomIds are stable.
export function homepageShowcaseGames(): FeaturedGame[] {
  const specs: Array<{
    index: number;
    plyCount: number;
    winner: 'white' | 'black';
  }> = [
    { index: 0, plyCount: 78, winner: 'black' },
    { index: 1, plyCount: 62, winner: 'black' },
    { index: 2, plyCount: 78, winner: 'black' },
    { index: 3, plyCount: 35, winner: 'white' },
    { index: 4, plyCount: 43, winner: 'white' },
    { index: 5, plyCount: 98, winner: 'black' },
    { index: 6, plyCount: 59, winner: 'white' },
    { index: 7, plyCount: 67, winner: 'white' },
    { index: 8, plyCount: 71, winner: 'white' },
    { index: 9, plyCount: 69, winner: 'white' },
    { index: 10, plyCount: 57, winner: 'white' },
  ];

  return specs.map((spec) => ({
    roomId: `engine-v2-g${String(spec.index).padStart(4, '0')}`,
    variant: 'dark-chess',
    mode: 'eve',
    result: spec.winner === 'white' ? 'white-wins' : 'black-wins',
    termination: 'king-captured',
    plyCount: spec.plyCount,
    whiteName: MISTBOARD_ENGINE_MISTY_NAME,
    blackName: MISTBOARD_ENGINE_MISTY_NAME,
    corpusId: 'replay-samples',
    gameIndex: spec.index,
    // No playerColor: both sides are Misty 1.0, so the hero POV follows the
    // winner (pickHeroPovForGame) rather than a fixed side.
    whiteEngineId: MISTBOARD_ENGINE_MISTY_ID,
    blackEngineId: MISTBOARD_ENGINE_MISTY_ID,
    timeControl: HOMEPAGE_ENGINE_TIME_CONTROL,
    participants: [
      {
        color: 'white',
        displayName: MISTBOARD_ENGINE_MISTY_NAME,
        subjectType: 'engine-version',
        subjectId: MISTBOARD_ENGINE_MISTY_ID,
        visibility: 'public',
      },
      {
        color: 'black',
        displayName: MISTBOARD_ENGINE_MISTY_NAME,
        subjectType: 'engine-version',
        subjectId: MISTBOARD_ENGINE_MISTY_ID,
        visibility: 'public',
      },
    ],
  }));
}
