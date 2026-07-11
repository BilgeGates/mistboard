import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attemptStandardXiangqiPuzzleLine,
  getStandardXiangqiLegalMoves,
  standardXiangqiPuzzleById,
  standardXiangqiPuzzleMoveEquals,
  standardXiangqiPuzzleMoveLabel,
  standardXiangqiPuzzleSideToMove,
  trimXiangqiWinningAdvantageTail,
  validateStandardXiangqiPuzzle,
  XIANGQI_PUZZLES,
  XIANGQI_SPEC_ID,
  type XiangqiBoard,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiPuzzle,
} from './index.js';
import { MINED_XIANGQI_PUZZLES } from './puzzles-xiangqi-mined.js';

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

// ── Mined corpus (real-game puzzles) ─────────────────────────────────────────
// The miner regenerates puzzles-xiangqi-mined.ts wholesale, so these tests pin
// the corpus contract the web player and daily rotation rely on: unique
// prefix-disjoint ids, known theme vocabulary, 3-7 ply lines ending on the
// solver's move, and a full kernel replay of every solution line.

const MINED_PUZZLES = XIANGQI_PUZZLES.filter((puzzle) => puzzle.id.startsWith('xq-mined-'));

const MINED_THEMES: ReadonlySet<string> = new Set([
  'checkmate',
  'matein1',
  'matein2',
  'matein3',
  'winning',
  'winning-material',
  'crushing',
  'endgame',
  'middlegame',
]);

function minedSolverMoves(puzzle: XiangqiPuzzle): XiangqiMove[] {
  return puzzle.solution.filter((_, ply) => ply % 2 === 0);
}

test('mined corpus: ids unique, themes known, lines 1-7 plies ending on the solver move', () => {
  // Guard against an accidental truncation of the generated module (the exact
  // count moves with every re-mine; the floor should not).
  assert.ok(MINED_PUZZLES.length >= 100, `corpus shrank to ${MINED_PUZZLES.length} puzzles`);
  const ids = new Set<string>();
  for (const puzzle of MINED_PUZZLES) {
    assert.equal(puzzle.variant, XIANGQI_SPEC_ID, puzzle.id);
    assert.equal(ids.has(puzzle.id), false, `duplicate puzzle id ${puzzle.id}`);
    ids.add(puzzle.id);
    // Winning-advantage lines trim to the payoff, which can be a bare 1-ply
    // capture ("win the hanging piece") — a legitimate easy puzzle.
    assert.ok(
      puzzle.solution.length >= 1 && puzzle.solution.length <= 7,
      `${puzzle.id}: solution is ${puzzle.solution.length} plies, expected 1-7`,
    );
    assert.equal(
      puzzle.solution.length % 2,
      1,
      `${puzzle.id}: solution must end on the solver's move`,
    );
    assert.ok(puzzle.themes.length > 0, `${puzzle.id}: no themes`);
    assert.equal(
      new Set(puzzle.themes).size,
      puzzle.themes.length,
      `${puzzle.id}: duplicate themes`,
    );
    for (const theme of puzzle.themes) {
      assert.ok(MINED_THEMES.has(theme), `${puzzle.id}: unknown theme ${theme}`);
    }
    const solver = standardXiangqiPuzzleSideToMove(puzzle);
    assert.ok(solver, `${puzzle.id}: initial state is not playable`);
    if (puzzle.goal.winner) {
      assert.equal(puzzle.goal.winner, solver, `${puzzle.id}: goal winner is not the solver`);
    }
  }
});

test('mined corpus: every solution line kernel-replays to a completed win', () => {
  for (const puzzle of MINED_PUZZLES) {
    const solver = standardXiangqiPuzzleSideToMove(puzzle);
    const attempt = attemptStandardXiangqiPuzzleLine(puzzle, minedSolverMoves(puzzle));
    assert.equal(attempt.ok, true, `${puzzle.id}: ${JSON.stringify(attempt)}`);
    if (!attempt.ok) continue;
    assert.equal(attempt.complete, true, `${puzzle.id}: full solver line did not complete`);
    // Auto-played defender replies must be exactly the scripted ones, so the
    // whole played line reproduces the solution (opponent-reply determinism).
    assert.deepEqual(attempt.playedMoves, puzzle.solution, `${puzzle.id}: line diverged`);
    if (puzzle.goal.type === 'checkmate') {
      assert.equal(attempt.state.status.type, 'finished', `${puzzle.id}: no mate delivered`);
      if (attempt.state.status.type === 'finished') {
        assert.equal(attempt.state.status.winner, solver, `${puzzle.id}: wrong winner`);
        assert.ok(
          attempt.state.status.reason === 'checkmate' ||
            attempt.state.status.reason === 'stalemate',
          `${puzzle.id}: unexpected finish reason ${attempt.state.status.reason}`,
        );
      }
    } else {
      // A winning-advantage payoff leaves the game in progress by construction.
      assert.equal(
        attempt.state.status.type,
        'playing',
        `${puzzle.id}: winning-advantage line should not finish the game`,
      );
    }
  }
});

test('mined corpus: a partial line auto-plays exactly the scripted defender reply', () => {
  for (const puzzle of MINED_PUZZLES) {
    // A 1-ply "win the hanging piece" puzzle completes on the first move and has
    // no defender reply to auto-play; this test is about the 3+ ply lines.
    if (puzzle.solution.length < 3) continue;
    const first = puzzle.solution[0] as XiangqiMove;
    const attempt = attemptStandardXiangqiPuzzleLine(puzzle, [first]);
    assert.equal(attempt.ok, true, `${puzzle.id}: correct first move rejected`);
    if (!attempt.ok) continue;
    // Lines are 3+ plies, so one solver move never completes the puzzle and the
    // scripted defender reply must have been applied deterministically.
    assert.equal(attempt.complete, false, `${puzzle.id}: completed after one move`);
    assert.deepEqual(
      attempt.playedMoves,
      puzzle.solution.slice(0, 2),
      `${puzzle.id}: defender reply diverged from the script`,
    );
    assert.equal(attempt.state.status.type, 'playing', puzzle.id);
    if (attempt.state.status.type === 'playing') {
      assert.equal(
        attempt.state.status.turn,
        standardXiangqiPuzzleSideToMove(puzzle),
        `${puzzle.id}: turn should be back with the solver`,
      );
    }
  }
});

test('mined corpus: a legal non-solution first move is rejected without advancing (sample)', () => {
  let exercised = 0;
  for (const puzzle of MINED_PUZZLES.slice(0, 24)) {
    const legal = getStandardXiangqiLegalMoves(puzzle.initial);
    const solutionFirst = puzzle.solution[0] as XiangqiMove;
    const wrong = legal.find((move) => !standardXiangqiPuzzleMoveEquals(move, solutionFirst));
    if (!wrong) continue; // only-move positions have no legal alternative
    exercised += 1;
    const attempt = attemptStandardXiangqiPuzzleLine(puzzle, [wrong]);
    assert.equal(attempt.ok, false, `${puzzle.id}: wrong move accepted`);
    if (attempt.ok) continue;
    assert.equal(attempt.code, 'incorrect-move', puzzle.id);
    assert.equal(attempt.ply, 0, puzzle.id);
    assert.deepEqual(attempt.state.status, puzzle.initial.status, puzzle.id);
  }
  assert.ok(exercised >= 10, `only ${exercised} sample puzzles had a legal alternative`);
});

// ── Winning-advantage filler-tail trimming ──────────────────────────────────

const FILLER_TAIL_ID = 'xq-mined-hxq_d8fd1a1f9494472b246efff9-35';

test('winning-advantage tail: the raw mined 038 line has a quiet non-forced tail (regression)', () => {
  // The raw miner output ends on a8-c9 (ply 6), a quiet horse move played after
  // the material is already won on f7-d6 (ply 4). This is the exact shape the
  // player reported: a forced-looking puzzle whose last move is arbitrary.
  const raw = MINED_XIANGQI_PUZZLES.find((puzzle) => puzzle.id === FILLER_TAIL_ID);
  assert.ok(raw, `${FILLER_TAIL_ID} missing from the raw mined corpus`);
  if (!raw) return;
  assert.equal(raw.solution.length, 7, 'expected the raw line to carry the filler tail');
  const rawLast = raw.solution[raw.solution.length - 1] as XiangqiMove;
  assert.deepEqual({ from: rawLast.from, to: rawLast.to }, { from: 'a8', to: 'c9' });
  // A quiet tail is exactly what the validator now rejects.
  const result = validateStandardXiangqiPuzzle(raw as XiangqiPuzzle);
  assert.equal(result.ok, false, 'raw filler-tail line should fail validation');
  if (!result.ok) assert.equal(result.issue.code, 'winning-advantage-filler-tail');
});

test('winning-advantage tail: the SERVED 038 puzzle ends on the payoff capture', () => {
  const served = standardXiangqiPuzzleById(FILLER_TAIL_ID);
  assert.ok(served, `${FILLER_TAIL_ID} should still ship after trimming`);
  if (!served) return;
  assert.equal(served.solution.length, 5, 'served line should be trimmed to the payoff');
  const last = served.solution[served.solution.length - 1] as XiangqiMove;
  assert.deepEqual({ from: last.from, to: last.to }, { from: 'f7', to: 'd6' });
  // The trimmed line captures on its final move and is a valid, playable puzzle.
  assert.ok(served.initial.board.d6, 'payoff move should land on an occupied square');
  assert.equal(validateStandardXiangqiPuzzle(served).ok, true);
});

test('winning-advantage tail: every served winning-advantage line ends on a capture', () => {
  // The whole served corpus is in trimmed normal form: no winning-advantage
  // puzzle ends on a quiet move that follows an earlier capture.
  for (const puzzle of XIANGQI_PUZZLES) {
    if (puzzle.goal.type !== 'winning-advantage') continue;
    const result = validateStandardXiangqiPuzzle(puzzle);
    assert.equal(result.ok, true, `${puzzle.id}: ${result.ok ? '' : result.issue.code}`);
    // Idempotence: trimming an already-normalized line changes nothing.
    assert.equal(
      trimXiangqiWinningAdvantageTail(puzzle).solution.length,
      puzzle.solution.length,
      `${puzzle.id}: served line was not in trimmed normal form`,
    );
  }
});

test('winning-advantage tail: trimming never touches checkmate puzzles', () => {
  for (const puzzle of MINED_XIANGQI_PUZZLES) {
    if (puzzle.goal.type !== 'checkmate') continue;
    // A mate line can legitimately end on a non-capturing mating move.
    assert.equal(
      trimXiangqiWinningAdvantageTail(puzzle as XiangqiPuzzle).solution.length,
      puzzle.solution.length,
      `${puzzle.id}: a checkmate line was trimmed`,
    );
  }
});

test('mined puzzles carry source-game attribution for the "From game" card', () => {
  for (const puzzle of MINED_XIANGQI_PUZZLES) {
    const source = puzzle.sourceGame;
    assert.ok(source?.gameId, `${puzzle.id}: missing sourceGame.gameId`);
    assert.equal(typeof source.ply, 'number', `${puzzle.id}: missing sourceGame.ply`);
    // The whole corpus was db-mined, so every puzzle should carry the event and
    // both player names it was backfilled with — that is what the card renders.
    assert.ok(source.event, `${puzzle.id}: missing sourceGame.event`);
    assert.ok(source.redName, `${puzzle.id}: missing sourceGame.redName`);
    assert.ok(source.blackName, `${puzzle.id}: missing sourceGame.blackName`);
  }
});
