import assert from 'node:assert/strict';
import test from 'node:test';
import type { Board, Color, Move } from './types.js';
import {
  applyKriegspielMove,
  createInitialKriegspielState,
  getKriegspielOfferedMoves,
  getKriegspielPlayerView,
  isLegalKriegspielMove,
  type KriegspielGameState,
  kriegspielAnnouncementFor,
  kriegspielCaptureAnnouncement,
  kriegspielCheckAnnouncement,
  kriegspielCheckCandidateSquares,
  kriegspielPawnTries,
} from './variants-kriegspiel.js';

function ks(
  board: Board,
  turn: Color,
  extra: Partial<KriegspielGameState> = {},
): KriegspielGameState {
  return {
    id: 'test',
    variant: 'kriegspiel',
    board,
    status: { type: 'playing', turn },
    moveNumber: 1,
    castlingRights: [],
    halfmoveClock: 0,
    ...extra,
  };
}

const hasMove = (moves: Move[], from: string, to: string): boolean =>
  moves.some((m) => m.from === from && m.to === to);

test('initial state is standard chess with white to move', () => {
  const state = createInitialKriegspielState('g1');
  assert.equal(state.variant, 'kriegspiel');
  assert.deepEqual(state.status, { type: 'playing', turn: 'white' });
  assert.equal(state.board.e1?.role, 'king');
  assert.equal(state.board.e8?.color, 'black');
  assert.equal(Object.keys(state.board).length, 32);
});

test('player view reveals only own pieces', () => {
  const state = createInitialKriegspielState('g1');
  const view = getKriegspielPlayerView(state, 'white');
  const colors = new Set(Object.values(view.board).map((p) => p?.color));
  assert.deepEqual([...colors], ['white']);
  assert.equal(Object.keys(view.board).length, 16);
  assert.equal(view.visibleSquares.length, 16);
});

test('offered moves are pseudo-legal: pawn diagonal probes onto empty squares', () => {
  const state = createInitialKriegspielState('g1');
  const offered = getKriegspielOfferedMoves(state, 'white');
  // Forward pushes.
  assert.ok(hasMove(offered, 'e2', 'e3'));
  assert.ok(hasMove(offered, 'e2', 'e4'));
  // Both diagonal capture probes are offered even though nothing is there.
  assert.ok(hasMove(offered, 'e2', 'd3'));
  assert.ok(hasMove(offered, 'e2', 'f3'));
  // Knight has its two opening jumps.
  assert.ok(hasMove(offered, 'b1', 'a3'));
  assert.ok(hasMove(offered, 'b1', 'c3'));
});

test('the umpire bounces an offered probe that the truth forbids', () => {
  const state = createInitialKriegspielState('g1');
  // The diagonal probe is OFFERED but illegal against the truth (empty square).
  assert.equal(isLegalKriegspielMove(state, { from: 'e2', to: 'd3' }), false);
  // A real push is legal.
  assert.equal(isLegalKriegspielMove(state, { from: 'e2', to: 'e4' }), true);
});

test('offered moves are empty when it is not your move', () => {
  const state = createInitialKriegspielState('g1');
  assert.deepEqual(getKriegspielOfferedMoves(state, 'black'), []);
  assert.equal(getKriegspielPlayerView(state, 'black').pawnTries, 0);
});

test('capture announcement: piece vs pawn, with the square', () => {
  const piece = ks(
    {
      e1: { color: 'white', role: 'king' },
      e8: { color: 'black', role: 'king' },
      d1: { color: 'white', role: 'queen' },
      d5: { color: 'black', role: 'rook' },
    },
    'white',
  );
  assert.deepEqual(kriegspielCaptureAnnouncement(piece, { from: 'd1', to: 'd5' }), {
    square: 'd5',
    kind: 'piece',
  });
  const pawn = ks(
    {
      e1: { color: 'white', role: 'king' },
      e8: { color: 'black', role: 'king' },
      e4: { color: 'white', role: 'pawn' },
      d5: { color: 'black', role: 'pawn' },
    },
    'white',
  );
  assert.deepEqual(kriegspielCaptureAnnouncement(pawn, { from: 'e4', to: 'd5' }), {
    square: 'd5',
    kind: 'pawn',
  });
});

test('capture announcement: en passant names the removed pawn square', () => {
  const state = ks(
    {
      e1: { color: 'white', role: 'king' },
      e8: { color: 'black', role: 'king' },
      e5: { color: 'white', role: 'pawn' },
      d5: { color: 'black', role: 'pawn' },
    },
    'white',
    { enPassantSquare: 'd6' },
  );
  assert.deepEqual(kriegspielCaptureAnnouncement(state, { from: 'e5', to: 'd6' }), {
    square: 'd5',
    kind: 'pawn',
  });
});

test('quiet move has no capture call', () => {
  const state = createInitialKriegspielState('g1');
  assert.equal(kriegspielCaptureAnnouncement(state, { from: 'e2', to: 'e4' }), undefined);
});

test('check categories: file, rank, knight', () => {
  const file = ks(
    {
      a1: { color: 'white', role: 'king' },
      e8: { color: 'black', role: 'king' },
      e2: { color: 'white', role: 'rook' },
    },
    'black',
  );
  assert.deepEqual(kriegspielCheckAnnouncement(file), ['file']);
  const rank = ks(
    {
      e1: { color: 'white', role: 'king' },
      a5: { color: 'black', role: 'king' },
      h5: { color: 'white', role: 'rook' },
    },
    'black',
  );
  assert.deepEqual(kriegspielCheckAnnouncement(rank), ['rank']);
  const knight = ks(
    {
      a1: { color: 'white', role: 'king' },
      e8: { color: 'black', role: 'king' },
      f6: { color: 'white', role: 'knight' },
    },
    'black',
  );
  assert.deepEqual(kriegspielCheckAnnouncement(knight), ['knight']);
});

test('check categories: long vs short diagonal', () => {
  // King b8: the file+rank=8 diagonal (7 squares) is the long one.
  const long = ks(
    {
      e1: { color: 'white', role: 'king' },
      b8: { color: 'black', role: 'king' },
      d6: { color: 'white', role: 'bishop' },
    },
    'black',
  );
  assert.deepEqual(kriegspielCheckAnnouncement(long), ['long-diagonal']);
  // From a7 (the 2-square diagonal) it is the short one.
  const short = ks(
    {
      e1: { color: 'white', role: 'king' },
      b8: { color: 'black', role: 'king' },
      a7: { color: 'white', role: 'bishop' },
    },
    'black',
  );
  assert.deepEqual(kriegspielCheckAnnouncement(short), ['short-diagonal']);
});

test('double check announces both categories, de-duplicated', () => {
  const state = ks(
    {
      a1: { color: 'white', role: 'king' },
      e8: { color: 'black', role: 'king' },
      e2: { color: 'white', role: 'rook' },
      g7: { color: 'white', role: 'knight' },
    },
    'black',
  );
  const categories = kriegspielCheckAnnouncement(state).sort();
  assert.deepEqual(categories, ['file', 'knight']);
});

test('no check yields no categories', () => {
  const state = createInitialKriegspielState('g1');
  assert.deepEqual(kriegspielCheckAnnouncement(state), []);
});

test('pawn tries count the capturing pawn moves', () => {
  const state = ks(
    {
      e1: { color: 'white', role: 'king' },
      e8: { color: 'black', role: 'king' },
      e4: { color: 'white', role: 'pawn' },
      d5: { color: 'black', role: 'knight' },
      f5: { color: 'black', role: 'knight' },
    },
    'white',
  );
  assert.equal(kriegspielPawnTries(state, 'white'), 2);
  assert.equal(kriegspielPawnTries(state, 'black'), 0);
});

test('applying a checkmating move finishes the game with the right check call', () => {
  // K+Q mate: Qd7-a7# boxes the lone king in the corner, supported by Kb6.
  const before = ks(
    {
      b6: { color: 'white', role: 'king' },
      d7: { color: 'white', role: 'queen' },
      a8: { color: 'black', role: 'king' },
    },
    'white',
  );
  const move: Move = { from: 'd7', to: 'a7' };
  assert.equal(isLegalKriegspielMove(before, move), true);
  const after = applyKriegspielMove(before, move);
  assert.equal(after.status.type, 'finished');
  assert.equal(after.status.type === 'finished' && after.status.winner, 'white');
  assert.equal(after.status.type === 'finished' && after.status.reason, 'checkmate');
  // The mate is delivered along the a-file.
  const announcement = kriegspielAnnouncementFor(before, move, after);
  assert.deepEqual(announcement, { check: ['file'] });
});

test('the umpire auto-claims the fifty-move and threefold draws (standard chess)', () => {
  const back = {
    e1: { color: 'white', role: 'king' },
    a1: { color: 'white', role: 'rook' },
    e8: { color: 'black', role: 'king' },
    h8: { color: 'black', role: 'rook' },
  } as const;
  // Fifty-move: a quiet move at half-move 100.
  const fifty = ks(back, 'white', { halfmoveClock: 99 });
  assert.deepEqual(applyKriegspielMove(fifty, { from: 'a1', to: 'b1' }).status, {
    type: 'finished',
    winner: null,
    reason: 'draw',
  });
  // Threefold: shuffle the rooks back to the start position three times.
  let state = ks(back, 'white');
  const shuffle = [
    ['a1', 'b1'],
    ['h8', 'g8'],
    ['b1', 'a1'],
    ['g8', 'h8'],
    ['a1', 'b1'],
    ['h8', 'g8'],
    ['b1', 'a1'],
    ['g8', 'h8'],
  ] as const;
  for (const [from, to] of shuffle) state = applyKriegspielMove(state, { from, to });
  assert.equal(state.status.type === 'finished' && state.status.reason, 'draw');
});

test('check candidates: a knight check marks the (≤8) knight squares around the king', () => {
  const squares = kriegspielCheckCandidateSquares('e1', ['knight'], []).sort();
  // From e1 the in-board knight squares are c2, d3, f3, g2.
  assert.deepEqual(squares, ['c2', 'd3', 'f3', 'g2']);
});

test('check candidates: a file check walks the king file, stopping at own pieces', () => {
  // King e1, own pawn on e3 blocks the upward walk after e2.
  const squares = kriegspielCheckCandidateSquares('e1', ['file'], ['e3']).sort();
  // Upward: e2 (then e3 is own → stop). Downward: none (e1 is rank 1).
  assert.deepEqual(squares, ['e2']);
});

test('check candidates: a rank check walks both ways along the king rank', () => {
  const squares = kriegspielCheckCandidateSquares('d4', ['rank'], ['b4']).sort();
  // Left: c4 (then b4 own → stop). Right: e4,f4,g4,h4.
  assert.deepEqual(squares, ['c4', 'e4', 'f4', 'g4', 'h4']);
});

test('check candidates: long vs short diagonal pick different diagonals through the king', () => {
  // King b8: the long diagonal is the b8-h2 run; the short is just a7.
  assert.deepEqual(kriegspielCheckCandidateSquares('b8', ['long-diagonal'], []).sort(), [
    'c7',
    'd6',
    'e5',
    'f4',
    'g3',
    'h2',
  ]);
  assert.deepEqual(kriegspielCheckCandidateSquares('b8', ['short-diagonal'], []), ['a7']);
});

test('check candidates: a double check unions both candidate sets', () => {
  const squares = kriegspielCheckCandidateSquares('e1', ['file', 'knight'], []);
  // The file ray e2..e8 plus the knight squares, all present.
  assert.ok(squares.includes('e5'));
  assert.ok(squares.includes('f3'));
  assert.ok(squares.includes('d3'));
});

test('applying a quiet checking move keeps play going, turn passes', () => {
  const before = ks(
    {
      h1: { color: 'white', role: 'king' },
      a1: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
      b7: { color: 'black', role: 'knight' },
    },
    'white',
  );
  const move: Move = { from: 'a1', to: 'e1' };
  const after = applyKriegspielMove(before, move);
  assert.deepEqual(after.status, { type: 'playing', turn: 'black' });
  assert.deepEqual(kriegspielAnnouncementFor(before, move, after), { check: ['file'] });
});
