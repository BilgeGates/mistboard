import { describe, expect, it } from 'vitest';
import { compactReplayClockSidesForOrientation } from './replay.js';

describe('compactReplayClockSidesForOrientation', () => {
  it('puts the side facing the top of a white-oriented board above the board', () => {
    expect(compactReplayClockSidesForOrientation('white')).toEqual({
      top: 'black',
      bottom: 'white',
    });
  });

  it('puts the side facing the bottom of a black-oriented board below the board', () => {
    expect(compactReplayClockSidesForOrientation('black')).toEqual({
      top: 'white',
      bottom: 'black',
    });
  });
});
