import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeSquare as eoMakeSquare, parseSquare as eoParseSquare } from 'elephantops/util';
import {
  applyMove,
  computeVision,
  coordOf,
  createInitialXiangqiBoard,
  createInitialXiangqiState,
  eoToRole,
  getLegalMoves,
  getLegalMovesFrom,
  getPlayerView,
  getVisibleSquares,
  hasCrossedRiver,
  inBounds,
  inOwnHalf,
  inPalace,
  isLegalMove,
  positionRepetitionKey,
  roleToEo,
  squareOf,
  type XiangqiBoard,
  type XiangqiGameState,
  type XiangqiPiece,
  type XiangqiPieceRole,
  type XiangqiSquare,
} from './variants-xiangqi.js';

test('squareOf / coordOf roundtrip across the full board', () => {
  for (let f = 0; f < 9; f++) {
    for (let r = 1; r <= 10; r++) {
      const sq = squareOf(f, r);
      const c = coordOf(sq);
      assert.equal(c.file, f);
      assert.equal(c.rank, r);
    }
  }
});

test('squareOf rejects out-of-range coords', () => {
  assert.throws(() => squareOf(-1, 1));
  assert.throws(() => squareOf(9, 1));
  assert.throws(() => squareOf(0, 0));
  assert.throws(() => squareOf(0, 11));
});

test('coordOf rejects malformed squares', () => {
  assert.throws(() => coordOf('z1' as XiangqiSquare));
  assert.throws(() => coordOf('a' as XiangqiSquare));
  assert.throws(() => coordOf('a0' as XiangqiSquare));
});

test('squareOf matches elephantops parseSquare on rank/file numbering', () => {
  // elephantops: Square = file + 9 * (rank - 1), SquareName uses ranks 1..10
  // Roundtrip every square through elephantops and assert algebraic names match.
  for (let f = 0; f < 9; f++) {
    for (let r = 1; r <= 10; r++) {
      const ours = squareOf(f, r);
      const eoNum = eoParseSquare(ours);
      assert.notEqual(eoNum, undefined, `elephantops couldn't parse ${ours}`);
      const back = eoMakeSquare(eoNum!);
      assert.equal(back, ours);
      assert.equal(eoNum, f + 9 * (r - 1));
    }
  }
});

test('inBounds covers the 9x10 grid (ranks 1..10) only', () => {
  assert.ok(inBounds(0, 1));
  assert.ok(inBounds(8, 10));
  assert.ok(!inBounds(9, 1));
  assert.ok(!inBounds(0, 0));
  assert.ok(!inBounds(0, 11));
  assert.ok(!inBounds(-1, 5));
});

test('inPalace matches the 3x3 boxes for each color', () => {
  // Red palace: files d-f (3-5), ranks 1-3
  assert.ok(inPalace('red', 3, 1));
  assert.ok(inPalace('red', 4, 2));
  assert.ok(inPalace('red', 5, 3));
  assert.ok(!inPalace('red', 2, 1));
  assert.ok(!inPalace('red', 4, 4));
  // Black palace: files d-f (3-5), ranks 8-10
  assert.ok(inPalace('black', 4, 10));
  assert.ok(inPalace('black', 3, 8));
  assert.ok(!inPalace('black', 4, 7));
  // Red palace square is not in black palace
  assert.ok(!inPalace('black', 4, 2));
});

test('inOwnHalf and hasCrossedRiver split at the river', () => {
  assert.ok(inOwnHalf('red', 1));
  assert.ok(inOwnHalf('red', 5));
  assert.ok(!inOwnHalf('red', 6));
  assert.ok(inOwnHalf('black', 6));
  assert.ok(inOwnHalf('black', 10));
  assert.ok(!inOwnHalf('black', 5));

  assert.ok(!hasCrossedRiver('red', 5));
  assert.ok(hasCrossedRiver('red', 6));
  assert.ok(!hasCrossedRiver('black', 6));
  assert.ok(hasCrossedRiver('black', 5));
});

test('initial board has exactly 32 pieces with the expected distribution', () => {
  const board = createInitialXiangqiBoard();
  const pieces = Object.values(board) as XiangqiPiece[];
  assert.equal(pieces.length, 32);

  const counts: Record<string, number> = {};
  for (const p of pieces) {
    counts[`${p.color}-${p.role}`] = (counts[`${p.color}-${p.role}`] ?? 0) + 1;
  }
  for (const color of ['red', 'black']) {
    assert.equal(counts[`${color}-general`], 1);
    assert.equal(counts[`${color}-advisor`], 2);
    assert.equal(counts[`${color}-elephant`], 2);
    assert.equal(counts[`${color}-horse`], 2);
    assert.equal(counts[`${color}-chariot`], 2);
    assert.equal(counts[`${color}-cannon`], 2);
    assert.equal(counts[`${color}-soldier`], 5);
  }
});

test('initial board has correct pieces at specific landmark squares', () => {
  const board = createInitialXiangqiBoard();
  // Red back rank
  assert.deepEqual(board.a1, { color: 'red', role: 'chariot' });
  assert.deepEqual(board.e1, { color: 'red', role: 'general' });
  assert.deepEqual(board.i1, { color: 'red', role: 'chariot' });
  // Red cannons on rank 3, files b and h
  assert.deepEqual(board.b3, { color: 'red', role: 'cannon' });
  assert.deepEqual(board.h3, { color: 'red', role: 'cannon' });
  // Red soldiers on rank 4, files a c e g i
  assert.deepEqual(board.a4, { color: 'red', role: 'soldier' });
  assert.deepEqual(board.e4, { color: 'red', role: 'soldier' });
  assert.equal(board.b4, undefined);
  // Black mirror
  assert.deepEqual(board.e10, { color: 'black', role: 'general' });
  assert.deepEqual(board.b8, { color: 'black', role: 'cannon' });
  assert.deepEqual(board.c7, { color: 'black', role: 'soldier' });
  // River zone (ranks 5 and 6) is empty
  for (const sq of ['a5', 'e5', 'i5', 'a6', 'e6', 'i6']) {
    assert.equal(board[sq as XiangqiSquare], undefined);
  }
});

test('initial state: red moves first, plies=0, moveNumber=1, positionCounts seeded with starting position', () => {
  const state = createInitialXiangqiState('test-game');
  assert.equal(state.id, 'test-game');
  assert.equal(state.moveNumber, 1);
  assert.equal(state.progressClock, 0);
  assert.deepEqual(state.status, { type: 'playing', turn: 'red' });
  assert.equal(state.lastMove, undefined);
  // positionCounts seeded so 3-fold detection includes the starting position.
  const keys = Object.keys(state.positionCounts);
  assert.equal(keys.length, 1);
  assert.equal(state.positionCounts[keys[0]], 1);
});

test('role translation roundtrips for every xiangqi role', () => {
  const roles: XiangqiPieceRole[] = [
    'general',
    'advisor',
    'elephant',
    'horse',
    'chariot',
    'cannon',
    'soldier',
  ];
  for (const role of roles) {
    assert.equal(eoToRole(roleToEo(role)), role);
  }
});

// ── Move generation ────────────────────────────────────────────────────────

function findMove(moves: Array<{ from: string; to: string }>, from: string, to: string): boolean {
  return moves.some((m) => m.from === from && m.to === to);
}

// Helper: build a custom playing state from a board-square map.
function buildState(
  pieces: Partial<Record<XiangqiSquare, XiangqiPiece>>,
  turn: 'red' | 'black' = 'red',
): XiangqiGameState {
  const board: XiangqiBoard = { ...pieces };
  return {
    id: 't',
    board,
    status: { type: 'playing', turn },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
}

test('initial position: red has 44 legal moves (canonical xiangqi opening count)', () => {
  const state = createInitialXiangqiState('t');
  const moves = getLegalMoves(state);
  assert.equal(moves.length, 44);
});

test('initial position: known opening moves are legal', () => {
  const state = createInitialXiangqiState('t');
  const moves = getLegalMoves(state);
  // General-step (e1->e2) is legal because e2 is empty.
  assert.ok(findMove(moves, 'e1', 'e2'), 'general e1->e2 should be legal');
  // Cannon-on-river (cannon b3 going up file): up to b7 is empty, b8 has black cannon — no screen, so blocked at b8.
  assert.ok(findMove(moves, 'b3', 'b7'));
  assert.ok(!findMove(moves, 'b3', 'b8'), 'cannot capture without a screen');
  // Horse b1 -> a3 / c3 (leg square b2 empty for both)
  assert.ok(findMove(moves, 'b1', 'a3'));
  assert.ok(findMove(moves, 'b1', 'c3'));
});

test('finished state has zero legal moves', () => {
  const state: XiangqiGameState = {
    ...createInitialXiangqiState('t'),
    status: { type: 'finished', winner: 'red', reason: 'general-captured' },
  };
  assert.deepEqual(getLegalMoves(state), []);
});

test('cannon captures only across exactly one screen', () => {
  // Red cannon on e3, red pawn screen on e5, black pawn target on e7.
  // Cannon should be able to capture e7 (across screen e5) but not e5 directly.
  const state = buildState({
    e1: { color: 'red', role: 'general' },
    e3: { color: 'red', role: 'cannon' },
    e5: { color: 'red', role: 'soldier' },
    e7: { color: 'black', role: 'soldier' },
    e10: { color: 'black', role: 'general' },
  });
  const fromCannon = getLegalMovesFrom(state, 'e3');
  // Cannot land on or "capture" the friendly screen e5; it's blocked along the ray.
  assert.ok(!fromCannon.some((m) => m.to === 'e5'));
  // Can capture e7 across the screen
  assert.ok(fromCannon.some((m) => m.to === 'e7'));
  // Cannot reach e8/e10 — only one piece can be captured, ray stops at first piece past screen
  assert.ok(!fromCannon.some((m) => m.to === 'e10'));
});

test('horse leg is respected (blocked) and clear leg passes', () => {
  // Red horse on d5 (off file e so it isn't pinned by flying-general).
  // A red cannon on e3 acts as a static screen between the kings.
  // d5 -> b6 has leg c5; d5 -> f6 has leg e5. With both legs empty, both legal.
  const baseState = buildState({
    e1: { color: 'red', role: 'general' },
    e3: { color: 'red', role: 'cannon' },
    d5: { color: 'red', role: 'horse' },
    e10: { color: 'black', role: 'general' },
  });
  const clearLeg = getLegalMovesFrom(baseState, 'd5');
  assert.ok(
    clearLeg.some((m) => m.to === 'b6'),
    'horse d5->b6 legal with c5 empty',
  );
  assert.ok(
    clearLeg.some((m) => m.to === 'f6'),
    'horse d5->f6 legal with e5 empty',
  );

  // Block leg c5 with a cannon (cannons have no rank restriction; max 2/side honored).
  const blocked = buildState({
    ...baseState.board,
    c5: { color: 'red', role: 'cannon' },
  });
  const blockedMoves = getLegalMovesFrom(blocked, 'd5');
  assert.ok(!blockedMoves.some((m) => m.to === 'b6'), 'horse d5->b6 blocked when leg c5 occupied');
  assert.ok(
    blockedMoves.some((m) => m.to === 'f6'),
    'horse d5->f6 unaffected',
  );
});

test('elephant eye blocker and river constraint', () => {
  // Red elephant on c1: can move to a3 or e3 (eye squares b2, d2 both empty).
  // Place piece on d2 to block the e3 destination via eye.
  // (e5 screen keeps the kings from facing on an empty file — required for
  // elephantops to accept the setup.)
  const state = buildState({
    e1: { color: 'red', role: 'general' },
    c1: { color: 'red', role: 'elephant' },
    // Cannon as the screen — only attacks across a second screen, so it
    // doesn't put the black general in check across the empty middle.
    e5: { color: 'red', role: 'cannon' },
    e10: { color: 'black', role: 'general' },
  });
  const clear = getLegalMovesFrom(state, 'c1');
  assert.ok(clear.some((m) => m.to === 'a3'));
  assert.ok(clear.some((m) => m.to === 'e3'));
  // Block the eye d2. Use a cannon — soldiers can't sit behind their starting
  // rank (elephantops setup-rejects via ERR_PAWNS).
  const blocked = buildState({
    ...state.board,
    d2: { color: 'red', role: 'cannon' },
  });
  const blockedMoves = getLegalMovesFrom(blocked, 'c1');
  assert.ok(blockedMoves.some((m) => m.to === 'a3'));
  assert.ok(!blockedMoves.some((m) => m.to === 'e3'), 'elephant eye d2 blocks e3 destination');
  // River: red elephant should never be able to cross to rank 6+.
  const allRedElephantMoves = getLegalMovesFrom(state, 'c1');
  for (const m of allRedElephantMoves) {
    const rank = Number(m.to.slice(1));
    assert.ok(rank <= 5, `red elephant must not cross river (saw ${m.to})`);
  }
});

test('FoW: flying-general is allowed (no check filter)', () => {
  // Under FoW, players can move the screen and leave kings facing — the
  // consequence is that the opponent can capture the exposed general next
  // ply, which is the actual win condition.
  // Cannon (not chariot — a chariot on e5 with no screen between kings
  // would have already created an OppositeCheck setup under standard rules;
  // FoW tolerates it via setupUnchecked).
  const state = buildState({
    e1: { color: 'red', role: 'general' },
    e5: { color: 'red', role: 'cannon' },
    e10: { color: 'black', role: 'general' },
  });
  const cannonMoves = getLegalMovesFrom(state, 'e5');
  // Sideways off file e — now legal under FoW (unscreens but that's fine).
  for (const sq of ['a5', 'b5', 'c5', 'd5', 'f5', 'g5', 'h5', 'i5']) {
    assert.ok(
      cannonMoves.some((m) => m.to === sq),
      `cannon e5->${sq} should be legal under FoW (check ignored)`,
    );
  }
  // Up file e (still a screen) — legal quiet moves (unchanged).
  assert.ok(cannonMoves.some((m) => m.to === 'e6'));
  assert.ok(cannonMoves.some((m) => m.to === 'e9'));
  // Cannon still requires a screen for capture — geometry rule, not check.
  assert.ok(!cannonMoves.some((m) => m.to === 'e10'));
});

test('facing general can capture across a clear file', () => {
  const state = buildState(
    {
      e1: { color: 'red', role: 'general' },
      e10: { color: 'black', role: 'general' },
    },
    'black',
  );
  const generalMoves = getLegalMovesFrom(state, 'e10');
  assert.ok(findMove(generalMoves, 'e10', 'e1'));
  assert.ok(isLegalMove(state, { from: 'e10', to: 'e1' }));

  const after = applyMove(state, { from: 'e10', to: 'e1' });
  assert.deepEqual(after.status, {
    type: 'finished',
    winner: 'black',
    reason: 'general-captured',
  });
  assert.deepEqual(after.board.e1, { color: 'black', role: 'general' });
  assert.equal(
    Object.values(after.board).some((p) => p?.color === 'red' && p.role === 'general'),
    false,
  );
});

test('FoW: capturing the general ends the game (winner = mover, general removed)', () => {
  // Red chariot on a1 with a clear file up to the black general on a10.
  // Capture should remove the general and finish the game.
  const state = buildState({
    e1: { color: 'red', role: 'general' },
    a1: { color: 'red', role: 'chariot' },
    a10: { color: 'black', role: 'general' },
    i10: { color: 'black', role: 'chariot' },
  });
  const after = applyMove(state, { from: 'a1', to: 'a10' });
  assert.equal(after.status.type, 'finished');
  assert.deepEqual(after.status, {
    type: 'finished',
    winner: 'red',
    reason: 'general-captured',
  });
  // Black general gone, red chariot now on a10.
  assert.equal(after.board.a10?.color, 'red');
  assert.equal(after.board.a10?.role, 'chariot');
  // No black general anywhere on the board.
  const blackGeneralPresent = Object.values(after.board).some(
    (p) => p?.color === 'black' && p?.role === 'general',
  );
  assert.equal(blackGeneralPresent, false, 'black general must be off the board');
});

test('FoW: moving the general into an attacked square is legal', () => {
  // Black chariot on e5 attacks the e-file. Red general on e1 can still
  // step to e2 even though e2 is on the same file (would be check in
  // standard xiangqi; allowed under FoW).
  const state = buildState({
    e1: { color: 'red', role: 'general' },
    a10: { color: 'black', role: 'general' },
    e5: { color: 'black', role: 'chariot' },
  });
  const generalMoves = getLegalMovesFrom(state, 'e1');
  assert.ok(
    generalMoves.some((m) => m.to === 'e2'),
    'general should be able to step into check under FoW',
  );
});

test('isLegalMove agrees with getLegalMoves on initial position', () => {
  const state = createInitialXiangqiState('t');
  const moves = getLegalMoves(state);
  for (const m of moves) {
    assert.ok(isLegalMove(state, m), `expected ${m.from}->${m.to} legal`);
  }
  // Negative cases
  assert.ok(!isLegalMove(state, { from: 'e1' as XiangqiSquare, to: 'e5' as XiangqiSquare }));
  assert.ok(!isLegalMove(state, { from: 'a4' as XiangqiSquare, to: 'a7' as XiangqiSquare }));
});

test('getLegalMovesFrom rejects opponent pieces', () => {
  const state = createInitialXiangqiState('t'); // red to move
  // Try to move a black piece on red's turn
  const blackMoves = getLegalMovesFrom(state, 'a10' as XiangqiSquare);
  assert.deepEqual(blackMoves, []);
});

// ── FoW visibility ─────────────────────────────────────────────────────────

test('initial position: red sees own 16 pieces + the two cannon-target horses on b10/h10', () => {
  const state = createInitialXiangqiState('t');
  const visible = new Set(getVisibleSquares(state, 'red'));
  // All 16 red pieces are visible.
  for (const sq of Object.keys(state.board)) {
    const piece = state.board[sq as XiangqiSquare]!;
    if (piece.color === 'red') {
      assert.ok(visible.has(sq as XiangqiSquare), `red should see own piece on ${sq}`);
    }
  }
  // Cannons b3/h3 see through screens b8/h8 to black horses on b10/h10.
  assert.ok(visible.has('b10'), 'b3 cannon should see b10 as a screened target');
  assert.ok(visible.has('h10'), 'h3 cannon should see h10 as a screened target');
  // Other back-rank squares (no cannon ray) are NOT visible.
  for (const f of ['a', 'c', 'd', 'e', 'f', 'g', 'i']) {
    assert.ok(!visible.has(`${f}10` as XiangqiSquare), `red should not see ${f}10`);
  }
});

test('chariot vision stops at first piece (sees the blocker but not past it)', () => {
  // Red chariot on a1: file-a vision goes a2 (empty), a3 (empty), a4 (own
  // soldier — visible as the blocker) — and STOPS. a6 is the first file-a
  // square not reachable by any red piece from the initial position
  // (the a4 soldier itself sees a5 forward; a6 is past everyone's reach).
  const state = createInitialXiangqiState('t');
  const visible = new Set(getVisibleSquares(state, 'red'));
  assert.ok(visible.has('a2'));
  assert.ok(visible.has('a3'));
  assert.ok(visible.has('a4'), 'own soldier blocker is visible');
  assert.ok(
    !visible.has('a6' as XiangqiSquare),
    'a6 is past the blocker and out of any other red vision',
  );
});

test('cannon vision tracks but does not reveal empty gap squares behind the screen', () => {
  // Red cannon at h3 with red elephant screen at e3, black chariot target at b3.
  // Empty squares between screen and target (d3, c3) are not legal cannon
  // destinations, so they stay fogged in player views.
  const state: XiangqiGameState = {
    id: 't',
    board: {
      e1: { color: 'red', role: 'general' },
      e3: { color: 'red', role: 'elephant' }, // screen
      h3: { color: 'red', role: 'cannon' }, // cannon
      b3: { color: 'black', role: 'chariot' }, // enemy target
      e10: { color: 'black', role: 'general' },
    },
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  const v = computeVision(state, 'red');
  // Empty quiet-move squares (right of screen): g3, f3
  assert.ok(v.directlyVisible.has('g3'));
  assert.ok(v.directlyVisible.has('f3'));
  // Screen + target squares
  assert.ok(v.cannonScreens.has('e3'), 'e3 elephant is the screen');
  assert.ok(v.cannonTargets.has('b3'), 'b3 chariot is the captureable target');
  // Empty squares between screen and target are tracked for diagnostics and
  // marker experiments, but do not surface as visible squares.
  assert.ok(v.cannonPath.has('d3'), 'd3 between screen and target should be tracked');
  assert.ok(v.cannonPath.has('c3'), 'c3 between screen and target should be tracked');
  const visible = getVisibleSquares(state, 'red');
  assert.ok(!visible.includes('d3'), 'gap square d3 should stay fogged');
  assert.ok(!visible.includes('c3'), 'gap square c3 should stay fogged');
});

test('cannon vision stops at the screen when there is no enemy target past it', () => {
  // Cannon at h5, screen at e5 (own elephant), nothing else on rank 5.
  // Use rank 5 (outside palace) so the general's palace vision doesn't
  // contaminate the test. Empty squares past the screen must NOT be visible.
  const state: XiangqiGameState = {
    id: 't',
    board: {
      e1: { color: 'red', role: 'general' },
      e5: { color: 'red', role: 'elephant' },
      h5: { color: 'red', role: 'cannon' },
      e10: { color: 'black', role: 'general' },
    },
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  const v = computeVision(state, 'red');
  assert.ok(v.cannonScreens.has('e5'));
  assert.ok(!v.directlyVisible.has('d5' as XiangqiSquare));
  assert.ok(!v.directlyVisible.has('c5' as XiangqiSquare));
  assert.ok(!v.directlyVisible.has('b5' as XiangqiSquare));
});

test('cannon vision stops at the screen when the piece past it is own (not captureable)', () => {
  // Cannon at h5, screen e5 (own elephant), own SOLDIER at a5 past the
  // screen. Soldier is used as the own-piece blocker because it has very
  // short vision (no rook-rays leaking into d5/c5 from the blocker itself).
  const state: XiangqiGameState = {
    id: 't',
    board: {
      e1: { color: 'red', role: 'general' },
      e5: { color: 'red', role: 'elephant' },
      h5: { color: 'red', role: 'cannon' },
      a5: { color: 'red', role: 'soldier' },
      e10: { color: 'black', role: 'general' },
    },
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  const v = computeVision(state, 'red');
  assert.ok(v.cannonScreens.has('e5'));
  assert.ok(v.directlyVisible.has('a5'), 'own soldier always visible');
  assert.ok(
    !v.cannonTargets.has('a5' as XiangqiSquare),
    'own piece never counts as a cannon target',
  );
  // d5, c5, b5 must come from the cannon ray to be visible — and they don't,
  // because no enemy target gates them.
  assert.ok(!v.directlyVisible.has('d5' as XiangqiSquare));
  assert.ok(!v.directlyVisible.has('c5' as XiangqiSquare));
  assert.ok(!v.directlyVisible.has('b5' as XiangqiSquare));
});

test('cannon sees through screen to enemy target (initial position cannon vs back-rank knight)', () => {
  // Red cannon at b3 looks up file b: b4..b9 empty, b8 black cannon, b10 black horse.
  // Wait — between cannon b3 and b8 black cannon, all squares empty (no screen),
  // so b3 cannon does NOT see b8 via screen-jump. Instead it sees b8 as a stopping
  // point? Actually no — without a screen, cannon vision-ray stops at the first
  // piece (b8). The first piece IS recorded as a "screen" (in cannonScreens).
  // So b8 is in cannonScreens, not directly visible.
  const state = createInitialXiangqiState('t');
  const v = computeVision(state, 'red');
  // b3 cannon's file-b ray: empty b4, b5, b6, b7 all directlyVisible; b8 is the screen.
  for (const sq of ['b4', 'b5', 'b6', 'b7']) {
    assert.ok(v.directlyVisible.has(sq as XiangqiSquare), `b3 cannon should directly see ${sq}`);
  }
  assert.ok(v.cannonScreens.has('b8'), 'b3 cannon should see b8 as a screen');
  // No piece behind b8 on file b in the initial position (b9 empty, b10 empty
  // because back rank has horse on b10) — wait b10 has a horse. So cannon
  // b3 -> screen b8 -> target b10 (horse).
  assert.ok(
    v.cannonTargets.has('b10'),
    'b3 cannon should see b10 as a screened target (black horse)',
  );
});

test('general vision is legal palace destinations, not the whole palace', () => {
  const state: XiangqiGameState = {
    id: 't',
    board: {
      e1: { color: 'red', role: 'general' },
    },
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  const v = computeVision(state, 'red');
  for (const sq of ['d1', 'f1', 'e2'] as const) {
    assert.ok(v.directlyVisible.has(sq), `general e1 should see legal destination ${sq}`);
  }
  for (const sq of ['d2', 'f2', 'd3', 'e3', 'f3'] as const) {
    assert.ok(
      !v.directlyVisible.has(sq),
      `general e1 should not see non-destination palace square ${sq}`,
    );
  }
});

test('general vision sees facing enemy general only on a clear file', () => {
  const clear: XiangqiGameState = {
    id: 't',
    board: {
      e1: { color: 'red', role: 'general' },
      e10: { color: 'black', role: 'general' },
    },
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  assert.ok(computeVision(clear, 'red').directlyVisible.has('e10'));

  const blocked: XiangqiGameState = {
    ...clear,
    board: {
      ...clear.board,
      e5: { color: 'black', role: 'soldier' },
    },
  };
  const v = computeVision(blocked, 'red');
  assert.ok(!v.directlyVisible.has('e10'), 'screened opposing general should not be visible');
  assert.ok(!v.directlyVisible.has('e5'), 'general vision should not reveal the blocker');
});

test('horse vision includes legal L-destinations but not leg squares', () => {
  // Red horse on e2. Vision follows legal destinations only; adjacent leg
  // squares are not revealed just to explain why a move works or fails.
  const state: XiangqiGameState = {
    id: 't',
    board: {
      e2: { color: 'red', role: 'horse' }, // test subject moved to palace
    },
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  const v = computeVision(state, 'red');
  // L-squares around e2 (file=4, rank=2). Enumerate explicitly:
  //   (4±1, 2±2): (5,4)=f4, (5,0)=skip, (3,4)=d4, (3,0)=skip  → f4, d4
  //   (4±2, 2±1): (6,3)=g3, (6,1)=g1, (2,3)=c3, (2,1)=c1
  const expectedL = ['d4', 'f4', 'c1', 'c3', 'g1', 'g3'] as const;
  for (const sq of expectedL) {
    assert.ok(v.directlyVisible.has(sq), `horse e2 L-vision should include ${sq}`);
  }
  // Legs around e2: e1, e3, d2, f2
  for (const sq of ['e1', 'e3', 'd2', 'f2'] as const) {
    assert.ok(!v.directlyVisible.has(sq), `horse e2 leg square ${sq} should stay hidden`);
  }
});

test('horse vision hides destinations behind blocked legs', () => {
  const state: XiangqiGameState = {
    id: 't',
    board: {
      e2: { color: 'red', role: 'horse' },
      e3: { color: 'black', role: 'soldier' }, // blocks d4/f4 via the e3 leg
    },
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  const v = computeVision(state, 'red');
  assert.ok(!v.directlyVisible.has('e3'), 'blocked leg is not revealed by horse vision');
  assert.ok(!v.directlyVisible.has('d4'), 'blocked destination d4 stays hidden');
  assert.ok(!v.directlyVisible.has('f4'), 'blocked destination f4 stays hidden');
  assert.ok(v.directlyVisible.has('c1'), 'unblocked destination c1 remains visible');
  assert.ok(v.directlyVisible.has('g1'), 'unblocked destination g1 remains visible');

  const view = getPlayerView(state, 'red');
  assert.equal(view.board.e3?.shrouded, true, 'blocked leg renders as a ? marker');
  assert.ok(view.visibleSquares.includes('e3'), 'blocked leg square is visible as occupancy');
});

test('elephant sees legal diagonal-2 destinations but not eye squares', () => {
  const state: XiangqiGameState = {
    id: 't',
    board: {
      c5: { color: 'red', role: 'elephant' }, // at the river edge
      e3: { color: 'red', role: 'horse' }, // screen, short-range vision
    },
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  const v = computeVision(state, 'red');
  // Elephant on c5 (file=2, rank=5). Eyes are b4, b6, d4, d6, but those
  // squares are not visible merely because they are eyes.
  for (const sq of ['b4', 'b6', 'd4', 'd6'] as const) {
    assert.ok(!v.directlyVisible.has(sq), `elephant c5 eye ${sq} should stay hidden`);
  }
  // Diagonal-2 destinations: a3, a7, e3, e7. Own half only: a3, e3.
  for (const sq of ['a3', 'e3'] as const) {
    assert.ok(v.directlyVisible.has(sq), `elephant c5 should see destination ${sq}`);
  }
  // Across the river — destinations dropped.
  for (const sq of ['a7', 'e7'] as const) {
    assert.ok(
      !v.directlyVisible.has(sq),
      `elephant c5 should NOT see destination ${sq} (across river)`,
    );
  }
});

test('elephant vision hides destinations behind blocked eyes', () => {
  const state: XiangqiGameState = {
    id: 't',
    board: {
      c1: { color: 'red', role: 'elephant' },
      d2: { color: 'black', role: 'soldier' }, // blocks e3 via the d2 eye
    },
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  const v = computeVision(state, 'red');
  assert.ok(!v.directlyVisible.has('d2'), 'blocked eye is not revealed by elephant vision');
  assert.ok(!v.directlyVisible.has('e3'), 'blocked elephant destination stays hidden');
  assert.ok(v.directlyVisible.has('a3'), 'unblocked elephant destination remains visible');

  const view = getPlayerView(state, 'red');
  assert.equal(view.board.d2?.shrouded, true, 'blocked eye renders as a ? marker');
  assert.ok(view.visibleSquares.includes('d2'), 'blocked eye square is visible as occupancy');
});

test('soldier vision: 1 fwd in own half, 1 fwd + 2 sideways after crossing river', () => {
  // Red soldier on a4 (own half): sees a5 only.
  // Red soldier on a6 (crossed river): sees a7, b6 (no a-file left of a).
  const state: XiangqiGameState = {
    id: 't',
    board: {
      e1: { color: 'red', role: 'general' },
      a4: { color: 'red', role: 'soldier' },
      b6: { color: 'red', role: 'soldier' },
      e5: { color: 'red', role: 'cannon' },
      e10: { color: 'black', role: 'general' },
    },
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  const v = computeVision(state, 'red');
  assert.ok(v.directlyVisible.has('a5'), 'a4 soldier should see a5 (own-half forward)');
  assert.ok(!v.directlyVisible.has('a3' as XiangqiSquare), 'soldier cannot see backward');
  // b6 has crossed river: sees b7 (fwd), a6 (left), c6 (right)
  assert.ok(v.directlyVisible.has('b7'));
  assert.ok(v.directlyVisible.has('a6'));
  assert.ok(v.directlyVisible.has('c6'));
});

test('cannon-vision modes A/B/C/D: target square rendering differs', () => {
  const state = createInitialXiangqiState('t');
  // Initial position: red cannon b3 sees b10 as a screened target (black horse).
  const viewA = getPlayerView(state, 'red', 'A');
  const viewB = getPlayerView(state, 'red', 'B');
  const viewC = getPlayerView(state, 'red', 'C');
  const viewD = getPlayerView(state, 'red', 'D');

  // b10 (black horse, behind screen b8) — entry exists in all four modes.
  assert.ok(viewA.board.b10);
  assert.ok(viewB.board.b10);
  assert.ok(viewC.board.b10);
  assert.ok(viewD.board.b10);
  // Target: A and D reveal; B and C shroud.
  assert.equal(viewA.board.b10!.shrouded, false);
  assert.equal(viewB.board.b10!.shrouded, true);
  assert.equal(viewC.board.b10!.shrouded, true);
  assert.equal(viewD.board.b10!.shrouded, false, 'D reveals the target');

  // b8 (black cannon — the screen) — entry exists in all four.
  // Screen: A and C reveal; B and D shroud.
  assert.equal(viewA.board.b8!.shrouded, false);
  assert.equal(viewB.board.b8!.shrouded, true);
  assert.equal(viewC.board.b8!.shrouded, false);
  assert.equal(viewD.board.b8!.shrouded, true, 'D shrouds the screen');
});

test('cannon-vision mode E: screen fogged, target revealed', () => {
  const state = createInitialXiangqiState('t');
  // Red cannon b3, screen b8 (black cannon), gap b9, target b10 (black horse).
  const viewD = getPlayerView(state, 'red', 'D');
  const viewE = getPlayerView(state, 'red', 'E');

  // Target b10 is revealed and visible in E (you can still capture it).
  assert.equal(viewE.board.b10!.shrouded, false, 'E reveals the target');
  assert.ok(viewE.visibleSquares.includes('b10'), 'E keeps the target square visible');

  // Screen b8: D renders it (as a shrouded ?), E fogs it entirely.
  assert.ok(viewD.board.b8, 'D renders the screen');
  assert.equal(viewE.board.b8, undefined, 'E does not render the screen (fogged)');
  assert.ok(!viewE.visibleSquares.includes('b8'), 'E fogs the screen square');

  // Gap b9: fogged in every mode because the cannon cannot land there.
  assert.ok(!viewD.visibleSquares.includes('b9'), 'D fogs the gap');
  assert.ok(!viewE.visibleSquares.includes('b9'), 'E fogs the gap');
});

test('cannon-vision mode D is the inverse of mode C', () => {
  // Mode C: screen revealed, target shrouded.
  // Mode D: screen shrouded (rendered as ? by renderXiangqiPiece), target revealed.
  // Across every cannon-screen and cannon-target entry that exists in both
  // views, the shrouded flags should be inverted.
  const state = createInitialXiangqiState('t');
  const viewC = getPlayerView(state, 'red', 'C');
  const viewD = getPlayerView(state, 'red', 'D');

  for (const sq of Object.keys(viewC.board) as XiangqiSquare[]) {
    const c = viewC.board[sq]!;
    const d = viewD.board[sq];
    if (!d) continue;
    // Only assert inversion on entries that are cannon-only-visible (where C
    // and D differ). For entries that are directly visible from another piece,
    // both modes set shrouded=false — that's not a violation.
    if (c.shrouded || d.shrouded) {
      assert.notEqual(c.shrouded, d.shrouded, `C and D should differ on cannon-only square ${sq}`);
    }
  }
});

test('player view legal-moves carry own candidate moves off-turn', () => {
  const state = createInitialXiangqiState('t'); // red to move
  const redView = getPlayerView(state, 'red');
  assert.equal(redView.legalMoves.length, 44);
  const blackView = getPlayerView(state, 'black');
  assert.ok(blackView.legalMoves.some((move) => move.from === 'a10' && move.to === 'a9'));
  assert.deepEqual(
    getLegalMoves(state).filter((move) => move.from === 'a10'),
    [],
  );
});

test('mode D player view explains every legal destination in the initial position', () => {
  assertModeDLegalMovesAreVisible(createInitialXiangqiState('red'), 'red');
  assertModeDLegalMovesAreVisible(
    { ...createInitialXiangqiState('black'), status: { type: 'playing', turn: 'black' } },
    'black',
  );
});

test('mode D player view explains legal destinations with blockers and cannon screens', () => {
  const state: XiangqiGameState = {
    id: 'mode-d-alignment',
    board: {
      e1: { color: 'red', role: 'general' },
      a1: { color: 'red', role: 'chariot' },
      c1: { color: 'red', role: 'elephant' },
      e2: { color: 'red', role: 'horse' },
      b3: { color: 'red', role: 'cannon' },
      g4: { color: 'red', role: 'soldier' },
      a3: { color: 'black', role: 'soldier' },
      d2: { color: 'black', role: 'soldier' },
      e3: { color: 'black', role: 'soldier' },
      b8: { color: 'black', role: 'cannon' },
      b10: { color: 'black', role: 'horse' },
      e10: { color: 'black', role: 'general' },
    },
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  const view = getPlayerView(state, 'red', 'D');

  assert.equal(view.board.e3?.shrouded, true, 'horse leg/cannon screen e3 is visible as ?');
  assert.equal(view.board.d2?.shrouded, true, 'elephant eye d2 is visible as ?');
  assert.equal(view.board.b8?.shrouded, true, 'cannon screen b8 is visible as ?');
  assert.equal(view.board.b10?.shrouded, false, 'mode D reveals cannon target b10');
  assertModeDLegalMovesAreVisible(state, 'red');
});

test('direct visibility overrides shrouded blocker markers', () => {
  const state: XiangqiGameState = {
    id: 'direct-overrides-shroud',
    board: {
      e1: { color: 'red', role: 'general' },
      e2: { color: 'red', role: 'horse' },
      a3: { color: 'red', role: 'chariot' },
      e3: { color: 'black', role: 'soldier' },
      e10: { color: 'black', role: 'general' },
    },
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  const view = getPlayerView(state, 'red', 'D');

  assert.equal(
    view.board.e3?.shrouded,
    false,
    'chariot direct vision should reveal a piece even if horse logic also sees it as a leg blocker',
  );
});

test('mode D revealed cannon target overrides same-square shrouded cannon screen', () => {
  const state = play(createInitialXiangqiState('cannon-overlap'), [
    ['b3', 'e3'],
    ['h8', 'h1'],
    ['i1', 'h1'],
    ['b8', 'b3'],
  ]);
  const view = getPlayerView(state, 'red', 'D');

  assert.equal(view.board.b3?.piece.color, 'black');
  assert.equal(view.board.b3?.piece.role, 'cannon');
  assert.equal(
    view.board.b3?.shrouded,
    false,
    'b3 is a shrouded screen for one red cannon but a revealed target for another',
  );
});

test('player view does not reveal squares the perspective player cannot see', () => {
  const state = createInitialXiangqiState('t');
  const view = getPlayerView(state, 'red');
  // From initial position red cannot see e7 (black soldier) or g8 anywhere etc.
  assert.equal(
    view.board['e7' as XiangqiSquare],
    undefined,
    'red should not see e7 (black soldier)',
  );
  assert.equal(
    view.board['a10' as XiangqiSquare],
    undefined,
    'red should not see a10 (black chariot)',
  );
});

function assertModeDLegalMovesAreVisible(state: XiangqiGameState, color: 'red' | 'black'): void {
  const view = getPlayerView(state, color, 'D');
  const visible = new Set(view.visibleSquares);
  for (const move of view.legalMoves) {
    const source = view.board[move.from];
    assert.ok(source, `${move.from}-${move.to}: source should be visible`);
    assert.equal(
      source.shrouded,
      false,
      `${move.from}-${move.to}: source identity should be known`,
    );
    assert.equal(source.piece.color, color, `${move.from}-${move.to}: source should be own piece`);
    assert.ok(visible.has(move.to), `${move.from}-${move.to}: destination should be visible`);

    const target = state.board[move.to];
    if (!target) continue;
    const renderedTarget = view.board[move.to];
    assert.ok(renderedTarget, `${move.from}-${move.to}: occupied target should be rendered`);
    assert.equal(
      renderedTarget.shrouded,
      false,
      `${move.from}-${move.to}: legal capture target should be identified in mode D`,
    );
    assert.notEqual(
      renderedTarget.piece.color,
      color,
      `${move.from}-${move.to}: legal destination should not be own occupied square`,
    );
  }
}

// ── applyMove: state transitions + end conditions ──────────────────────────

function play(
  state: XiangqiGameState,
  moves: Array<[XiangqiSquare, XiangqiSquare]>,
  opts = {},
): XiangqiGameState {
  let s = state;
  for (const [from, to] of moves) {
    s = applyMove(s, { from, to }, opts);
  }
  return s;
}

test('applyMove advances turn, increments moveNumber on black, returns valid playing state', () => {
  const state = createInitialXiangqiState('t');
  const after1 = applyMove(state, { from: 'b1', to: 'c3' });
  assert.equal(after1.status.type, 'playing');
  assert.equal((after1.status as { turn: 'red' | 'black' }).turn, 'black');
  assert.equal(after1.moveNumber, 1, 'moveNumber increments only when black completes');
  assert.deepEqual(after1.lastMove, { from: 'b1', to: 'c3' });

  const after2 = applyMove(after1, { from: 'b10', to: 'c8' });
  assert.equal((after2.status as { turn: 'red' | 'black' }).turn, 'red');
  assert.equal(after2.moveNumber, 2, "moveNumber increments after black's move");
});

test('applyMove on illegal move returns state unchanged', () => {
  const state = createInitialXiangqiState('t');
  const result = applyMove(state, { from: 'e1', to: 'e5' });
  assert.strictEqual(result, state);
});

test('applyMove on finished state is a no-op', () => {
  const finished: XiangqiGameState = {
    ...createInitialXiangqiState('t'),
    status: { type: 'finished', winner: 'red', reason: 'general-captured' },
  };
  const result = applyMove(finished, { from: 'b1', to: 'c3' });
  assert.strictEqual(result, finished);
});

test('progressClock increments on a non-capture move', () => {
  const state = createInitialXiangqiState('t');
  const after1 = applyMove(state, { from: 'b1', to: 'c3' }); // horse move
  assert.equal(after1.progressClock, 1);
  const after2 = applyMove(after1, { from: 'b10', to: 'c8' }); // horse move
  assert.equal(after2.progressClock, 2);
});

test('progressClock does not reset on a soldier advance', () => {
  const state = createInitialXiangqiState('t');
  // Bump clock with 2 non-soldier moves (red general step, black horse step).
  const s = play(state, [
    ['e1', 'e2'],
    ['h10', 'g8'],
  ]);
  assert.ok(s.progressClock >= 2, `expected clock > 0 after 2 plies, got ${s.progressClock}`);
  // Red's turn; advance a soldier. Xiangqi no-capture limit keeps counting.
  const afterSoldier = applyMove(s, { from: 'e4', to: 'e5' });
  assert.equal(afterSoldier.progressClock, s.progressClock + 1);
});

test('progressClock resets on a capture', () => {
  const state = createInitialXiangqiState('t');
  // Bump clock; b3 cannon still has b8 as screen and b10 as captureable target.
  const s = play(state, [
    ['e1', 'e2'],
    ['h10', 'g8'],
  ]);
  assert.ok(s.progressClock >= 2);
  const capture = applyMove(s, { from: 'b3', to: 'b10' });
  assert.equal(capture.progressClock, 0);
  assert.deepEqual(capture.board.b10, { color: 'red', role: 'cannon' });
});

test('progress-clock auto-draw fires at the limit', () => {
  // Use a tight limit (4 plies of non-capture moves) and shuffle horses.
  const state = createInitialXiangqiState('t');
  const s = play(
    state,
    [
      ['b1', 'c3'],
      ['b10', 'c8'],
      ['c3', 'b1'],
      ['c8', 'b10'],
    ],
    { progressClockLimit: 4 },
  );
  // After 4 horse moves with no captures/soldiers, the 4th move should trip
  // the progress clock.
  assert.equal(s.status.type, 'finished');
  if (s.status.type === 'finished') {
    assert.equal(s.status.winner, null);
    assert.equal(s.status.reason, 'progress-clock');
  }
});

test('3-fold repetition: silent auto-draw on 3rd occurrence of the same true position', () => {
  // From initial, shuffle horses b1<->c3 and b10<->c8 to revisit the initial
  // position twice more. Use a high progress-clock limit to avoid that draw
  // firing first.
  const state = createInitialXiangqiState('t');
  // After 4 plies: initial position count = 2; after 8 plies: count = 3.
  const s = play(
    state,
    [
      ['b1', 'c3'],
      ['b10', 'c8'],
      ['c3', 'b1'],
      ['c8', 'b10'],
      ['b1', 'c3'],
      ['b10', 'c8'],
      ['c3', 'b1'],
      ['c8', 'b10'],
    ],
    { progressClockLimit: 200 },
  );
  assert.equal(s.status.type, 'finished');
  if (s.status.type === 'finished') {
    assert.equal(s.status.winner, null);
    assert.equal(s.status.reason, 'repetition');
  }
});

test('positionRepetitionKey distinguishes positions by turn', () => {
  const state = createInitialXiangqiState('t');
  const key1 = positionRepetitionKey(state);
  const otherTurn: XiangqiGameState = {
    ...state,
    status: { type: 'playing', turn: 'black' },
  };
  const key2 = positionRepetitionKey(otherTurn);
  assert.notEqual(key1, key2, 'same board with different turn = different key');
});
