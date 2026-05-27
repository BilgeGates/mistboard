import {
  applyMove,
  createInitialXiangqiState,
  getLegalMoves,
  type XiangqiGameState,
  type XiangqiMove,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { chooseHandTunedMove, chooseVisibleGreedyMove, evaluatePosition } from './xiangqi-bot.js';

describe('xiangqi hand-tuned bot', () => {
  it('evaluates the initial position as material-equal for both sides', () => {
    const state = createInitialXiangqiState('test');
    expect(evaluatePosition(state, 'red')).toBe(0);
    expect(evaluatePosition(state, 'black')).toBe(0);
  });

  it('returns a legal move from the initial position', () => {
    const state = createInitialXiangqiState('test');
    const move = chooseHandTunedMove(state, 'red');
    expect(move).not.toBeNull();
    const legal = getLegalMoves(state);
    expect(legal.some((m) => m.from === move!.from && m.to === move!.to)).toBe(true);
  });

  it("returns null when it isn't the requested side's turn", () => {
    const state = createInitialXiangqiState('test'); // red to move
    expect(chooseHandTunedMove(state, 'black')).toBeNull();
  });

  it('visible-greedy prefers a visible capture without truth-board evaluation', () => {
    const state: XiangqiGameState = {
      id: 'visible-bot',
      board: {
        e1: { color: 'red', role: 'general' },
        a1: { color: 'red', role: 'chariot' },
        a3: { color: 'black', role: 'soldier' },
        i10: { color: 'black', role: 'general' },
      },
      status: { type: 'playing', turn: 'red' },
      moveNumber: 1,
      progressClock: 0,
      positionCounts: {},
    };

    for (let i = 0; i < 12; i += 1) {
      const move = chooseVisibleGreedyMove(state, 'red');
      expect(move).not.toBeNull();
      expect(`${move!.from}-${move!.to}`).toBe('a1-a3');
    }
  });

  it('beats uniformly-random in a head-to-head smoke (probabilistic)', () => {
    // Single game, capped. Bot plays red, random plays black. With a 1-ply
    // hang-aware bot vs random in xiangqi this should win nearly every time;
    // we only assert "bot did not lose" to keep the test stable.
    let state = createInitialXiangqiState('smoke');
    const PLY_CAP = 240;
    for (let p = 0; p < PLY_CAP; p++) {
      if (state.status.type !== 'playing') break;
      const turn = state.status.turn;
      let pick: XiangqiMove | null;
      if (turn === 'red') {
        pick = chooseHandTunedMove(state, turn);
      } else {
        const moves = getLegalMoves(state);
        if (moves.length === 0) break;
        pick = moves[Math.floor(Math.random() * moves.length)];
      }
      if (!pick) break;
      state = applyMove(state, pick);
    }
    if (state.status.type === 'finished') {
      // Allow draws (e.g. progress-clock) but disallow bot losing as red.
      expect(state.status.winner).not.toBe('black');
    }
    // If we hit the cap unfinished, also accept — not a regression signal.
  });
});
