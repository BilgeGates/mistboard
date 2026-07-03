import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  attemptFortressXiangqiPuzzleLine,
  FORTRESS_XIANGQI_PUZZLES,
  findFortressXiangqiMateInOneCandidates,
  fortressXiangqiPuzzleById,
  fortressXiangqiPuzzleMoveEquals,
  fortressXiangqiPuzzleMoveLabel,
  fortressXiangqiPuzzleNextMove,
  fortressXiangqiPuzzleSideToMove,
  isFortressXiangqiPuzzleSolverPly,
  validateFortressXiangqiPuzzle,
} from './puzzles-fortress-xiangqi.js';
import {
  createInitialFortressXiangqiState,
  type FortressXiangqiMove,
} from './variants-fortress-xiangqi.js';

test('no forced mate-in-one exists from the opening position', () => {
  const state = createInitialFortressXiangqiState('opening');
  assert.equal(findFortressXiangqiMateInOneCandidates(state).length, 0);
});

test('the mate-in-one finder skips finished positions', () => {
  const state = createInitialFortressXiangqiState('finished');
  const finished = {
    ...state,
    status: { type: 'finished', winner: 'red', reason: 'resignation' } as const,
  };
  assert.equal(findFortressXiangqiMateInOneCandidates(finished).length, 0);
});

test('move helpers format and compare board and drop moves', () => {
  const board: FortressXiangqiMove = { from: 'c6', to: 'c8' };
  const drop: FortressXiangqiMove = { drop: 'chariot', to: 'd4' };
  assert.equal(fortressXiangqiPuzzleMoveLabel(board), 'c6-c8');
  assert.equal(fortressXiangqiPuzzleMoveLabel(drop), 'R@d4');
  assert.ok(fortressXiangqiPuzzleMoveEquals(board, { from: 'c6', to: 'c8' }));
  assert.ok(!fortressXiangqiPuzzleMoveEquals(board, { from: 'c6', to: 'c7' }));
  assert.ok(fortressXiangqiPuzzleMoveEquals(drop, { drop: 'chariot', to: 'd4' }));
  assert.ok(!fortressXiangqiPuzzleMoveEquals(drop, { drop: 'cannon', to: 'd4' }));
  assert.ok(!fortressXiangqiPuzzleMoveEquals(drop, { from: 'c6', to: 'd4' }));
});

test('solver plies are the even indices', () => {
  assert.ok(isFortressXiangqiPuzzleSolverPly(0));
  assert.ok(!isFortressXiangqiPuzzleSolverPly(1));
  assert.ok(isFortressXiangqiPuzzleSolverPly(2));
});

test('every shipped Fortress puzzle validates as a forced mate', () => {
  for (const puzzle of FORTRESS_XIANGQI_PUZZLES) {
    const result = validateFortressXiangqiPuzzle(puzzle);
    assert.ok(result.ok, `${puzzle.id} invalid: ${result.ok ? '' : result.issue.message}`);
    assert.equal(fortressXiangqiPuzzleById(puzzle.id), puzzle);
    assert.equal(fortressXiangqiPuzzleSideToMove(puzzle), puzzle.goal.winner ?? null);
    assert.equal(fortressXiangqiPuzzleNextMove(puzzle, 0), puzzle.solution[0] ?? null);
  }
});

test('the exact solution line completes every shipped puzzle', () => {
  for (const puzzle of FORTRESS_XIANGQI_PUZZLES) {
    const solverMoves = puzzle.solution.filter((_, index) => index % 2 === 0);
    const attempt = attemptFortressXiangqiPuzzleLine(puzzle, solverMoves);
    assert.ok(attempt.ok, `${puzzle.id} solver line rejected`);
    assert.ok(attempt.ok && attempt.complete, `${puzzle.id} solver line did not complete`);
  }
});

test('a wrong first move is rejected for every shipped puzzle', () => {
  for (const puzzle of FORTRESS_XIANGQI_PUZZLES) {
    const wrong: FortressXiangqiMove = { from: 'a1', to: 'a1' };
    const attempt = attemptFortressXiangqiPuzzleLine(puzzle, [wrong]);
    assert.ok(!attempt.ok, `${puzzle.id} accepted a bogus move`);
  }
});

test('an empty solution fails validation', () => {
  const [first] = FORTRESS_XIANGQI_PUZZLES;
  if (!first) return; // corpus not yet generated
  const result = validateFortressXiangqiPuzzle({ ...first, solution: [] });
  assert.ok(!result.ok);
  assert.ok(!result.ok && result.issue.code === 'empty-solution');
});
