import { CROSSROADS_CHESS_SPEC_ID, XIANGQI_SPEC_ID } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { databaseMatchupLabel } from './database.js';
import type { FeaturedGame } from './game-display.js';

describe('database game rows', () => {
  it('labels Crossroads rows as white vs red', () => {
    expect(
      databaseMatchupLabel({
        ...baseGame(),
        variant: CROSSROADS_CHESS_SPEC_ID,
        participants: [participant('white', 'White Player'), participant('red', 'Red Player')],
      }),
    ).toBe('White Player vs Red Player');
  });

  it('keeps dark chess rows as white vs black', () => {
    expect(
      databaseMatchupLabel({
        ...baseGame(),
        variant: 'fog',
        participants: [participant('white', 'White Player'), participant('black', 'Black Player')],
      }),
    ).toBe('White Player vs Black Player');
  });

  // Regression: xiangqi seats are red/black. The old label hardcoded the
  // 'white' seat, which has no participant, so rows read "White vs <black>".
  it('labels xiangqi rows as red vs black', () => {
    expect(
      databaseMatchupLabel({
        ...baseGame(),
        variant: XIANGQI_SPEC_ID,
        participants: [participant('red', 'Red Player'), participant('black', 'Black Player')],
      }),
    ).toBe('Red Player vs Black Player');
  });

  it('falls back to red/black seat words for xiangqi rows with no participants', () => {
    expect(
      databaseMatchupLabel({
        ...baseGame(),
        variant: XIANGQI_SPEC_ID,
      }),
    ).toBe('Red vs Black');
  });
});

function baseGame(): FeaturedGame {
  return {
    roomId: 'game_test',
    variant: 'fog',
    mode: 'pvp',
    rated: false,
    result: 'draw',
    termination: 'agreement',
    plyCount: 12,
    whiteName: null,
    blackName: null,
    corpusId: null,
  };
}

function participant(color: 'white' | 'black' | 'red', displayName: string) {
  return {
    color,
    displayName,
    subjectType: 'guest' as const,
    subjectId: null,
    visibility: 'public' as const,
  };
}
