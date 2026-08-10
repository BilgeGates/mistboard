import {
  BANQI_SPEC_ID,
  CROSSROADS_CHESS_SPEC_ID,
  JUNGLE_FLIP_SPEC_ID,
  JUNGLE_SPEC_ID,
  XIANGQI_SPEC_ID,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  type FeaturedGame,
  type GameParticipant,
  matchupLabel,
  matchupSeats,
} from './game-display.js';

// Regression suite for the "white vs pikajieqi" bug: surfaces that hardcoded a
// 'white' seat lookup dropped the red player's name on every red/black variant
// and rendered the literal seat word instead. Every "X vs Y" surface now goes
// through matchupSeats/matchupLabel.
describe('matchupSeats', () => {
  it('resolves xiangqi to red vs black from the spec family', () => {
    expect(matchupSeats(game(XIANGQI_SPEC_ID))).toEqual(['red', 'black']);
  });

  it('resolves the jungle family to red vs black', () => {
    expect(matchupSeats(game(JUNGLE_SPEC_ID))).toEqual(['red', 'black']);
  });

  it('resolves crossroads (and its legacy dual-chess alias) to white vs red', () => {
    expect(matchupSeats(game(CROSSROADS_CHESS_SPEC_ID))).toEqual(['white', 'red']);
    expect(matchupSeats(game('dual-chess'))).toEqual(['white', 'red']);
  });

  it('defaults chess-family variants to white vs black', () => {
    expect(matchupSeats(game('fog'))).toEqual(['white', 'black']);
  });

  it('lets persisted participants decide when the variant string is unknown', () => {
    expect(
      matchupSeats(game('some-legacy-alias', [participant('red', 'a'), participant('black', 'b')])),
    ).toEqual(['red', 'black']);
    expect(
      matchupSeats(game('some-legacy-alias', [participant('white', 'a'), participant('red', 'b')])),
    ).toEqual(['white', 'red']);
  });
});

describe('matchupLabel', () => {
  it('names both xiangqi players from their red/black participants', () => {
    expect(
      matchupLabel(
        game(XIANGQI_SPEC_ID, [
          participant('red', 'brianhliou-dev'),
          participant('black', 'PikaJieqi - Strong'),
        ]),
      ),
    ).toBe('brianhliou-dev vs PikaJieqi - Strong');
  });

  it('falls back to red/black seat words for xiangqi rows with no name data', () => {
    expect(matchupLabel(game(XIANGQI_SPEC_ID))).toBe('Red vs Black');
  });

  it('brands the Jungle family second seat "Blue" in the fallback matchup', () => {
    expect(matchupLabel(game(JUNGLE_SPEC_ID))).toBe('Red vs Blue');
  });

  it('reads legacy white/black name columns for chess rows without participants', () => {
    expect(matchupLabel({ ...game('fog'), whiteName: 'alice', blackName: 'bob' })).toBe(
      'alice vs bob',
    );
  });

  // Flip variants seat by move order, so a seat word is not a colour claim: naming
  // a nameless banqi seat "Red" is wrong for half of all games. The fallback names
  // the bound ink when the row carries firstColor and the move order when it does
  // not (profile / landing / database feeds never derive it).
  it('names a nameless flip seat by move order when the ink is unknown', () => {
    expect(matchupLabel(game(BANQI_SPEC_ID))).toBe('First vs Second');
    expect(matchupLabel(game(JUNGLE_FLIP_SPEC_ID))).toBe('First vs Second');
  });

  it('names a nameless flip seat by the bound ink once firstColor is known', () => {
    // First-mover seat flipped black, so it is the BLACK player, not "Red".
    expect(matchupLabel({ ...game(BANQI_SPEC_ID), firstColor: 'black' })).toBe('Black vs Red');
    expect(matchupLabel({ ...game(BANQI_SPEC_ID), firstColor: 'red' })).toBe('Red vs Black');
    // The Jungle family brands its dark ink "Blue".
    expect(matchupLabel({ ...game(JUNGLE_FLIP_SPEC_ID), firstColor: 'black' })).toBe('Blue vs Red');
  });

  it('leaves non-flip variants on the literal seat word regardless of firstColor', () => {
    expect(matchupLabel({ ...game(XIANGQI_SPEC_ID), firstColor: 'black' })).toBe('Red vs Black');
  });
});

function game(variant: string, participants?: GameParticipant[]): FeaturedGame {
  return {
    roomId: 'game_test',
    variant,
    mode: 'pvp',
    rated: false,
    result: 'draw',
    termination: 'agreement',
    plyCount: 12,
    whiteName: null,
    blackName: null,
    corpusId: null,
    participants,
  };
}

function participant(color: GameParticipant['color'], displayName: string): GameParticipant {
  return {
    color,
    displayName,
    subjectType: 'user',
    subjectId: null,
    visibility: 'public',
  };
}
