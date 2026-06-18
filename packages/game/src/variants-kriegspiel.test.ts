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
