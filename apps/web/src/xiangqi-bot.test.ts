import {
  applyMove,
  createInitialXiangqiState,
  getLegalMoves,
  type XiangqiGameState,
  type XiangqiMove,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  chooseFairMove,
  chooseHandTunedMove,
  chooseVisibleGreedyMove,
  evaluatePosition,
} from './xiangqi-bot.js';

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

describe('xiangqi fair (fog-of-war) bot', () => {
  it('returns a legal move from the initial position', () => {
    const state = createInitialXiangqiState('fair-init');
    const move = chooseFairMove(state, 'red');
    expect(move).not.toBeNull();
    const legal = getLegalMoves(state);
    expect(legal.some((m) => m.from === move!.from && m.to === move!.to)).toBe(true);
  });

  it("returns null when it isn't the requested side's turn", () => {
    const state = createInitialXiangqiState('fair-turn'); // red to move
    expect(chooseFairMove(state, 'black')).toBeNull();
  });

  it('takes a winning capture when the enemy general is in view', () => {
    // Red chariot on e9 is adjacent to the black general on e10 (Red's own
    // general on e1 keeps the e-file blocked, so this is a plain capture).
    // Black still has a mobile chariot, so the only win is taking the general.
    const state: XiangqiGameState = {
      id: 'fair-win',
      board: {
        e1: { color: 'red', role: 'general' },
        e9: { color: 'red', role: 'chariot' },
        e10: { color: 'black', role: 'general' },
        a10: { color: 'black', role: 'chariot' },
        c8: { color: 'black', role: 'soldier' },
      },
      status: { type: 'playing', turn: 'red' },
      moveNumber: 1,
      progressClock: 0,
      positionCounts: {},
    };
    for (let i = 0; i < 10; i += 1) {
      const move = chooseFairMove(state, 'red');
      expect(move).not.toBeNull();
      expect(`${move!.from}-${move!.to}`).toBe('e9-e10');
    }
  });

  it('refuses to trade a cannon for a horse it can only see is defended through fog', () => {
    // Red cannon b3 can capture the black horse on b8 (screen = red soldier b5).
    // The horse is defended by the black chariot on a8 — but a8 is fogged to Red,
    // so a naive capturer would grab the horse and lose the cannon to recapture.
    // The fair bot should decline: cannon (450) for a horse it can't verify is
    // safe (400, in fog) is a losing trade. Generals are off-file so no flying
    // capture distracts the choice.
    const state: XiangqiGameState = {
      id: 'fair-fog-trade',
      board: {
        d1: { color: 'red', role: 'general' },
        b3: { color: 'red', role: 'cannon' },
        b5: { color: 'red', role: 'soldier' },
        b8: { color: 'black', role: 'horse' },
        a8: { color: 'black', role: 'chariot' },
        f10: { color: 'black', role: 'general' },
      },
      status: { type: 'playing', turn: 'red' },
      moveNumber: 1,
      progressClock: 0,
      positionCounts: {},
    };
    // Sanity: the losing capture really is available to the bot.
    const legal = getLegalMoves(state);
    expect(legal.some((m) => m.from === 'b3' && m.to === 'b8')).toBe(true);

    for (let i = 0; i < 12; i += 1) {
      const move = chooseFairMove(state, 'red');
      expect(move).not.toBeNull();
      expect(`${move!.from}-${move!.to}`).not.toBe('b3-b8');
    }
  });

  it('still grabs a winning capture in fog when the trade favours it', () => {
    // A cheap piece capturing a valuable one wins material even if the square is
    // fogged and the captured piece is defended: soldier (100) takes horse (400).
    const state: XiangqiGameState = {
      id: 'fair-cheap-cap',
      board: {
        d1: { color: 'red', role: 'general' },
        b6: { color: 'red', role: 'soldier' },
        b7: { color: 'black', role: 'horse' },
        a7: { color: 'black', role: 'soldier' },
        f10: { color: 'black', role: 'general' },
      },
      status: { type: 'playing', turn: 'red' },
      moveNumber: 1,
      progressClock: 0,
      positionCounts: {},
    };
    for (let i = 0; i < 10; i += 1) {
      expect(`${chooseFairMove(state, 'red')!.from}-${chooseFairMove(state, 'red')!.to}`).toBe(
        'b6-b7',
      );
    }
  });

  it('always returns a legal move under repeated evaluation (stress)', () => {
    // Repeated calls on a fogged midgame must never throw or return an illegal
    // move for the side to move.
    const state = createInitialXiangqiState('fair-stress');
    const afterRed = applyMove(state, { from: 'b3', to: 'e3' }); // black to move
    const legal = getLegalMoves(afterRed);
    for (let i = 0; i < 15; i += 1) {
      const move = chooseFairMove(afterRed, 'black');
      expect(move).not.toBeNull();
      expect(legal.some((m) => m.from === move!.from && m.to === move!.to)).toBe(true);
    }
  });
});
