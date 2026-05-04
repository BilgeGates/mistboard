import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameState } from './types.js';
import { draft960Variant, fogOfWarVariant } from './variants.js';

test('Draft960 exposes legal moves once playing', () => {
  const state: GameState = {
    ...draft960Variant.createInitialState('legal-moves'),
    status: { type: 'playing', turn: 'white' } as const,
  };

  const moves = draft960Variant.getLegalMoves(state, 'white');
  assert.equal(moves.length, 20);
  assert.ok(moves.some((move) => move.from === 'e2' && move.to === 'e4'));
  assert.equal(draft960Variant.getLegalMoves(state, 'black').length, 0);
});

test('Draft960 applies legal moves through the rules adapter', () => {
  const state = {
    ...draft960Variant.createInitialState('apply-move'),
    status: { type: 'playing', turn: 'white' } as const,
  };

  const next = draft960Variant.applyMove(state, { from: 'e2', to: 'e4' });

  assert.equal(next.board.e2, undefined);
  assert.deepEqual(next.board.e4, { color: 'white', role: 'pawn' });
  assert.deepEqual(next.status, { type: 'playing', turn: 'black' });
  assert.deepEqual(next.lastMove, { from: 'e2', to: 'e4' });
});

test('Draft960 rejects illegal moves without changing state', () => {
  const state = {
    ...draft960Variant.createInitialState('illegal-move'),
    status: { type: 'playing', turn: 'white' } as const,
  };

  assert.equal(draft960Variant.applyMove(state, { from: 'e2', to: 'e5' }), state);
});

test('Draft960 exposes and applies explicit promotion choices', () => {
  const state: GameState = {
    ...draft960Variant.createInitialState('promotion'),
    board: {
      a7: { color: 'white', role: 'pawn' },
      e1: { color: 'white', role: 'king' },
      e8: { color: 'black', role: 'king' },
    },
    status: { type: 'playing', turn: 'white' } as const,
    castlingRights: [],
  };

  const promotions = draft960Variant
    .getLegalMoves(state, 'white')
    .filter((move) => move.from === 'a7' && move.to === 'a8')
    .map((move) => move.promotion)
    .sort();

  assert.deepEqual(promotions, ['bishop', 'knight', 'queen', 'rook']);

  const next = draft960Variant.applyMove(state, { from: 'a7', to: 'a8', promotion: 'knight' });
  assert.equal(next.board.a7, undefined);
  assert.deepEqual(next.board.a8, { color: 'white', role: 'knight' });
});

test('Draft960 applies castling moves represented as king to rook square', () => {
  const state: GameState = {
    ...draft960Variant.createInitialState('castle'),
    board: {
      e1: { color: 'white', role: 'king' },
      h1: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
      h8: { color: 'black', role: 'rook' },
    },
    status: { type: 'playing', turn: 'white' } as const,
    castlingRights: ['h1', 'h8'],
  };

  const moves = draft960Variant.getLegalMoves(state, 'white');
  assert.ok(moves.some((move) => move.from === 'e1' && move.to === 'h1'));

  const next = draft960Variant.applyMove(state, { from: 'e1', to: 'h1' });
  assert.equal(next.board.e1, undefined);
  assert.equal(next.board.h1, undefined);
  assert.deepEqual(next.board.g1, { color: 'white', role: 'king' });
  assert.deepEqual(next.board.f1, { color: 'white', role: 'rook' });
});

test('Fog of War view includes own pieces and legal destination squares', () => {
  const state: GameState = {
    ...fogOfWarVariant.createInitialState('fog-visibility'),
    board: {
      a1: { color: 'white', role: 'rook' },
      e1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'pawn' },
      a4: { color: 'black', role: 'rook' },
      e8: { color: 'black', role: 'king' },
      h8: { color: 'black', role: 'bishop' },
    },
    status: { type: 'playing', turn: 'white' } as const,
    castlingRights: [],
    lastMove: { from: 'h8', to: 'h7' },
  };

  const view = fogOfWarVariant.getPlayerView(state, 'white');

  assert.deepEqual(view.board.a1, { color: 'white', role: 'rook' });
  assert.deepEqual(view.board.e1, { color: 'white', role: 'king' });
  assert.deepEqual(view.board.e2, { color: 'white', role: 'pawn' });
  assert.deepEqual(view.board.a4, { color: 'black', role: 'rook' });
  assert.equal(view.board.h8, undefined);
  assert.ok(view.visibleSquares.includes('a3'));
  assert.ok(view.visibleSquares.includes('a4'));
  assert.ok(view.visibleSquares.includes('e4'));
  assert.equal(view.lastMove, undefined);
});

test('Fog of War visibility is computed for a player even off-turn', () => {
  const state: GameState = {
    ...fogOfWarVariant.createInitialState('fog-off-turn'),
    board: {
      a1: { color: 'white', role: 'rook' },
      e1: { color: 'white', role: 'king' },
      a4: { color: 'black', role: 'rook' },
      e8: { color: 'black', role: 'king' },
    },
    status: { type: 'playing', turn: 'white' } as const,
    castlingRights: [],
  };

  const view = fogOfWarVariant.getPlayerView(state, 'black');

  assert.equal(view.legalMoves.length, 0);
  assert.deepEqual(view.board.a4, { color: 'black', role: 'rook' });
  assert.deepEqual(view.board.e8, { color: 'black', role: 'king' });
  assert.deepEqual(view.board.a1, { color: 'white', role: 'rook' });
  assert.ok(view.visibleSquares.includes('a1'));
});

test('Fog of War pawn visibility includes forward moves but not empty diagonals', () => {
  const state: GameState = {
    ...fogOfWarVariant.createInitialState('fog-pawn-empty-diagonals'),
    board: {
      e1: { color: 'white', role: 'king' },
      e4: { color: 'white', role: 'pawn' },
      e8: { color: 'black', role: 'king' },
    },
    status: { type: 'playing', turn: 'black' } as const,
    castlingRights: [],
  };

  const view = fogOfWarVariant.getPlayerView(state, 'white');

  assert.ok(view.visibleSquares.includes('e5'));
  assert.equal(view.visibleSquares.includes('d5'), false);
  assert.equal(view.visibleSquares.includes('f5'), false);
});

test('Fog of War pawn visibility reveals diagonal captures but not direct blockers', () => {
  const state: GameState = {
    ...fogOfWarVariant.createInitialState('fog-pawn-captures-blockers'),
    board: {
      e1: { color: 'white', role: 'king' },
      e4: { color: 'white', role: 'pawn' },
      d5: { color: 'black', role: 'knight' },
      e5: { color: 'black', role: 'rook' },
      e8: { color: 'black', role: 'king' },
    },
    status: { type: 'playing', turn: 'black' } as const,
    castlingRights: [],
  };

  const view = fogOfWarVariant.getPlayerView(state, 'white');

  assert.ok(view.visibleSquares.includes('d5'));
  assert.deepEqual(view.board.d5, { color: 'black', role: 'knight' });
  assert.equal(view.visibleSquares.includes('e5'), false);
  assert.equal(view.board.e5, undefined);
  assert.equal(view.visibleSquares.includes('f5'), false);
});

test('Fog of War en passant visibility includes the captured pawn square', () => {
  const state: GameState = {
    ...fogOfWarVariant.createInitialState('fog-en-passant-visibility'),
    board: {
      e1: { color: 'white', role: 'king' },
      e5: { color: 'white', role: 'pawn' },
      d5: { color: 'black', role: 'pawn' },
      e8: { color: 'black', role: 'king' },
    },
    status: { type: 'playing', turn: 'white' } as const,
    castlingRights: [],
    enPassantSquare: 'd6',
  };

  const view = fogOfWarVariant.getPlayerView(state, 'white');

  assert.ok(view.visibleSquares.includes('d6'));
  assert.ok(view.visibleSquares.includes('d5'));
  assert.deepEqual(view.board.d5, { color: 'black', role: 'pawn' });
});

test('Fog of War player view serialization does not contain hidden opponent pieces', () => {
  const state: GameState = {
    ...fogOfWarVariant.createInitialState('fog-serialization'),
    board: {
      a1: { color: 'white', role: 'rook' },
      e1: { color: 'white', role: 'king' },
      a4: { color: 'black', role: 'rook' },
      e8: { color: 'black', role: 'king' },
      h8: { color: 'black', role: 'queen' },
    },
    status: { type: 'playing', turn: 'white' } as const,
    castlingRights: [],
  };

  const payload = JSON.stringify(fogOfWarVariant.getPlayerView(state, 'white'));

  assert.match(payload, /"a4"/);
  assert.doesNotMatch(payload, /"h8"/);
  assert.doesNotMatch(payload, /queen/);
});

test('Fog of War legal moves ignore check constraints', () => {
  const state: GameState = {
    ...fogOfWarVariant.createInitialState('fog-no-check'),
    board: {
      e1: { color: 'white', role: 'king' },
      e8: { color: 'black', role: 'rook' },
      h8: { color: 'black', role: 'king' },
    },
    status: { type: 'playing', turn: 'white' } as const,
    castlingRights: [],
  };

  const moves = fogOfWarVariant.getLegalMoves(state, 'white');
  assert.ok(moves.some((move) => move.from === 'e1' && move.to === 'e2'));
  assert.ok(fogOfWarVariant.getPlayerView(state, 'white').legalMoves.some((move) => move.from === 'e1' && move.to === 'e2'));

  const next = fogOfWarVariant.applyMove(state, { from: 'e1', to: 'e2' });
  assert.deepEqual(next.board.e2, { color: 'white', role: 'king' });
  assert.deepEqual(next.status, { type: 'playing', turn: 'black' });
});

test('Fog of War ends when a king is captured', () => {
  const state: GameState = {
    ...fogOfWarVariant.createInitialState('fog-king-capture'),
    board: {
      e1: { color: 'white', role: 'king' },
      e2: { color: 'black', role: 'king' },
    },
    status: { type: 'playing', turn: 'white' } as const,
    castlingRights: [],
  };

  const moves = fogOfWarVariant.getLegalMoves(state, 'white');
  assert.ok(moves.some((move) => move.from === 'e1' && move.to === 'e2'));

  const next = fogOfWarVariant.applyMove(state, { from: 'e1', to: 'e2' });
  assert.deepEqual(next.board.e2, { color: 'white', role: 'king' });
  assert.deepEqual(next.status, { type: 'finished', winner: 'white', reason: 'king-captured' });
});
