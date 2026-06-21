import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyMiniXiangqiMove,
  computeMiniXiangqiVision,
  createInitialMiniXiangqiBoard,
  createInitialMiniXiangqiState,
  getMiniXiangqiLegalMoves,
  getMiniXiangqiLegalMovesFrom,
  getMiniXiangqiPlayerView,
  isMiniXiangqiLegalMove,
  type MiniXiangqiBoard,
  type MiniXiangqiGameState,
  type MiniXiangqiMove,
  miniXiangqiPositionRepetitionKey,
} from './variants-mini-xiangqi.js';

test('initial board uses Mini Xiangqi 7x7 setup', () => {
  const board = createInitialMiniXiangqiBoard();

  assert.equal(Object.keys(board).length, 24);
  assert.deepEqual(board.a1, { color: 'red', role: 'chariot' });
  assert.deepEqual(board.b1, { color: 'red', role: 'cannon' });
  assert.deepEqual(board.c1, { color: 'red', role: 'horse' });
  assert.deepEqual(board.d1, { color: 'red', role: 'general' });
  assert.deepEqual(board.e1, { color: 'red', role: 'horse' });
  assert.deepEqual(board.f1, { color: 'red', role: 'cannon' });
  assert.deepEqual(board.g1, { color: 'red', role: 'chariot' });
  assert.deepEqual(board.a2, { color: 'red', role: 'soldier' });
  assert.deepEqual(board.c2, { color: 'red', role: 'soldier' });
  assert.deepEqual(board.d2, { color: 'red', role: 'soldier' });
  assert.deepEqual(board.e2, { color: 'red', role: 'soldier' });
  assert.deepEqual(board.g2, { color: 'red', role: 'soldier' });

  assert.deepEqual(board.d7, { color: 'black', role: 'general' });
  assert.deepEqual(board.d6, { color: 'black', role: 'soldier' });
});

test('initial red has 19 legal moves', () => {
  const state = createInitialMiniXiangqiState('initial-moves');

  assert.equal(getMiniXiangqiLegalMoves(state).length, 19);
  assert.deepEqual(destinations(getMiniXiangqiLegalMovesFrom(state, 'a2')), ['a3', 'b2']);
});

test('player views carry own candidate moves off-turn', () => {
  const state = createInitialMiniXiangqiState('view-legal');

  assert.ok(getMiniXiangqiPlayerView(state, 'red').legalMoves.length > 0);
  assert.ok(getMiniXiangqiPlayerView(state, 'black').legalMoves.length > 0);
  assert.equal(
    getMiniXiangqiLegalMoves(state).some((move) => move.from === 'd7'),
    false,
  );
});

test('soldiers move forward and sideways from the start but not backward', () => {
  const state = playingState({
    d4: { color: 'red', role: 'soldier' },
    d5: { color: 'black', role: 'soldier' },
    c4: { color: 'black', role: 'horse' },
    e4: { color: 'red', role: 'horse' },
    d1: { color: 'red', role: 'general' },
    d7: { color: 'black', role: 'general' },
  });

  assert.deepEqual(destinations(getMiniXiangqiLegalMovesFrom(state, 'd4')), ['c4', 'd5']);
  assert.equal(isMiniXiangqiLegalMove(state, { from: 'd4', to: 'd3' }), false);
  assert.equal(isMiniXiangqiLegalMove(state, { from: 'd4', to: 'e4' }), false);
});

test('horse movement is blocked by adjacent leg occupancy', () => {
  const state = playingState({
    d4: { color: 'red', role: 'horse' },
    d5: { color: 'black', role: 'soldier' },
    d1: { color: 'red', role: 'general' },
    d7: { color: 'black', role: 'general' },
  });

  const moves = destinations(getMiniXiangqiLegalMovesFrom(state, 'd4'));

  assert.equal(moves.includes('c6'), false);
  assert.equal(moves.includes('e6'), false);
  assert.equal(moves.includes('b5'), true);
  assert.equal(moves.includes('f5'), true);
});

test('cannon needs exactly one screen to capture', () => {
  const state = playingState({
    b1: { color: 'red', role: 'cannon' },
    b3: { color: 'red', role: 'soldier' },
    b6: { color: 'black', role: 'horse' },
    d1: { color: 'red', role: 'general' },
    d7: { color: 'black', role: 'general' },
  });

  const moves = destinations(getMiniXiangqiLegalMovesFrom(state, 'b1'));

  assert.equal(moves.includes('b2'), true);
  assert.equal(moves.includes('b3'), false);
  assert.equal(moves.includes('b4'), false);
  assert.equal(moves.includes('b5'), false);
  assert.equal(moves.includes('b6'), true);
});

test('general can capture the opposing general across a clear file', () => {
  const state = playingState({
    d1: { color: 'red', role: 'general' },
    d7: { color: 'black', role: 'general' },
  });

  const moves = destinations(getMiniXiangqiLegalMovesFrom(state, 'd1'));

  assert.equal(moves.includes('d7'), true);
  const next = applyMiniXiangqiMove(state, { from: 'd1', to: 'd7' });
  assert.deepEqual(next.status, { type: 'finished', winner: 'red', reason: 'general-captured' });
});

test('progress clock draw is server-adjudicated', () => {
  const state = playingState(
    {
      a1: { color: 'red', role: 'chariot' },
      g7: { color: 'black', role: 'chariot' },
      d1: { color: 'red', role: 'general' },
      d7: { color: 'black', role: 'general' },
    },
    { progressClock: 1 },
  );

  const next = applyMiniXiangqiMove(state, { from: 'a1', to: 'a2' }, { progressClockLimit: 2 });

  assert.deepEqual(next.status, { type: 'finished', winner: null, reason: 'progress-clock' });
});

test('position repetition key distinguishes cannons from chariots', () => {
  const cannonState = playingState({
    a1: { color: 'red', role: 'cannon' },
    d1: { color: 'red', role: 'general' },
    d7: { color: 'black', role: 'general' },
  });
  const chariotState = playingState({
    a1: { color: 'red', role: 'chariot' },
    d1: { color: 'red', role: 'general' },
    d7: { color: 'black', role: 'general' },
  });

  assert.notEqual(
    miniXiangqiPositionRepetitionKey(cannonState),
    miniXiangqiPositionRepetitionKey(chariotState),
  );
});

test('player view redacts hidden enemy roles for cannon screens', () => {
  const state = playingState({
    b1: { color: 'red', role: 'cannon' },
    b3: { color: 'black', role: 'horse' },
    b6: { color: 'black', role: 'chariot' },
    d1: { color: 'red', role: 'general' },
    d7: { color: 'black', role: 'general' },
  });

  const view = getMiniXiangqiPlayerView(state, 'red');

  assert.deepEqual(view.board.b3, { color: 'black', shrouded: true });
  assert.deepEqual(view.board.b6, { piece: { color: 'black', role: 'chariot' }, shrouded: false });
  assert.equal(view.visibleSquares.includes('b4'), false);
  assert.equal(view.visibleSquares.includes('b5'), false);
  assert.equal(JSON.stringify(view.board.b3).includes('horse'), false);
});

test('horse blockers are visible as occupied but unidentified', () => {
  const state = playingState({
    d4: { color: 'red', role: 'horse' },
    d5: { color: 'black', role: 'cannon' },
    d1: { color: 'red', role: 'general' },
    d7: { color: 'black', role: 'general' },
  });

  const view = getMiniXiangqiPlayerView(state, 'red');
  const vision = computeMiniXiangqiVision(state, 'red');

  assert.equal(vision.shroudedBlockers.has('d5'), true);
  assert.deepEqual(view.board.d5, { color: 'black', shrouded: true });
  assert.equal(JSON.stringify(view.board.d5).includes('cannon'), false);
});

test('after the game-ending fly-capture, the general sees its enemy-palace neighbours', () => {
  // Red's general flew up the d-file, captured Black's general, and landed on e7
  // inside the Black palace. The game is over. Red should now see its general's
  // palace-confined orthogonal neighbours (d7, e6) instead of going dark there.
  const state: MiniXiangqiGameState = {
    id: 'mini-fly-capture',
    board: {
      e7: { color: 'red', role: 'general' },
      d7: { color: 'black', role: 'chariot' },
      e6: { color: 'black', role: 'soldier' },
      f7: { color: 'black', role: 'cannon' },
    },
    status: { type: 'finished', winner: 'red', reason: 'general-captured' },
    moveNumber: 20,
    progressClock: 0,
    positionCounts: {},
  };

  const view = getMiniXiangqiPlayerView(state, 'red');

  // Gains vision on its in-palace orthogonal neighbours (and its own square)...
  assert.equal(view.visibleSquares.includes('e7'), true);
  assert.equal(view.visibleSquares.includes('d7'), true);
  assert.equal(view.visibleSquares.includes('e6'), true);
  assert.deepEqual(view.board.d7, { piece: { color: 'black', role: 'chariot' }, shrouded: false });
  assert.deepEqual(view.board.e6, { piece: { color: 'black', role: 'soldier' }, shrouded: false });

  // ...but does not leak past the palace (f7 is outside the palace file range,
  // even though it is orthogonally adjacent), nor reveal non-adjacent squares.
  assert.equal(view.visibleSquares.includes('f7'), false);
  assert.equal('f7' in view.board, false);
  assert.equal(view.visibleSquares.includes('e5'), false);
});

test('during play the general stays confined to its own palace (no enemy-palace leak)', () => {
  // Control: the fix must be a no-op during live play. A general in its own
  // palace sees its own-palace neighbours and nothing in the enemy palace.
  const state = playingState({
    e1: { color: 'red', role: 'general' },
    c7: { color: 'black', role: 'general' },
  });

  const vision = computeMiniXiangqiVision(state, 'red');

  assert.equal(vision.directlyVisible.has('d1'), true); // in-palace neighbour
  assert.equal(vision.directlyVisible.has('e2'), true); // in-palace neighbour
  assert.equal(vision.directlyVisible.has('f1'), false); // outside palace file range
  assert.equal(vision.directlyVisible.has('e6'), false); // enemy palace, unreachable in play
});

test('an enemy piece outside all red vision is absent from the view (not shrouded)', () => {
  // Strongest no-leak property during play: a black piece on a square red has
  // zero vision of must not appear in red's view.board at all — neither revealed
  // nor as a shrouded blocker. (Existing tests cover revealed + shrouded; this
  // pins the fully-hidden case.)
  const state = playingState({
    d1: { color: 'red', role: 'general' },
    d4: { color: 'red', role: 'soldier' },
    d7: { color: 'black', role: 'general' },
    a7: { color: 'black', role: 'chariot' }, // far corner, no red line of fire reaches it
  });

  const view = getMiniXiangqiPlayerView(state, 'red');

  assert.equal(view.visibleSquares.includes('a7'), false);
  assert.equal('a7' in view.board, false);
  // Own pieces are always present, so an empty board isn't masking the result.
  assert.deepEqual(view.board.d1, { piece: { color: 'red', role: 'general' }, shrouded: false });
});

function destinations(moves: readonly MiniXiangqiMove[]): string[] {
  return moves.map((move) => move.to).sort();
}

function playingState(
  board: MiniXiangqiBoard,
  opts: { turn?: 'red' | 'black'; progressClock?: number } = {},
): MiniXiangqiGameState {
  return {
    id: 'mini-test',
    board,
    status: { type: 'playing', turn: opts.turn ?? 'red' },
    moveNumber: 1,
    progressClock: opts.progressClock ?? 0,
    positionCounts: {},
  };
}
