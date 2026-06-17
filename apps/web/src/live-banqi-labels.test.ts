import { describe, expect, it } from 'vitest';
import { type BanqiWireView, banqiSeatInk } from './live-banqi.js';

// The bug: banqi seats are first/second mover ('red' seat = first), but the ink is bound by
// the opening flip. Labeling by seat showed the engine (first-mover 'red' seat) as "Red"
// even when its first flip was black. banqiSeatInk maps a seat to its ACTUAL ink.

function viewWithFirstColor(firstColor: BanqiWireView['firstColor']): BanqiWireView {
  return {
    id: 'bq_test',
    perspective: 'red',
    board: {},
    legalMoves: [],
    captured: [],
    status: { type: 'playing', turn: 'red' },
    ply: 1,
    firstColor,
    moveNumber: 1,
  };
}

describe('banqiSeatInk maps a seat to its flip-bound ink', () => {
  it('returns null before the opening flip binds (and for a null view)', () => {
    expect(banqiSeatInk('red', null)).toBe(null);
    expect(banqiSeatInk('red', viewWithFirstColor(null))).toBe(null);
    expect(banqiSeatInk('black', viewWithFirstColor(null))).toBe(null);
  });

  it('first-mover seat plays firstColor; second-mover plays the opposite', () => {
    // The reported case: the engine in the first-mover ('red') seat flips BLACK → its ink is
    // black, not "Red".
    const blackFlip = viewWithFirstColor('black');
    expect(banqiSeatInk('red', blackFlip)).toBe('black');
    expect(banqiSeatInk('black', blackFlip)).toBe('red');

    const redFlip = viewWithFirstColor('red');
    expect(banqiSeatInk('red', redFlip)).toBe('red');
    expect(banqiSeatInk('black', redFlip)).toBe('black');
  });
});
