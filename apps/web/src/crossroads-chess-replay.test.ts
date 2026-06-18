import {
  applyCrossroadsChessOpenMove,
  type CrossroadsChessMove,
  type CrossroadsChessSquare,
  createInitialCrossroadsChessState,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { CROSSROADS_CHESS_SAMPLE_GAME } from './crossroads-chess-sample-game.js';

// The article replay is driven by the real kernel, so the embedded sample game
// must be a legal Crossroads Chess game with the advertised result. This guards
// the move list from drifting out of sync with the rules.
describe('Crossroads Chess sample game', () => {
  const tokens = CROSSROADS_CHESS_SAMPLE_GAME.moves.trim().split(/\s+/);

  it('every token is valid Crossroads Chess move notation', () => {
    for (const tok of tokens) {
      expect(tok, `"${tok}" should match a-f/1-8 from/to`).toMatch(/^[a-f][1-8][a-f][1-8]q?$/);
    }
  });

  it('replays legally through the kernel to a White race win', () => {
    let state = createInitialCrossroadsChessState('test');
    tokens.forEach((tok, i) => {
      const move: CrossroadsChessMove = {
        from: tok.slice(0, 2) as CrossroadsChessSquare,
        to: tok.slice(2, 4) as CrossroadsChessSquare,
      };
      const next = applyCrossroadsChessOpenMove(state, move, { progressClockLimit: Infinity });
      // applyCrossroadsChessOpenMove returns the same state object on an illegal move.
      expect(next, `move ${i + 1} (${tok}) should be legal`).not.toBe(state);
      state = next;
    });
    expect(state.status).toEqual({ type: 'finished', winner: 'white', reason: 'race' });
  });
});
