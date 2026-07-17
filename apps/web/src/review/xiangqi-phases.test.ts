// The xiangqi phase heuristic: middlegame on real contact (2 captures / a
// non-soldier capture / the ply-17 development budget), endgame when total
// attackers (chariots+cannons+horses) thin to <= 5. Boards are synthesized by
// role multiset — the heuristic only counts roles.
import type { XiangqiGameState, XiangqiPieceRole } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { type GameAnalysis, playerPhaseAccuracies } from './game-analysis.js';
import { xiangqiGamePhases } from './xiangqi-phases.js';

const SIDE: XiangqiPieceRole[] = [
  ...Array<XiangqiPieceRole>(5).fill('soldier'),
  'chariot',
  'chariot',
  'cannon',
  'cannon',
  'horse',
  'horse',
  'elephant',
  'elephant',
  'advisor',
  'advisor',
  'general',
];

function stateWith(roles: readonly XiangqiPieceRole[]): XiangqiGameState {
  const board: Record<string, { color: 'red' | 'black'; role: XiangqiPieceRole }> = {};
  roles.forEach((role, i) => {
    board[`x${i}`] = { color: i % 2 === 0 ? 'red' : 'black', role };
  });
  return { board } as unknown as XiangqiGameState;
}

const fullBoard = (): XiangqiPieceRole[] => [...SIDE, ...SIDE];

function without(roles: XiangqiPieceRole[], ...removed: XiangqiPieceRole[]): XiangqiPieceRole[] {
  const next = [...roles];
  for (const role of removed) {
    const i = next.indexOf(role);
    if (i >= 0) next.splice(i, 1);
  }
  return next;
}

describe('xiangqiGamePhases', () => {
  it('returns nothing for an empty or one-position game', () => {
    expect(xiangqiGamePhases([])).toEqual({});
    expect(xiangqiGamePhases([stateWith(fullBoard())])).toEqual({});
  });

  it('finds no middlegame in a short quiet game', () => {
    const truths = Array.from({ length: 10 }, () => stateWith(fullBoard()));
    expect(xiangqiGamePhases(truths)).toEqual({ middle: undefined, end: undefined });
  });

  it('starts the middlegame at ply 17 when nothing is captured', () => {
    const truths = Array.from({ length: 24 }, () => stateWith(fullBoard()));
    expect(xiangqiGamePhases(truths).middle).toBe(17);
  });

  it('a single soldier trade stays opening; the second capture starts the middlegame', () => {
    const full = fullBoard();
    const oneSoldierDown = without(full, 'soldier');
    const twoSoldiersDown = without(full, 'soldier', 'soldier');
    const truths = [
      stateWith(full), // start
      stateWith(full),
      stateWith(oneSoldierDown), // ply 2: first soldier capture — still opening
      stateWith(oneSoldierDown),
      stateWith(twoSoldiersDown), // ply 4: second capture — contact
      stateWith(twoSoldiersDown),
    ];
    expect(xiangqiGamePhases(truths).middle).toBe(4);
  });

  it('a non-soldier capture starts the middlegame immediately', () => {
    const full = fullBoard();
    const horseDown = without(full, 'horse');
    const truths = [stateWith(full), stateWith(full), stateWith(horseDown)];
    expect(xiangqiGamePhases(truths).middle).toBe(2);
  });

  it('starts the endgame when total attackers thin to five', () => {
    const full = fullBoard();
    // 12 attackers initially; strip 7 (leaves 5) => endgame.
    const thinned = without(
      full,
      'chariot',
      'chariot',
      'chariot',
      'cannon',
      'cannon',
      'horse',
      'horse',
    );
    const truths = [
      stateWith(full),
      stateWith(without(full, 'horse')), // ply 1: contact -> middlegame
      stateWith(thinned), // ply 2: attackers <= 5 -> endgame
    ];
    expect(xiangqiGamePhases(truths)).toEqual({ middle: 1, end: 2 });
  });
});

describe('playerPhaseAccuracies', () => {
  const analysis = {
    moves: [
      { ply: 1, mover: 'red', judgment: null, accuracy: 100 },
      { ply: 2, mover: 'black', judgment: null, accuracy: 90 },
      { ply: 3, mover: 'red', judgment: null, accuracy: 80 },
      { ply: 4, mover: 'black', judgment: null, accuracy: 70 },
      { ply: 5, mover: 'red', judgment: null, accuracy: 60 },
      { ply: 6, mover: 'black', judgment: null, accuracy: 50 },
    ],
    chancePlies: [],
  } as unknown as GameAnalysis;

  it('splits move accuracies at the phase boundaries', () => {
    // middle=3, end=5: opening = plies 1-2, middlegame = 3-4, endgame = 5-6.
    expect(playerPhaseAccuracies(analysis, { middle: 3, end: 5 }, 'red')).toEqual({
      opening: 100,
      middlegame: 80,
      endgame: 60,
    });
    expect(playerPhaseAccuracies(analysis, { middle: 3, end: 5 }, 'black')).toEqual({
      opening: 90,
      middlegame: 70,
      endgame: 50,
    });
  });

  it('treats a game with no middlegame as all opening', () => {
    expect(playerPhaseAccuracies(analysis, {}, 'red')).toEqual({ opening: 80 });
  });

  it('omits a phase the player never moved in', () => {
    // middle=6: black's only middlegame move is ply 6; red has none.
    const result = playerPhaseAccuracies(analysis, { middle: 6 }, 'red');
    expect(result.middlegame).toBeUndefined();
    expect(result.opening).toBe(80); // mean of red's plies 1, 3, 5 (100, 80, 60)
  });
});
