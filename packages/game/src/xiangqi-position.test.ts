import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyStandardXiangqiMove,
  createInitialXiangqiState,
  parseStandardXiangqiFen,
  standardXiangqiEngineFen,
  standardXiangqiFen,
  standardXiangqiPlacementKey,
  standardXiangqiPositionKey,
} from './index.js';

test('standardXiangqiPlacementKey serializes the initial xiangqi board top-to-bottom', () => {
  const state = createInitialXiangqiState('position-key');
  assert.equal(
    standardXiangqiPlacementKey(state),
    'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR',
  );
});

test('standardXiangqiPositionKey includes the side to move', () => {
  const state = createInitialXiangqiState('position-key');
  assert.equal(
    standardXiangqiPositionKey(state),
    'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR r',
  );
  const next = applyStandardXiangqiMove(state, { from: 'h3', to: 'e3' });
  assert.match(standardXiangqiPositionKey(next), / b$/);
});

test('standardXiangqiFen includes progress clock and move number', () => {
  const state = createInitialXiangqiState('position-key');
  assert.equal(
    standardXiangqiFen(state),
    'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR r - - 0 1',
  );
});

test('standardXiangqiEngineFen writes the engine-dialect turn token (w/b)', () => {
  const state = createInitialXiangqiState('engine-fen');
  // Red to move is 'w' (not the position key's 'r'); this is the canonical
  // Fairy-Stockfish / Pikafish xiangqi start FEN.
  assert.equal(
    standardXiangqiEngineFen(state),
    'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1',
  );
  const next = applyStandardXiangqiMove(state, { from: 'h3', to: 'e3' });
  assert.match(standardXiangqiEngineFen(next), / b - - /);
});

test('parseStandardXiangqiFen round-trips the initial position', () => {
  const original = createInitialXiangqiState('round-trip');
  const parsed = parseStandardXiangqiFen(standardXiangqiFen(original));
  assert.ok(parsed.ok);
  assert.equal(standardXiangqiFen(parsed.state), standardXiangqiFen(original));
  assert.deepEqual(parsed.state.board, original.board);
  assert.deepEqual(parsed.state.status, { type: 'playing', turn: 'red' });
});

test('parseStandardXiangqiFen round-trips a mid-game position with clocks', () => {
  let state = createInitialXiangqiState('mid-game');
  state = applyStandardXiangqiMove(state, { from: 'h3', to: 'e3' });
  state = applyStandardXiangqiMove(state, { from: 'h8', to: 'e8' });
  const parsed = parseStandardXiangqiFen(standardXiangqiFen(state));
  assert.ok(parsed.ok);
  assert.equal(standardXiangqiFen(parsed.state), standardXiangqiFen(state));
  assert.equal(parsed.state.progressClock, state.progressClock);
  assert.equal(parsed.state.moveNumber, state.moveNumber);
});

test('parseStandardXiangqiFen accepts the engine dialect (w) and bare placement+turn', () => {
  const engine = parseStandardXiangqiFen(standardXiangqiEngineFen(createInitialXiangqiState('w')));
  assert.ok(engine.ok);
  assert.deepEqual(engine.state.status, { type: 'playing', turn: 'red' });
  const bare = parseStandardXiangqiFen('4k4/9/9/9/9/9/9/9/9/3K5 b');
  assert.ok(bare.ok);
  assert.deepEqual(bare.state.status, { type: 'playing', turn: 'black' });
  assert.equal(bare.state.moveNumber, 1);
  assert.equal(bare.state.progressClock, 0);
});

test('parseStandardXiangqiFen parses a hand-set endgame composition', () => {
  // Red cannon + soldier vs bare general: the composition shape (nothing like
  // this position is reachable via importXiangqiGame from the start).
  const parsed = parseStandardXiangqiFen('3k5/4P4/9/9/9/9/9/4C4/9/4K4 r');
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.state.board.e9, { color: 'red', role: 'soldier' });
  assert.deepEqual(parsed.state.board.e3, { color: 'red', role: 'cannon' });
  assert.deepEqual(parsed.state.board.d10, { color: 'black', role: 'general' });
});

test('parseStandardXiangqiFen names the specific structural defect', () => {
  const cases: Array<[string, RegExp]> = [
    ['9/9/9/9/9/9/9/9/9', /Expected 10 ranks/],
    ['4k4/9/9/9/9/9/9/9/9/3K4', /Rank 1 covers 8 files/],
    ['4k4/9/9/9/9/9/9/9/9/3KK4', /outside the palace|Too many red generals/],
    ['4k4/9/9/9/9/9/9/9/9/9', /Missing the red general/],
    ['4k4/9/9/9/9/PPPPPPPP1/9/9/9/4K4', /Too many red soldiers: 8/],
    ['4k4/9/9/9/9/9/9/9/9/B3K4', /elephant.*not on a legal elephant point/],
    ['4k4/9/9/9/9/9/9/9/9/A4K3', /advisor.*off the palace diagonals/],
    ['4k4/9/9/9/9/9/9/9/4P4/4K4', /soldier on e2 is behind its starting rank/],
    ['4k4/9/9/9/9/9/9/9/9/4K4 x', /Unknown side-to-move/],
  ];
  for (const [fen, pattern] of cases) {
    const parsed = parseStandardXiangqiFen(fen);
    assert.equal(parsed.ok, false, fen);
    assert.match(parsed.ok ? '' : parsed.error, pattern);
  }
});

test('parseStandardXiangqiFen rejects a position where the general is capturable', () => {
  // Generals face each other on the open e-file: the flying-general rule means
  // whoever moves takes the enemy general, so the diagram cannot be real.
  const facing = parseStandardXiangqiFen('4k4/9/9/9/9/9/9/9/9/4K4 r');
  assert.equal(facing.ok, false);
  assert.match(facing.ok ? '' : facing.error, /can capture the general/);
});
