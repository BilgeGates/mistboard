import type { BanqiPlayerView } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { banqiClickResult } from './live-banqi-interaction.js';

// banqiClickResult is pure and reads only status, legalMoves, board, firstColor.
// A hand-built view keeps the cases deterministic: red is to move with one
// revealed red chariot (c2) that can step to c3, a still-face-down tile (d4),
// and the opponent's revealed soldier (e2). firstColor is bound to red, so the
// red SEAT owns the red ink.
const view: BanqiPlayerView = {
  id: 'click',
  perspective: 'red',
  board: {
    c2: { color: 'red', role: 'chariot', faceDown: false },
    e2: { color: 'black', role: 'soldier', faceDown: false },
    d4: { faceDown: true },
  },
  legalMoves: [
    { from: 'd4', to: 'd4' }, // a flip (self-move)
    { from: 'c2', to: 'c3' }, // a board move for the red chariot
  ],
  captured: [],
  status: { type: 'playing', turn: 'red' },
  ply: 4,
  firstColor: 'red',
  moveNumber: 3,
};

describe('banqiClickResult', () => {
  it('does nothing off-turn', () => {
    expect(banqiClickResult(view, 'black', null, 'c2')).toEqual({ kind: 'noop' });
    expect(banqiClickResult(view, 'spectator', null, 'd4')).toEqual({ kind: 'noop' });
  });

  it('flips a face-down tile directly (one click, no selection)', () => {
    expect(banqiClickResult(view, 'red', null, 'd4')).toEqual({
      kind: 'move',
      move: { from: 'd4', to: 'd4' },
    });
  });

  it('flips a face-down tile even while another piece is selected', () => {
    expect(banqiClickResult(view, 'red', 'c2', 'd4')).toEqual({
      kind: 'move',
      move: { from: 'd4', to: 'd4' },
    });
  });

  it('selects your own revealed piece that has a board move', () => {
    expect(banqiClickResult(view, 'red', null, 'c2')).toEqual({ kind: 'select', square: 'c2' });
  });

  it('refuses to select an opponent or empty square', () => {
    expect(banqiClickResult(view, 'red', null, 'e2')).toEqual({ kind: 'noop' }); // black soldier
    expect(banqiClickResult(view, 'red', null, 'a1')).toEqual({ kind: 'noop' }); // empty
  });

  it('clears when re-clicking the selected square', () => {
    expect(banqiClickResult(view, 'red', 'c2', 'c2')).toEqual({ kind: 'clear' });
  });

  it('moves when clicking a legal destination of the selected piece', () => {
    expect(banqiClickResult(view, 'red', 'c2', 'c3')).toEqual({
      kind: 'move',
      move: { from: 'c2', to: 'c3' },
    });
  });

  it('clears on a dead square that is neither a target nor own piece', () => {
    // e2 is the opponent and not a legal c2 destination → clear.
    expect(banqiClickResult(view, 'red', 'c2', 'e2')).toEqual({ kind: 'clear' });
  });
});
