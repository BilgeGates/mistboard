import assert from 'node:assert/strict';
import test from 'node:test';
import type { Color, Square } from './types.js';
import {
  applyRevealChessMove,
  assertValidRevealChessDeal,
  createInitialRevealChessState,
  createRevealChessDeal,
  getRevealChessLegalMovesFrom,
  getRevealChessPlayerView,
  isRevealChessLegalMove,
  oppositeRevealChessColor,
  type RevealChessBoard,
  type RevealChessColor,
  type RevealChessGameState,
  revealChessHomeSquares,
  revealChessStartingRole,
  revealChessTruthView,
  STANDARD_REVEAL_CHESS_DEAL,
} from './variants-reveal-chess.js';

function makeState(
  board: RevealChessBoard,
  turn: RevealChessColor = 'white',
  castlingRights: Square[] = [],
): RevealChessGameState {
  return {
    id: 'test',
    board,
    status: { type: 'playing', turn },
    moveNumber: 1,
    noProgressClock: 0,
    positionCounts: {},
    castlingRights: [...castlingRights],
    captures: [],
  };
}

function destsFrom(state: RevealChessGameState, from: Square): Set<string> {
  return new Set(getRevealChessLegalMovesFrom(state, from).map((m) => m.to));
}

test('initial state: 32 pieces, kings face-up, others face-down on home squares', () => {
  const state = createInitialRevealChessState('g');
  const entries = Object.entries(state.board);
  assert.equal(entries.length, 32);
  assert.deepEqual(state.board.e1, { color: 'white', role: 'king', faceDown: false });
  assert.deepEqual(state.board.e8, { color: 'black', role: 'king', faceDown: false });
  const faceDown = entries.filter(([, p]) => p?.faceDown);
  assert.equal(faceDown.length, 30);
  for (const color of ['white', 'black'] as Color[]) {
    for (const sq of revealChessHomeSquares(color)) {
      assert.equal(state.board[sq]?.color, color);
      assert.equal(state.board[sq]?.faceDown, true);
    }
  }
  assert.equal(state.castlingRights.length, 4);
});

test('home squares are the 15 non-king squares per side, in rank-then-file order', () => {
  assert.deepEqual(revealChessHomeSquares('white'), [
    'a1',
    'b1',
    'c1',
    'd1',
    'f1',
    'g1',
    'h1',
    'a2',
    'b2',
    'c2',
    'd2',
    'e2',
    'f2',
    'g2',
    'h2',
  ]);
  assert.equal(revealChessStartingRole('a1'), 'rook');
  assert.equal(revealChessStartingRole('b1'), 'knight');
  assert.equal(revealChessStartingRole('c1'), 'bishop');
  assert.equal(revealChessStartingRole('d1'), 'queen');
  assert.equal(revealChessStartingRole('h8'), 'rook');
  assert.equal(revealChessStartingRole('e2'), 'pawn');
});

test('createRevealChessDeal is deterministic per seed and always valid', () => {
  for (let seed = 0; seed < 50; seed += 1) {
    const rng = mulberry32(seed);
    const a = createRevealChessDeal(mulberry32(seed));
    const b = createRevealChessDeal(rng);
    assert.deepEqual(a, b);
    assert.doesNotThrow(() => assertValidRevealChessDeal(a));
  }
});

test('assertValidRevealChessDeal rejects a wrong multiset', () => {
  assert.throws(() =>
    assertValidRevealChessDeal({
      ...STANDARD_REVEAL_CHESS_DEAL,
      white: [...STANDARD_REVEAL_CHESS_DEAL.white.slice(0, 14), 'queen'], // two queens
    }),
  );
});

test('a face-down piece moves by ORIGIN role, then reveals to its true identity', () => {
  // True pawn sitting on a1: origin role rook, so it slides like a rook.
  const state = makeState({
    e1: { color: 'white', role: 'king', faceDown: false },
    e8: { color: 'black', role: 'king', faceDown: false },
    a1: { color: 'white', role: 'pawn', faceDown: true },
  });
  const dests = destsFrom(state, 'a1');
  assert.ok(dests.has('a5'), 'rook slide up the open file');
  assert.ok(dests.has('c1'), 'rook slide along the rank');
  assert.ok(!dests.has('b2'), 'not a bishop/pawn move');

  const next = applyRevealChessMove(state, { from: 'a1', to: 'a5' });
  assert.deepEqual(next.board.a5, { color: 'white', role: 'pawn', faceDown: false });
  assert.equal(next.board.a1, undefined);
  // Now it plays as its true identity (a pawn): a5 -> a6 only.
  const pawnState = { ...next, status: { type: 'playing', turn: 'white' } as const };
  assert.deepEqual([...destsFrom(pawnState, 'a5')], ['a6']);
});

test('pawns: one-square advance only, no two-square move, diagonal capture only', () => {
  const state = makeState({
    e1: { color: 'white', role: 'king', faceDown: false },
    e8: { color: 'black', role: 'king', faceDown: false },
    a2: { color: 'white', role: 'pawn', faceDown: false },
    b3: { color: 'black', role: 'knight', faceDown: false },
  });
  const dests = destsFrom(state, 'a2');
  assert.ok(dests.has('a3'), 'one-square advance');
  assert.ok(!dests.has('a4'), 'NO two-square advance');
  assert.ok(dests.has('b3'), 'diagonal capture of the enemy knight');
});

test('promotion on advance, and the reveal jackpot (slide as rook, reveal pawn, promote)', () => {
  // Advance promotion: a revealed pawn stepping to the last rank.
  const advance = makeState({
    e1: { color: 'white', role: 'king', faceDown: false },
    e8: { color: 'black', role: 'king', faceDown: false },
    a7: { color: 'white', role: 'pawn', faceDown: false },
  });
  const promoted = applyRevealChessMove(advance, { from: 'a7', to: 'a8', promotion: 'rook' });
  assert.deepEqual(promoted.board.a8, { color: 'white', role: 'rook', faceDown: false });

  // Reveal jackpot: a face-down true-pawn on a1 slides as a rook to a8, reveals a
  // pawn on the far rank, and promotes (defaults to queen).
  const jackpot = makeState({
    e1: { color: 'white', role: 'king', faceDown: false },
    e8: { color: 'black', role: 'king', faceDown: false },
    a1: { color: 'white', role: 'pawn', faceDown: true },
  });
  const win = applyRevealChessMove(jackpot, { from: 'a1', to: 'a8' });
  assert.deepEqual(win.board.a8, { color: 'white', role: 'queen', faceDown: false });
});

test('castling with a face-down corner: king + corner relocate, corner reveals, rights clear', () => {
  // h1 holds a face-down piece whose TRUE identity is a queen; origin role rook
  // lets the king castle, and the corner piece reveals as a queen on f1.
  const state = makeState(
    {
      e1: { color: 'white', role: 'king', faceDown: false },
      h1: { color: 'white', role: 'queen', faceDown: true },
      e8: { color: 'black', role: 'king', faceDown: false },
    },
    'white',
    ['a1', 'h1', 'a8', 'h8'],
  );
  assert.ok(isRevealChessLegalMove(state, { from: 'e1', to: 'h1' }), 'kingside castle is legal');
  const next = applyRevealChessMove(state, { from: 'e1', to: 'h1' });
  assert.deepEqual(next.board.g1, { color: 'white', role: 'king', faceDown: false });
  assert.deepEqual(
    next.board.f1,
    { color: 'white', role: 'queen', faceDown: false },
    'corner reveals',
  );
  assert.equal(next.board.e1, undefined);
  assert.equal(next.board.h1, undefined);
  assert.ok(!next.castlingRights.includes('h1'));
  assert.ok(!next.castlingRights.includes('a1'), 'king moved -> both white corners lost');
});

test('cannot castle through an attacked square', () => {
  // Black rook on f8 attacks f1, which the white king would pass through.
  const state = makeState(
    {
      e1: { color: 'white', role: 'king', faceDown: false },
      h1: { color: 'white', role: 'rook', faceDown: true },
      e8: { color: 'black', role: 'king', faceDown: false },
      f8: { color: 'black', role: 'rook', faceDown: false },
    },
    'white',
    ['h1'],
  );
  assert.ok(!isRevealChessLegalMove(state, { from: 'e1', to: 'h1' }));
});

test('checkmate is detected and ends the game (real check, king face-up)', () => {
  // White: Kc1 (move it out of the way), rook c-file to a1 delivers mate; queen
  // b6 covers a7/b7/b8. Black king a8 to be mated.
  const state = makeState(
    {
      e1: { color: 'white', role: 'king', faceDown: false },
      c1: { color: 'white', role: 'rook', faceDown: false },
      b6: { color: 'white', role: 'queen', faceDown: false },
      a8: { color: 'black', role: 'king', faceDown: false },
    },
    'white',
    [],
  );
  const mated = applyRevealChessMove(state, { from: 'c1', to: 'a1' });
  assert.equal(mated.status.type, 'finished');
  if (mated.status.type === 'finished') {
    assert.equal(mated.status.reason, 'checkmate');
    assert.equal(mated.status.winner, 'white');
  }
});

test('stalemate is a draw (not a loss)', () => {
  // Black king h8 has no legal move and is not in check after White plays Qg5-g6.
  const state = makeState(
    {
      f7: { color: 'white', role: 'king', faceDown: false },
      g5: { color: 'white', role: 'queen', faceDown: false },
      h8: { color: 'black', role: 'king', faceDown: false },
    },
    'white',
    [],
  );
  const drawn = applyRevealChessMove(state, { from: 'g5', to: 'g6' });
  assert.equal(drawn.status.type, 'finished');
  if (drawn.status.type === 'finished') {
    assert.equal(drawn.status.reason, 'stalemate');
    assert.equal(drawn.status.winner, null);
  }
});

test('an unmoved face-down piece gives check by its ORIGIN role', () => {
  // A true pawn on h1 (origin role rook) checks the black king on h5 down the file.
  const state = makeState({
    e1: { color: 'white', role: 'king', faceDown: false },
    h1: { color: 'white', role: 'pawn', faceDown: true },
    h5: { color: 'black', role: 'king', faceDown: false },
  });
  assert.equal(getRevealChessPlayerView(state, 'black').inCheck, true);
});

test('capturer-only reveal: only the capturer learns a captured face-down identity', () => {
  const state = makeState({
    e1: { color: 'white', role: 'king', faceDown: false },
    e8: { color: 'black', role: 'king', faceDown: false },
    d4: { color: 'white', role: 'rook', faceDown: false },
    d5: { color: 'black', role: 'pawn', faceDown: true },
  });
  const next = applyRevealChessMove(state, { from: 'd4', to: 'd5' });
  const capturerView = getRevealChessPlayerView(next, 'white');
  const ownerView = getRevealChessPlayerView(next, 'black');
  assert.deepEqual(capturerView.captured, [{ owner: 'black', role: 'pawn' }]);
  assert.deepEqual(ownerView.captured, [{ owner: 'black', role: null }]);
});

test('player view masks face-down identities for both players and is symmetric', () => {
  const state = createInitialRevealChessState('g');
  for (const color of ['white', 'black'] as RevealChessColor[]) {
    const view = getRevealChessPlayerView(state, color);
    for (const sq of revealChessHomeSquares('white')) {
      assert.deepEqual(view.board[sq], { color: 'white', faceDown: true });
    }
    assert.deepEqual(view.board.e1, { color: 'white', role: 'king', faceDown: false });
  }
  // Both seats see identical masked entries on every face-down square.
  const white = getRevealChessPlayerView(state, 'white').board;
  const black = getRevealChessPlayerView(state, 'black').board;
  for (const [sq, entry] of Object.entries(white)) {
    assert.deepEqual(black[sq as Square], entry);
  }
});

test('truth view reveals every identity (postgame), redacting nothing', () => {
  const state = createInitialRevealChessState('g');
  const truth = revealChessTruthView(state);
  for (const sq of revealChessHomeSquares('white')) {
    const entry = truth.board[sq];
    assert.equal(entry?.faceDown, false);
    assert.ok(entry && 'role' in entry);
  }
});

test('only the side to move has legal moves in its view', () => {
  const state = createInitialRevealChessState('g');
  assert.ok(getRevealChessPlayerView(state, 'white').legalMoves.length > 0);
  assert.equal(getRevealChessPlayerView(state, 'black').legalMoves.length, 0);
  assert.equal(oppositeRevealChessColor('white'), 'black');
});

// Seeded PRNG so tests are deterministic without Math.random.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
