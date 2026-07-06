import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_LUZHANQI_SQUARES,
  applyLuzhanqiMove,
  createInitialLuzhanqiState,
  createPendingLuzhanqiState,
  getLuzhanqiLegalMovesFrom,
  getLuzhanqiPlayerView,
  isLuzhanqiCamp,
  isLuzhanqiFormation,
  isLuzhanqiHeadquarters,
  LUZHANQI_CAMPS,
  LUZHANQI_HEADQUARTERS,
  LUZHANQI_SETUP_SQUARES,
  type LuzhanqiBoard,
  type LuzhanqiColor,
  type LuzhanqiGameState,
  type LuzhanqiPiece,
  type LuzhanqiPieceRole,
  luzhanqiFormationForColor,
  luzhanqiTruthView,
  submitLuzhanqiFormation,
  validateLuzhanqiFormation,
} from './variants-luzhanqi.js';

function p(color: LuzhanqiColor, role: LuzhanqiPieceRole, immobile = false): LuzhanqiPiece {
  return { color, role, ...(immobile ? { immobile: true } : {}) };
}

function playing(board: LuzhanqiBoard, turn: LuzhanqiColor = 'red'): LuzhanqiGameState {
  return {
    id: 'test',
    board,
    status: { type: 'playing', turn },
    moveNumber: 1,
    ply: 0,
    revealedFlags: {},
  };
}

function dests(state: LuzhanqiGameState, from: string): string[] {
  return getLuzhanqiLegalMovesFrom(state, from as never)
    .map((m) => m.to)
    .sort();
}

test('board geometry exposes 60 playable points, 25 setup points per side, camps, and headquarters', () => {
  assert.equal(ALL_LUZHANQI_SQUARES.length, 60);
  assert.equal(LUZHANQI_SETUP_SQUARES.red.length, 25);
  assert.equal(LUZHANQI_SETUP_SQUARES.black.length, 25);
  assert.deepEqual(LUZHANQI_HEADQUARTERS.red, ['b1', 'd1']);
  assert.deepEqual(LUZHANQI_HEADQUARTERS.black, ['b13', 'd13']);
  for (const square of LUZHANQI_CAMPS.red) assert.ok(isLuzhanqiCamp(square));
  for (const square of LUZHANQI_HEADQUARTERS.black) assert.ok(isLuzhanqiHeadquarters(square));
  assert.ok(!LUZHANQI_SETUP_SQUARES.red.includes('b3'));
  assert.ok(!LUZHANQI_SETUP_SQUARES.black.includes('c10'));
});

test('default formations are legal and create the full hidden-identity start state', () => {
  const red = luzhanqiFormationForColor('red');
  const black = luzhanqiFormationForColor('black');
  assert.deepEqual(validateLuzhanqiFormation('red', red), { ok: true });
  assert.deepEqual(validateLuzhanqiFormation('black', black), { ok: true });
  const state = createInitialLuzhanqiState('g', red, black);
  assert.equal(Object.keys(state.board).length, 50);
  const redView = getLuzhanqiPlayerView(state, 'red');
  assert.deepEqual(redView.board.b1, { color: 'red', role: 'flag', known: true });
  assert.deepEqual(redView.board.b13, { color: 'black', known: false });
});

test('pending setup accepts private formations and starts only after both sides submit', () => {
  const pending = createPendingLuzhanqiState('setup');
  const red = luzhanqiFormationForColor('red');
  const black = luzhanqiFormationForColor('black');
  assert.equal(pending.status.type, 'setup');
  assert.equal(Object.keys(pending.board).length, 0);
  assert.ok(isLuzhanqiFormation(red));

  const afterRed = submitLuzhanqiFormation(pending, 'red', red);
  assert.equal(afterRed.status.type, 'setup');
  assert.deepEqual(getLuzhanqiPlayerView(afterRed, 'red').board.b1, {
    color: 'red',
    role: 'flag',
    known: true,
  });
  assert.equal(getLuzhanqiPlayerView(afterRed, 'black').board.b1?.known, false);

  const afterBlack = submitLuzhanqiFormation(afterRed, 'black', black);
  assert.deepEqual(afterBlack.status, { type: 'playing', turn: 'red' });
  assert.equal(Object.keys(afterBlack.board).length, 50);
});

test('formation validation rejects camp setup, wrong flag square, front-rank bombs, and advanced mines', () => {
  const bad = luzhanqiFormationForColor('red', {
    b3: 'captain',
    b1: 'general',
    a3: 'flag',
    a6: 'bomb',
    e5: 'mine',
  });
  const result = validateLuzhanqiFormation('red', bad);
  assert.equal(result.ok, false);
  if (!result.ok) {
    const types = result.errors.map((e) => e.type);
    assert.ok(types.includes('wrong-square'));
    assert.ok(types.includes('flag-not-in-headquarters'));
    assert.ok(types.includes('bomb-on-front-rank'));
    assert.ok(types.includes('mine-outside-back-two-ranks'));
  }
});

test('road moves are one edge, camps can be entered but occupied camps cannot be attacked', () => {
  const state = playing({ b4: p('red', 'captain'), b5: p('black', 'major') });
  assert.ok(dests(state, 'b4').includes('c4'));
  assert.ok(!dests(state, 'b4').includes('b5'));
});

test('rail movement is straight for normal pieces, while engineers can turn through rail junctions', () => {
  const normal = playing({ a2: p('red', 'captain') });
  assert.ok(dests(normal, 'a2').includes('a6'));
  assert.ok(dests(normal, 'a2').includes('e2'));
  assert.ok(!dests(normal, 'a2').includes('e6'));

  const engineer = playing({ a2: p('red', 'engineer') });
  assert.ok(dests(engineer, 'a2').includes('e6'));
});

test('rail movement crosses the frontline but pieces never land on frontline points', () => {
  const state = playing({ c6: p('red', 'captain') });
  assert.ok(dests(state, 'c6').includes('c8'));
  assert.ok(!dests(state, 'c6').includes('c7'));
});

test('black rail topology mirrors red from home rank toward the frontline', () => {
  const normal = playing({ a12: p('black', 'captain') }, 'black');
  assert.ok(dests(normal, 'a12').includes('e12'));
  assert.ok(dests(normal, 'a12').includes('a8'));
});

test('engineers clear mines and survive; non-engineers die while the mine remains', () => {
  const cleared = applyLuzhanqiMove(playing({ a6: p('red', 'engineer'), a8: p('black', 'mine') }), {
    from: 'a6',
    to: 'a8',
  });
  assert.deepEqual(cleared.board.a8, p('red', 'engineer'));

  const stopped = applyLuzhanqiMove(playing({ a6: p('red', 'captain'), a8: p('black', 'mine') }), {
    from: 'a6',
    to: 'a8',
  });
  assert.equal(stopped.board.a6, undefined);
  assert.deepEqual(stopped.board.a8, p('black', 'mine'));
});

test('rank combat removes the lower piece and equal ranks remove both', () => {
  const win = applyLuzhanqiMove(playing({ a6: p('red', 'general'), a8: p('black', 'captain') }), {
    from: 'a6',
    to: 'a8',
  });
  assert.deepEqual(win.board.a8, p('red', 'general'));

  const mutual = applyLuzhanqiMove(
    playing({ a6: p('red', 'captain'), a8: p('black', 'captain') }),
    {
      from: 'a6',
      to: 'a8',
    },
  );
  assert.equal(mutual.board.a6, undefined);
  assert.equal(mutual.board.a8, undefined);
});

test('capturing the flag wins immediately', () => {
  const next = applyLuzhanqiMove(playing({ b12: p('red', 'engineer'), b13: p('black', 'flag') }), {
    from: 'b12',
    to: 'b13',
  });
  assert.deepEqual(next.status, { type: 'finished', winner: 'red', reason: 'flag-captured' });
});

test('entering a non-flag headquarters locks the surviving attacker in place', () => {
  const next = applyLuzhanqiMove(
    playing({ b12: p('red', 'general'), b13: p('black', 'captain') }),
    {
      from: 'b12',
      to: 'b13',
    },
  );
  assert.deepEqual(next.board.b13, p('red', 'general', true));
  assert.deepEqual(
    getLuzhanqiLegalMovesFrom({ ...next, status: { type: 'playing', turn: 'red' } }, 'b13'),
    [],
  );
});

test('marshal loss reveals only that side flag location, not the rest of the formation', () => {
  const next = applyLuzhanqiMove(
    playing({
      b1: p('red', 'flag'),
      a6: p('red', 'marshal'),
      a8: p('black', 'bomb'),
      a13: p('black', 'flag'),
      c8: p('black', 'captain'),
    }),
    { from: 'a6', to: 'a8' },
  );
  assert.deepEqual(next.revealedFlags.red, 'b1');
  const blackView = getLuzhanqiPlayerView(next, 'black');
  assert.deepEqual(blackView.board.b1, { color: 'red', role: 'flag', known: true });
  assert.equal(blackView.board.a6, undefined);
});

test('player views do not reveal enemy rank after referee-adjudicated combat', () => {
  const before = playing({
    a6: p('red', 'captain'),
    a8: p('black', 'major'),
    e13: p('black', 'flag'),
  });
  assert.deepEqual(getLuzhanqiPlayerView(before, 'red').board.a8, { color: 'black', known: false });
  const after = applyLuzhanqiMove(before, { from: 'a6', to: 'a8' });
  assert.deepEqual(after.lastMove?.outcome, {
    type: 'battle',
    attackerRemoved: true,
    defenderRemoved: false,
  });
  assert.deepEqual(getLuzhanqiPlayerView(after, 'red').board.a8, { color: 'black', known: false });
});

test('truth view reveals every remaining identity for postgame review', () => {
  const state = playing({
    a6: p('red', 'captain'),
    a8: p('black', 'major'),
    e13: p('black', 'flag'),
  });
  assert.deepEqual(getLuzhanqiPlayerView(state, 'red').board.a8, { color: 'black', known: false });
  assert.deepEqual(luzhanqiTruthView(state).board.a8, {
    color: 'black',
    role: 'major',
    known: true,
  });
});
