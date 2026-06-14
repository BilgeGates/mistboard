import { createInitialJieqiState, getJieqiPlayerView } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { jieqiClickResult } from './live-jieqi-interaction.js';

describe('jieqiClickResult', () => {
  // Red to move at the start; a1 is red's (face-down) corner with legal moves.
  const view = getJieqiPlayerView(createInitialJieqiState('click'), 'red');

  it('does nothing off-turn', () => {
    expect(jieqiClickResult(view, 'black', null, 'a1')).toEqual({ kind: 'noop' });
    expect(jieqiClickResult(view, 'spectator', null, 'a1')).toEqual({ kind: 'noop' });
  });

  it('selects your own face-down piece (identity unknown, still movable)', () => {
    expect(jieqiClickResult(view, 'red', null, 'a1')).toEqual({ kind: 'select', square: 'a1' });
  });

  it('refuses to select an opponent or empty square', () => {
    expect(jieqiClickResult(view, 'red', null, 'a10')).toEqual({ kind: 'noop' }); // black piece
    expect(jieqiClickResult(view, 'red', null, 'e5')).toEqual({ kind: 'noop' }); // empty
  });

  it('clears when re-clicking the selected square', () => {
    expect(jieqiClickResult(view, 'red', 'a1', 'a1')).toEqual({ kind: 'clear' });
  });

  it('moves when clicking a legal destination', () => {
    expect(jieqiClickResult(view, 'red', 'a1', 'a2')).toEqual({
      kind: 'move',
      move: { from: 'a1', to: 'a2' },
    });
  });

  it('reselects when clicking another own piece, clears on a dead square', () => {
    // c1 is another own piece with legal moves (not an a1 destination).
    expect(jieqiClickResult(view, 'red', 'a1', 'c1')).toEqual({ kind: 'select', square: 'c1' });
    // a10 is the opponent and not a legal a1 destination → clear.
    expect(jieqiClickResult(view, 'red', 'a1', 'a10')).toEqual({ kind: 'clear' });
  });
});
