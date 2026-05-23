const K = 32;

export type EloResult = 'white-wins' | 'black-wins' | 'draw';

export function computeElo(
  whiteRating: number,
  blackRating: number,
  result: EloResult,
): { newWhite: number; newBlack: number } {
  const expectedWhite = 1 / (1 + 10 ** ((blackRating - whiteRating) / 400));
  const expectedBlack = 1 - expectedWhite;

  const scoreWhite = result === 'white-wins' ? 1 : result === 'draw' ? 0.5 : 0;
  const scoreBlack = 1 - scoreWhite;

  return {
    newWhite: Math.round(whiteRating + K * (scoreWhite - expectedWhite)),
    newBlack: Math.round(blackRating + K * (scoreBlack - expectedBlack)),
  };
}
