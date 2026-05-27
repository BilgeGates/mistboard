import {
  type FeaturedGame,
  MISTBOARD_ENGINE_BASELINE_NAME,
  MISTBOARD_ENGINE_SNAPSHOT_ID,
  MISTBOARD_ENGINE_SNAPSHOT_NAME,
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

export function homepageShowcaseGames(): FeaturedGame[] {
  const specs: Array<{
    index: number;
    outcome: 'W' | 'L' | 'D';
    plyCount: number;
    termination: string;
    v2Color: 'white' | 'black';
  }> = [
    { index: 0, outcome: 'W', plyCount: 89, termination: 'king-captured', v2Color: 'white' },
    { index: 1, outcome: 'W', plyCount: 118, termination: 'king-captured', v2Color: 'black' },
    { index: 2, outcome: 'W', plyCount: 119, termination: 'king-captured', v2Color: 'white' },
    { index: 3, outcome: 'W', plyCount: 90, termination: 'king-captured', v2Color: 'black' },
    { index: 4, outcome: 'W', plyCount: 33, termination: 'king-captured', v2Color: 'white' },
    { index: 5, outcome: 'W', plyCount: 54, termination: 'king-captured', v2Color: 'black' },
    { index: 6, outcome: 'W', plyCount: 123, termination: 'king-captured', v2Color: 'white' },
    { index: 7, outcome: 'W', plyCount: 90, termination: 'king-captured', v2Color: 'black' },
    { index: 8, outcome: 'W', plyCount: 61, termination: 'king-captured', v2Color: 'white' },
    { index: 9, outcome: 'W', plyCount: 102, termination: 'king-captured', v2Color: 'black' },
    { index: 10, outcome: 'W', plyCount: 117, termination: 'king-captured', v2Color: 'white' },
    { index: 11, outcome: 'W', plyCount: 128, termination: 'king-captured', v2Color: 'black' },
    { index: 13, outcome: 'W', plyCount: 120, termination: 'king-captured', v2Color: 'black' },
    { index: 14, outcome: 'W', plyCount: 139, termination: 'king-captured', v2Color: 'white' },
    { index: 15, outcome: 'W', plyCount: 98, termination: 'king-captured', v2Color: 'black' },
    { index: 16, outcome: 'W', plyCount: 91, termination: 'king-captured', v2Color: 'white' },
    { index: 17, outcome: 'W', plyCount: 132, termination: 'king-captured', v2Color: 'black' },
    { index: 18, outcome: 'W', plyCount: 137, termination: 'king-captured', v2Color: 'white' },
    { index: 19, outcome: 'W', plyCount: 126, termination: 'king-captured', v2Color: 'black' },
    { index: 20, outcome: 'W', plyCount: 115, termination: 'king-captured', v2Color: 'white' },
    { index: 21, outcome: 'W', plyCount: 86, termination: 'king-captured', v2Color: 'black' },
    { index: 22, outcome: 'W', plyCount: 89, termination: 'king-captured', v2Color: 'white' },
    { index: 23, outcome: 'D', plyCount: 130, termination: 'draw', v2Color: 'black' },
    { index: 24, outcome: 'D', plyCount: 105, termination: 'draw', v2Color: 'white' },
    { index: 25, outcome: 'W', plyCount: 84, termination: 'king-captured', v2Color: 'black' },
    { index: 26, outcome: 'W', plyCount: 97, termination: 'king-captured', v2Color: 'white' },
    { index: 27, outcome: 'W', plyCount: 102, termination: 'king-captured', v2Color: 'black' },
    { index: 28, outcome: 'W', plyCount: 73, termination: 'king-captured', v2Color: 'white' },
    { index: 29, outcome: 'D', plyCount: 160, termination: 'truncated', v2Color: 'black' },
    { index: 30, outcome: 'W', plyCount: 89, termination: 'king-captured', v2Color: 'white' },
    { index: 31, outcome: 'W', plyCount: 138, termination: 'king-captured', v2Color: 'black' },
  ];

  return specs.map((spec) => {
    const whiteIsV2 = spec.v2Color === 'white';
    return {
      roomId: `engine-v2-g${String(spec.index).padStart(4, '0')}`,
      variant: 'dark-chess',
      mode: 'eve',
      result: engineOutcomeResult(spec.outcome, spec.v2Color),
      termination: spec.termination,
      plyCount: spec.plyCount,
      whiteName: whiteIsV2 ? MISTBOARD_ENGINE_SNAPSHOT_NAME : MISTBOARD_ENGINE_BASELINE_NAME,
      blackName: whiteIsV2 ? MISTBOARD_ENGINE_BASELINE_NAME : MISTBOARD_ENGINE_SNAPSHOT_NAME,
      corpusId: 'replay-samples',
      gameIndex: spec.index,
      whiteEngineId: whiteIsV2 ? MISTBOARD_ENGINE_SNAPSHOT_ID : 'python-tier1-v0.9.5',
      blackEngineId: whiteIsV2 ? 'python-tier1-v0.9.5' : MISTBOARD_ENGINE_SNAPSHOT_ID,
      timeControl: HOMEPAGE_ENGINE_TIME_CONTROL,
      participants: [
        {
          color: 'white',
          displayName: whiteIsV2 ? MISTBOARD_ENGINE_SNAPSHOT_NAME : MISTBOARD_ENGINE_BASELINE_NAME,
          subjectType: 'engine-version',
          subjectId: whiteIsV2 ? MISTBOARD_ENGINE_SNAPSHOT_ID : 'python-tier1-v0.9.5',
          visibility: 'public',
        },
        {
          color: 'black',
          displayName: whiteIsV2 ? MISTBOARD_ENGINE_BASELINE_NAME : MISTBOARD_ENGINE_SNAPSHOT_NAME,
          subjectType: 'engine-version',
          subjectId: whiteIsV2 ? 'python-tier1-v0.9.5' : MISTBOARD_ENGINE_SNAPSHOT_ID,
          visibility: 'public',
        },
      ],
      playerColor: spec.v2Color,
    };
  });
}

function engineOutcomeResult(
  outcome: 'W' | 'L' | 'D',
  v2Color: 'white' | 'black',
): 'white-wins' | 'black-wins' | 'draw' {
  if (outcome === 'D') return 'draw';
  const winner = outcome === 'W' ? v2Color : v2Color === 'white' ? 'black' : 'white';
  return winner === 'white' ? 'white-wins' : 'black-wins';
}
