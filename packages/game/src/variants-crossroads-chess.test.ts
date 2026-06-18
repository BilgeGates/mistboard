import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCrossroadsChessMove,
  applyCrossroadsChessOpenMove,
  type CrossroadsChessBoard,
  type CrossroadsChessColor,
  type CrossroadsChessGameState,
  type CrossroadsChessPiece,
  type CrossroadsChessSquare,
  computeCrossroadsChessVision,
  createInitialCrossroadsChessBoard,
  createInitialCrossroadsChessState,
  getCrossroadsChessLegalMovesFrom,
  getCrossroadsChessOpenLegalMovesFrom,
  getCrossroadsChessOpenView,
  getCrossroadsChessPlayerView,
  isCrossroadsChessKingAttacked,
  oppositeCrossroadsChessColor,
} from './variants-crossroads-chess.js';

// Build a playing state from a sparse piece map (for targeted rule tests).
function stateWith(
  board: CrossroadsChessBoard,
  turn: CrossroadsChessColor = 'white',
  overrides: Partial<CrossroadsChessGameState> = {},
): CrossroadsChessGameState {
  return {
    id: 'test',
    board,
    status: { type: 'playing', turn },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
    ...overrides,
  };
}

function p(color: CrossroadsChessColor, role: CrossroadsChessPiece['role']): CrossroadsChessPiece {
  return { color, role };
}

function destinations(state: CrossroadsChessGameState, from: CrossroadsChessSquare): Set<string> {
  return new Set(getCrossroadsChessLegalMovesFrom(state, from).map((m) => m.to));
}

test('initial board matches the canonical FEN layout', () => {
  const b = createInitialCrossroadsChessBoard();
  // White back rank a1..f1 = chariot, cannon, horse, knight, king, bishop.
  assert.deepEqual(b.a1, p('white', 'chariot'));
  assert.deepEqual(b.b1, p('white', 'cannon'));
  assert.deepEqual(b.c1, p('white', 'horse'));
  assert.deepEqual(b.d1, p('white', 'knight'));
  assert.deepEqual(b.e1, p('white', 'king'));
  assert.deepEqual(b.f1, p('white', 'bishop'));
  // White front rank a2..f2 = soldier, soldier, soldier, pawn, pawn, pawn.
  assert.deepEqual(b.a2, p('white', 'soldier'));
  assert.deepEqual(b.d2, p('white', 'pawn'));
  // Red is the 180-degree rotation: a8 = bishop, f8 = chariot.
  assert.deepEqual(b.a8, p('red', 'bishop'));
  assert.deepEqual(b.b8, p('red', 'king'));
  assert.deepEqual(b.f8, p('red', 'chariot'));
  assert.deepEqual(b.a7, p('red', 'pawn'));
  assert.deepEqual(b.d7, p('red', 'soldier'));
  // 24 pieces total (12 per side).
  assert.equal(Object.keys(b).length, 24);
});

test('initial state seeds its own repetition count and White to move', () => {
  const s = createInitialCrossroadsChessState('g1');
  assert.equal(s.status.type, 'playing');
  assert.equal(s.status.type === 'playing' && s.status.turn, 'white');
  assert.equal(
    Object.values(s.positionCounts).reduce((a, x) => a + x, 0),
    1,
  );
});

test('king steps one square in all eight directions', () => {
  const s = stateWith({ c4: p('white', 'king') });
  assert.deepEqual(
    destinations(s, 'c4'),
    new Set(['b3', 'c3', 'd3', 'b4', 'd4', 'b5', 'c5', 'd5']),
  );
});

test('knight is an unblockable leaper; horse is blocked by its leg', () => {
  // Knight surrounded by friendly pieces still jumps out.
  const knight = stateWith({
    c4: p('white', 'knight'),
    c5: p('white', 'pawn'),
    d4: p('white', 'pawn'),
  });
  assert.equal(destinations(knight, 'c4').has('d6'), true);
  assert.equal(destinations(knight, 'c4').has('e5'), true);

  // Horse leg toward the [1,2] leap is c5 → that leap (d6) is blocked.
  const horse = stateWith({ c4: p('white', 'horse'), c5: p('white', 'pawn') });
  const horseDests = destinations(horse, 'c4');
  assert.equal(horseDests.has('d6'), false); // blocked by the c5 leg
  assert.equal(horseDests.has('b6'), false); // same leg blocks the [-1,2] leap
  assert.equal(horseDests.has('e5'), true); // leg d4 is empty
});

test('cannon needs exactly one screen to capture and slides over empties', () => {
  // Cannon a1, screen at a3, enemy at a6. It may slide a2, then capture a6.
  const s = stateWith({
    a1: p('white', 'cannon'),
    a3: p('red', 'soldier'),
    a6: p('red', 'chariot'),
  });
  const dests = destinations(s, 'a1');
  assert.equal(dests.has('a2'), true); // empty slide up to the screen
  assert.equal(dests.has('a3'), false); // cannot land on the screen
  assert.equal(dests.has('a6'), true); // jump the screen, capture beyond
  // With no screen, no capture is available.
  const noScreen = stateWith({ a1: p('white', 'cannon'), a6: p('red', 'chariot') });
  assert.equal(destinations(noScreen, 'a1').has('a6'), false);
});

test('pawn pushes, double-steps from the start rank, and captures diagonally', () => {
  const s = stateWith({
    c2: p('white', 'pawn'),
    b3: p('red', 'soldier'),
    d3: p('white', 'soldier'), // friendly, not capturable
  });
  const dests = destinations(s, 'c2');
  assert.equal(dests.has('c3'), true); // single push
  assert.equal(dests.has('c4'), true); // double-step from start rank
  assert.equal(dests.has('b3'), true); // diagonal capture of enemy
  assert.equal(dests.has('d3'), false); // own piece, not a capture
});

test('pawn promotes to Queen only, mandatory on the far rank', () => {
  const s = stateWith({ c7: p('white', 'pawn') });
  const moves = getCrossroadsChessLegalMovesFrom(s, 'c7');
  const promo = moves.find((m) => m.to === 'c8');
  assert.ok(promo, 'expected a push to the far rank');
  assert.equal(promo?.promotion, 'queen');
  // Only one promotion option exists (no under-promotion).
  assert.equal(moves.filter((m) => m.to === 'c8').length, 1);

  const after = applyCrossroadsChessMove(s, { from: 'c7', to: 'c8' });
  assert.deepEqual(after.board.c8, p('white', 'queen'));
});

test('soldier is forward-only before the river and gains sideways after', () => {
  // White soldier on rank 4 (own half): forward only.
  const before = stateWith({ c4: p('white', 'soldier') });
  assert.deepEqual(destinations(before, 'c4'), new Set(['c5']));
  // White soldier on rank 5 (crossed the river): forward + sideways.
  const after = stateWith({ c5: p('white', 'soldier') });
  assert.deepEqual(destinations(after, 'c5'), new Set(['c6', 'b5', 'd5']));
});

test('reaching the enemy far rank ARMS a pending Try, resolved on the reply', () => {
  // Dark mode: the King reaching a clear far rank does not win outright — it
  // arms a Try and hands the opponent one reply. Red cannot capture the safe
  // King, so any reply resolves the Try as a White Race win.
  const s = stateWith({ c7: p('white', 'king'), a1: p('red', 'king') });
  const armed = applyCrossroadsChessMove(s, { from: 'c7', to: 'c8' });
  assert.equal(armed.status.type, 'playing', 'reaching the far rank does not win outright');
  assert.equal(armed.pendingTry, 'white');
  const resolved = applyCrossroadsChessMove(armed, { from: 'a1', to: 'a2' });
  assert.equal(resolved.status.type === 'finished' && resolved.status.reason, 'race');
  assert.equal(resolved.status.type === 'finished' && resolved.status.winner, 'white');
});

test('a pending Try: the opponent answers it by capturing the en-prise King', () => {
  // A red chariot on a8 rakes rank 8, so White's King reaching c8 arms a Try but
  // lands en prise. This is the fog-relevant case — a defender covering the far
  // rank (even one the racer could not see; the kernel reads the canonical
  // board) can answer the Try by capturing the King on its single reply.
  const guarded = stateWith({
    c7: p('white', 'king'),
    a8: p('red', 'chariot'),
    a1: p('red', 'king'),
  });
  const armed = applyCrossroadsChessMove(guarded, { from: 'c7', to: 'c8' });
  assert.equal(armed.status.type, 'playing', 'reaching the far rank does not win outright');
  assert.equal(armed.pendingTry, 'white');
  // Red answers the Try by taking the King -> king-capture win for Red.
  const captured = applyCrossroadsChessMove(armed, { from: 'a8', to: 'c8' });
  assert.equal(captured.status.type === 'finished' && captured.status.reason, 'king-captured');
  assert.equal(captured.status.type === 'finished' && captured.status.winner, 'red');
  // But if Red ignores the Try instead of capturing, it resolves as a White win.
  const ignored = applyCrossroadsChessMove(armed, { from: 'a1', to: 'b1' });
  assert.equal(ignored.status.type === 'finished' && ignored.status.reason, 'race');
  assert.equal(ignored.status.type === 'finished' && ignored.status.winner, 'white');
});

test('pendingTry in the fog view is racer-only (hidden-info regression)', () => {
  // White arms a Try. The racer's view must expose it (for their banner); the
  // opponent's must NOT — under fog it would betray an out-of-vision racing King.
  const armed = applyCrossroadsChessMove(
    stateWith({ c7: p('white', 'king'), a1: p('red', 'king') }),
    { from: 'c7', to: 'c8' },
  );
  assert.equal(armed.pendingTry, 'white');
  assert.equal(getCrossroadsChessPlayerView(armed, 'white').pendingTry, 'white');
  assert.equal(getCrossroadsChessPlayerView(armed, 'red').pendingTry, undefined);
});

test('capturing the enemy King wins (dark-mode king-capture)', () => {
  const s = stateWith({ a1: p('white', 'chariot'), a5: p('red', 'king'), f8: p('red', 'chariot') });
  const after = applyCrossroadsChessMove(s, { from: 'a1', to: 'a5' });
  assert.equal(after.status.type === 'finished' && after.status.reason, 'king-captured');
  assert.equal(after.status.type === 'finished' && after.status.winner, 'white');
});

test('stalemate is a loss for the side with no legal move', () => {
  // A genuine zero-move corner for Red. Pawns (unlike Soldiers) have no sideways
  // escape, so a King boxed by its own pawns against the edge is fully stuck:
  //   a1 King  — neighbours a2/b1/b2 are all own pawns
  //   a2 Pawn  — forward a1 blocked by own King, no diagonal capture
  //   b1 Pawn  — on the edge rank, forward and both diagonals are off-board
  //   b2 Pawn  — forward b1 blocked by own pawn, no diagonal capture
  const trapped = stateWith(
    {
      a1: p('red', 'king'),
      a2: p('red', 'pawn'),
      b1: p('red', 'pawn'),
      b2: p('red', 'pawn'),
      f1: p('white', 'king'),
      e3: p('white', 'pawn'),
    },
    'white',
  );
  // White plays a quiet move far away; then it's Red's turn with no legal move.
  const after = applyCrossroadsChessMove(trapped, { from: 'e3', to: 'e4' });
  assert.equal(after.status.type, 'finished');
  assert.equal(after.status.type === 'finished' && after.status.reason, 'stalemate');
  assert.equal(after.status.type === 'finished' && after.status.winner, 'white');
});

test('threefold repetition is a DRAW under fog (dark referee)', () => {
  // Two lone kings shuffling on opposite files repeat positions until 3-fold.
  // Open Crossroads makes this a loss for the repeater, but under fog neither
  // side can see the canonical position recur, so the dark referee draws.
  let s = stateWith({ a1: p('white', 'king'), f8: p('red', 'king') }, 'white');
  const cycle: [CrossroadsChessSquare, CrossroadsChessSquare][] = [
    ['a1', 'a2'],
    ['f8', 'f7'],
    ['a2', 'a1'],
    ['f7', 'f8'],
  ];
  let finished = false;
  for (let i = 0; i < 16 && !finished; i += 1) {
    const [from, to] = cycle[i % cycle.length];
    s = applyCrossroadsChessMove(s, { from, to });
    if (s.status.type === 'finished') {
      finished = true;
      assert.equal(s.status.reason, 'repetition');
      // Fog fairness: a repetition draws (no winner), matching dark chess.
      assert.equal(s.status.winner, null);
    }
  }
  assert.equal(finished, true, 'expected a repetition terminal within a few cycles');
});

test('threefold repetition is a LOSS for the repeater in open Crossroads', () => {
  // Perfect-info mode keeps the anti-draw rule: with full sight of the board the
  // mover who completes the repetition is choosing it, so the opponent wins.
  let s = stateWith({ a1: p('white', 'king'), f8: p('red', 'king') }, 'white');
  const cycle: [CrossroadsChessSquare, CrossroadsChessSquare][] = [
    ['a1', 'a2'],
    ['f8', 'f7'],
    ['a2', 'a1'],
    ['f7', 'f8'],
  ];
  let finished = false;
  for (let i = 0; i < 16 && !finished; i += 1) {
    const [from, to] = cycle[i % cycle.length];
    s = applyCrossroadsChessOpenMove(s, { from, to });
    if (s.status.type === 'finished') {
      finished = true;
      assert.equal(s.status.reason, 'repetition');
      // Anti-draw: a finished repetition awards a winner (never null).
      assert.notEqual(s.status.winner, null);
    }
  }
  assert.equal(finished, true, 'expected a repetition terminal within a few cycles');
});

// ── Hidden-info regression: the architecture invariant ──────────────────────

test('player view never reveals a fully hidden enemy piece', () => {
  // White lone king on a1; Red chariot far away on f8, not in any field of fire.
  const s = stateWith({ a1: p('white', 'king'), f8: p('red', 'chariot') }, 'white');
  const view = getCrossroadsChessPlayerView(s, 'white');
  assert.equal(view.board.f8, undefined, 'hidden enemy must not appear in the view');
  assert.equal(view.visibleSquares.includes('f8'), false);
  // The king still sees its own square and its field of fire.
  assert.equal(view.visibleSquares.includes('a1'), true);
  assert.equal(view.visibleSquares.includes('b2'), true);
});

test('cannon reveals the enemy target through its screen', () => {
  const s = stateWith(
    { a1: p('white', 'cannon'), a3: p('red', 'soldier'), a6: p('red', 'chariot') },
    'white',
  );
  const view = getCrossroadsChessPlayerView(s, 'white');
  // The screen is a shrouded silhouette (color only); the target beyond is fully seen.
  assert.equal(view.board.a3?.shrouded, true);
  assert.deepEqual(view.board.a6, { piece: p('red', 'chariot'), shrouded: false });
});

test('horse blocked leg shows a silhouette, not the piece behind it', () => {
  const s = stateWith({ c4: p('white', 'horse'), c5: p('red', 'soldier') }, 'white');
  const view = getCrossroadsChessPlayerView(s, 'white');
  // The c5 leg is occupied by an enemy → shrouded silhouette (color only).
  assert.equal(view.board.c5?.shrouded, true);
  if (view.board.c5?.shrouded) assert.equal(view.board.c5.color, 'red');
  // The blocked destination d6 is NOT revealed.
  assert.equal(view.visibleSquares.includes('d6'), false);
});

test('open (perfect-info) view shows the whole board; dark view hides it', () => {
  const s = stateWith({ a1: p('white', 'king'), f8: p('red', 'chariot') }, 'white');
  // Dark view: the distant enemy chariot is hidden.
  assert.equal(getCrossroadsChessPlayerView(s, 'white').board.f8, undefined);
  // Open view: the whole board is visible to both sides.
  const open = getCrossroadsChessOpenView(s, 'white');
  assert.deepEqual(open.board.f8, { piece: p('red', 'chariot'), shrouded: false });
  assert.equal(open.visibleSquares.includes('f8'), true);
  // Sanity on the color helper.
  assert.equal(oppositeCrossroadsChessColor('white'), 'red');
  assert.equal(oppositeCrossroadsChessColor('red'), 'white');
});

test('computeCrossroadsChessVision is defined for finished states (no view collapse)', () => {
  const s = stateWith({ a1: p('white', 'king'), b1: p('red', 'king') }, 'white');
  const finished: CrossroadsChessGameState = {
    ...s,
    status: { type: 'finished', winner: 'white', reason: 'king-captured' },
  };
  const vision = computeCrossroadsChessVision(finished, 'white');
  assert.equal(vision.directlyVisible.has('a1'), true);
});

// ── Perfect-information referee ──────────────────────────────────────────────

test('isKingAttacked covers chariots, screened cannons, pawns and kings', () => {
  // Chariot down a clear file.
  assert.equal(
    isCrossroadsChessKingAttacked({ e4: p('white', 'king'), e8: p('red', 'chariot') }, 'white'),
    true,
  );
  // ...blocked by an intervening piece.
  assert.equal(
    isCrossroadsChessKingAttacked(
      { e4: p('white', 'king'), e6: p('white', 'pawn'), e8: p('red', 'chariot') },
      'white',
    ),
    false,
  );
  // Cannon needs a screen to attack the King.
  assert.equal(
    isCrossroadsChessKingAttacked(
      { a1: p('white', 'king'), a4: p('white', 'pawn'), a8: p('red', 'cannon') },
      'white',
    ),
    true,
  );
  assert.equal(
    isCrossroadsChessKingAttacked({ a1: p('white', 'king'), a8: p('red', 'cannon') }, 'white'),
    false,
  );
  // Red pawn attacks diagonally toward rank 1.
  assert.equal(
    isCrossroadsChessKingAttacked({ c4: p('white', 'king'), d5: p('red', 'pawn') }, 'white'),
    true,
  );
  // Adjacent enemy King.
  assert.equal(
    isCrossroadsChessKingAttacked({ e4: p('white', 'king'), e5: p('red', 'king') }, 'white'),
    true,
  );
});

test('self-check filter: king cannot step into attack or beside the enemy king', () => {
  // Chariot on d8 controls the d-file; the King on e4 may not step to d4.
  const checkStep = stateWith({
    e4: p('white', 'king'),
    d8: p('red', 'chariot'),
    a1: p('red', 'king'),
  });
  const dests = destinations2(checkStep, 'e4');
  assert.equal(dests.has('d4'), false);
  assert.equal(dests.has('f4'), true);
  // Kings may not be adjacent: the c4 King cannot move to d4 beside an e4 King.
  const kissing = stateWith({ c4: p('white', 'king'), e4: p('red', 'king') });
  assert.equal(destinations2(kissing, 'c4').has('d4'), false);
});

test('a fully pinned piece has no legal moves', () => {
  // Bishop on e2 is pinned to the e1 King by the chariot on e8.
  const s = stateWith({
    e1: p('white', 'king'),
    e2: p('white', 'bishop'),
    e8: p('red', 'chariot'),
    a8: p('red', 'king'),
  });
  assert.equal(getCrossroadsChessOpenLegalMovesFrom(s, 'e2').length, 0);
});

test('checkmate ends the game as a perfect-info win', () => {
  // Chariot b1 covers the b-file (b7/b8); the lone Red king on a8 is mated when
  // White swings the second chariot to a3 and checks down the a-file.
  const s = stateWith(
    {
      a8: p('red', 'king'),
      b1: p('white', 'chariot'),
      f3: p('white', 'chariot'),
      f1: p('white', 'king'),
    },
    'white',
  );
  const after = applyCrossroadsChessOpenMove(s, { from: 'f3', to: 'a3' });
  assert.equal(after.status.type, 'finished');
  assert.equal(after.status.type === 'finished' && after.status.reason, 'checkmate');
  assert.equal(after.status.type === 'finished' && after.status.winner, 'white');
});

test('stalemate is a perfect-info loss (not a draw)', () => {
  // Red king boxed by its own pawns, not in check, with no legal move.
  const trapped = stateWith(
    {
      a1: p('red', 'king'),
      a2: p('red', 'pawn'),
      b1: p('red', 'pawn'),
      b2: p('red', 'pawn'),
      f1: p('white', 'king'),
      e3: p('white', 'pawn'),
    },
    'white',
  );
  const after = applyCrossroadsChessOpenMove(trapped, { from: 'e3', to: 'e4' });
  assert.equal(after.status.type === 'finished' && after.status.reason, 'stalemate');
  assert.equal(after.status.type === 'finished' && after.status.winner, 'white');
});

test('safe Try: the king wins by reaching the far rank but not an attacked one', () => {
  // Clear far rank: e7 King races to e8 and wins.
  const safe = stateWith({ e7: p('white', 'king'), a1: p('red', 'king') });
  const won = applyCrossroadsChessOpenMove(safe, { from: 'e7', to: 'e8' });
  assert.equal(won.status.type === 'finished' && won.status.reason, 'race');
  assert.equal(won.status.type === 'finished' && won.status.winner, 'white');
  // Attacked far rank: a chariot on a8 rakes rank 8, so e8 is illegal (no Try).
  const guarded = stateWith({
    e7: p('white', 'king'),
    a8: p('red', 'chariot'),
    a1: p('red', 'king'),
  });
  assert.equal(
    getCrossroadsChessOpenLegalMovesFrom(guarded, 'e7').some((m) => m.to === 'e8'),
    false,
  );
});

function destinations2(state: CrossroadsChessGameState, from: CrossroadsChessSquare): Set<string> {
  return new Set(getCrossroadsChessOpenLegalMovesFrom(state, from).map((m) => m.to));
}
