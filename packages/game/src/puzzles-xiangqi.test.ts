import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attemptStandardXiangqiPuzzleLine,
  standardXiangqiPuzzleById,
  standardXiangqiPuzzleMoveEquals,
  standardXiangqiPuzzleMoveLabel,
  standardXiangqiPuzzleSideToMove,
  validateStandardXiangqiPuzzle,
  XIANGQI_PUZZLES,
  XIANGQI_SPEC_ID,
  type XiangqiBoard,
  type XiangqiGameState,
  type XiangqiPuzzle,
} from './index.js';

function playingState(
  id: string,
  board: XiangqiBoard,
  turn: 'red' | 'black' = 'red',
): XiangqiGameState {
  return {
    id,
    board,
    status: { type: 'playing', turn },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
}

// Red mates in one: h8-h10 checks along rank 10; the a9 chariot covers the e9
// flight square, and d10/f10 stay attacked from h10 once e10 empties.
function mateInOnePuzzle(overrides: Partial<XiangqiPuzzle> = {}): XiangqiPuzzle {
  return {
    id: 'xq-test-mate-in-1',
    variant: XIANGQI_SPEC_ID,
    title: 'Red mate in 1',
    initial: playingState('xq-test-mate-in-1', {
      d1: { color: 'red', role: 'general' },
      a9: { color: 'red', role: 'chariot' },
      h8: { color: 'red', role: 'chariot' },
      e10: { color: 'black', role: 'general' },
    }),
    solution: [{ from: 'h8', to: 'h10' }],
    goal: { type: 'checkmate', winner: 'red' },
    themes: ['checkmate', 'matein1', 'endgame'],
    ...overrides,
  };
}

// Red mates in two: b1-b9 checks along rank 9 (a8 covers e8, so e10 is black's
// only reply), then a8-a10 mates along rank 10 (b9 covers the e9 flight).
function mateInTwoPuzzle(overrides: Partial<XiangqiPuzzle> = {}): XiangqiPuzzle {
  return {
    id: 'xq-test-mate-in-2',
    variant: XIANGQI_SPEC_ID,
    title: 'Red mate in 2',
    initial: playingState('xq-test-mate-in-2', {
      d1: { color: 'red', role: 'general' },
      a8: { color: 'red', role: 'chariot' },
      b1: { color: 'red', role: 'chariot' },
      e9: { color: 'black', role: 'general' },
    }),
    solution: [
      { from: 'b1', to: 'b9' },
      { from: 'e9', to: 'e10' },
      { from: 'a8', to: 'a10' },
    ],
    goal: { type: 'checkmate', winner: 'red' },
    themes: ['checkmate', 'matein2', 'endgame'],
    ...overrides,
  };
}

test('registry: curated + mined puzzles all validate and resolve by id', () => {
  for (const puzzle of XIANGQI_PUZZLES) {
    const result = validateStandardXiangqiPuzzle(puzzle);
    assert.equal(result.ok, true, `${puzzle.id}: ${JSON.stringify(result)}`);
    assert.equal(standardXiangqiPuzzleById(puzzle.id), puzzle);
  }
  assert.equal(standardXiangqiPuzzleById('xq-not-a-puzzle'), null);
});

test('validate accepts a legal mate-in-1 line', () => {
  const result = validateStandardXiangqiPuzzle(mateInOnePuzzle());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.solver, 'red');
    assert.equal(result.plyCount, 1);
    assert.deepEqual(result.finalStatus, {
      type: 'finished',
      winner: 'red',
      reason: 'checkmate',
    });
  }
});

test('validate accepts a legal mate-in-2 line with a forced defender reply', () => {
  const result = validateStandardXiangqiPuzzle(mateInTwoPuzzle());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.plyCount, 3);
    assert.deepEqual(result.finalStatus, {
      type: 'finished',
      winner: 'red',
      reason: 'checkmate',
    });
  }
});

test('validate rejects an empty solution and a non-playing initial state', () => {
  const empty = validateStandardXiangqiPuzzle(mateInOnePuzzle({ solution: [] }));
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.issue.code, 'empty-solution');

  const finished = mateInOnePuzzle();
  finished.initial = {
    ...finished.initial,
    status: { type: 'finished', winner: 'red', reason: 'checkmate' },
  };
  const result = validateStandardXiangqiPuzzle(finished);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.code, 'not-playing');
});

test('validate rejects an illegal move in the line', () => {
  const result = validateStandardXiangqiPuzzle(
    mateInOnePuzzle({ solution: [{ from: 'h8', to: 'g10' }] }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.issue.code, 'illegal-move');
    assert.equal(result.issue.ply, 0);
  }
});

test('validate rejects a mate goal whose line does not finish the game', () => {
  const result = validateStandardXiangqiPuzzle(
    mateInOnePuzzle({ solution: [{ from: 'h8', to: 'h9' }] }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.code, 'solution-ended-before-goal');
});

test('validate rejects a winning-advantage line that ends on the defender move', () => {
  const result = validateStandardXiangqiPuzzle(
    mateInOnePuzzle({
      goal: { type: 'winning-advantage', winner: 'red', centipawns: 400 },
      solution: [
        { from: 'h8', to: 'h9' },
        { from: 'e10', to: 'f10' },
      ],
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.code, 'solution-must-end-on-solver-move');
});

test('validate accepts an odd-length winning-advantage line and reports a playing finish', () => {
  const result = validateStandardXiangqiPuzzle(
    mateInOnePuzzle({
      goal: { type: 'winning-advantage', winner: 'red', centipawns: 400 },
      solution: [
        { from: 'h8', to: 'h9' },
        { from: 'e10', to: 'f10' },
        { from: 'h9', to: 'i9' },
      ],
    }),
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.finalStatus.type, 'playing');
});

test('attempt: a correct solver move auto-applies the scripted defender reply', () => {
  const attempt = attemptStandardXiangqiPuzzleLine(mateInTwoPuzzle(), [{ from: 'b1', to: 'b9' }]);
  assert.equal(attempt.ok, true);
  if (attempt.ok) {
    assert.equal(attempt.complete, false);
    assert.deepEqual(attempt.playedMoves, [
      { from: 'b1', to: 'b9' },
      { from: 'e9', to: 'e10' },
    ]);
    assert.deepEqual(attempt.solverMoves, [{ from: 'b1', to: 'b9' }]);
    assert.deepEqual(attempt.state.status, { type: 'playing', turn: 'red' });
  }
});

test('attempt: the full solver line completes the mate', () => {
  const attempt = attemptStandardXiangqiPuzzleLine(mateInTwoPuzzle(), [
    { from: 'b1', to: 'b9' },
    { from: 'a8', to: 'a10' },
  ]);
  assert.equal(attempt.ok, true);
  if (attempt.ok) {
    assert.equal(attempt.complete, true);
    assert.deepEqual(attempt.state.status, {
      type: 'finished',
      winner: 'red',
      reason: 'checkmate',
    });
  }
});

test('attempt: a wrong solver move fails without advancing the state', () => {
  const attempt = attemptStandardXiangqiPuzzleLine(mateInTwoPuzzle(), [{ from: 'b1', to: 'b5' }]);
  assert.equal(attempt.ok, false);
  if (!attempt.ok) {
    assert.equal(attempt.code, 'incorrect-move');
    assert.equal(attempt.ply, 0);
    assert.deepEqual(attempt.move, { from: 'b1', to: 'b5' });
    assert.deepEqual(attempt.state.status, { type: 'playing', turn: 'red' });
  }
});

test('attempt: extra moves past the solution fail as line-too-long', () => {
  const attempt = attemptStandardXiangqiPuzzleLine(mateInOnePuzzle(), [
    { from: 'h8', to: 'h10' },
    { from: 'a9', to: 'a10' },
  ]);
  assert.equal(attempt.ok, false);
  if (!attempt.ok) assert.equal(attempt.code, 'line-too-long');
});

test('attempt: a winning-advantage puzzle completes when the scripted line is exhausted', () => {
  const puzzle = mateInOnePuzzle({
    goal: { type: 'winning-advantage', winner: 'red', centipawns: 400 },
    solution: [
      { from: 'h8', to: 'h9' },
      { from: 'e10', to: 'f10' },
      { from: 'h9', to: 'i9' },
    ],
  });
  const attempt = attemptStandardXiangqiPuzzleLine(puzzle, [
    { from: 'h8', to: 'h9' },
    { from: 'h9', to: 'i9' },
  ]);
  assert.equal(attempt.ok, true);
  if (attempt.ok) {
    assert.equal(attempt.complete, true);
    assert.equal(attempt.state.status.type, 'playing');
  }
});

test('helpers: side to move, move equality, move labels', () => {
  const puzzle = mateInTwoPuzzle();
  assert.equal(standardXiangqiPuzzleSideToMove(puzzle), 'red');
  assert.equal(
    standardXiangqiPuzzleMoveEquals({ from: 'b1', to: 'b9' }, { from: 'b1', to: 'b9' }),
    true,
  );
  assert.equal(
    standardXiangqiPuzzleMoveEquals({ from: 'b1', to: 'b9' }, { from: 'b1', to: 'b8' }),
    false,
  );
  assert.equal(standardXiangqiPuzzleMoveLabel({ from: 'b1', to: 'b9' }), 'b1-b9');
});
