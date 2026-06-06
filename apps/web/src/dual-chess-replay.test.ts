import {
  applyDualChessMove,
  createInitialDualChessState,
  type DualChessMove,
  type DualChessSquare,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { DUAL_CHESS_SAMPLE_GAME } from './dual-chess-sample-game.js';

// The article replay is driven by the real kernel, so the embedded sample game
// must be a legal Crossroads Chess game with the advertised result. This guards
// the move list from drifting out of sync with the rules.
describe('Crossroads Chess sample game', () => {
  const tokens = DUAL_CHESS_SAMPLE_GAME.moves.trim().split(/\s+/);

  it('every token is valid Crossroads Chess move notation', () => {
    for (const tok of tokens) {
      expect(tok, `"${tok}" should match a-f/1-8 from/to`).toMatch(/^[a-f][1-8][a-f][1-8]q?$/);
    }
  });

  it('replays legally through the kernel to a White race win', () => {
    let state = createInitialDualChessState('test');
    tokens.forEach((tok, i) => {
      const move: DualChessMove = {
        from: tok.slice(0, 2) as DualChessSquare,
        to: tok.slice(2, 4) as DualChessSquare,
      };
      const next = applyDualChessMove(state, move, { progressClockLimit: Infinity });
      // applyDualChessMove returns the same state object on an illegal move.
      expect(next, `move ${i + 1} (${tok}) should be legal`).not.toBe(state);
      state = next;
    });
    expect(state.status).toEqual({ type: 'finished', winner: 'white', reason: 'race' });
  });
});
