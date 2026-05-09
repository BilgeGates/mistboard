import assert from 'node:assert/strict';
import test from 'node:test';
import { fogOfWarVariant } from './variants.js';
import type { Board, GameState, Move, Square } from './types.js';

type TutorialPosition = {
  board: Board;
  expectedFinalSquare: Square;
  id: string;
  moves: Move[];
  rejected?: Move[];
  visibleAfter?: Square[];
  hiddenAfter?: Square[];
};

const positions: TutorialPosition[] = [
  {
    id: 'rook-up-file',
    board: {
      b1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'rook' },
    },
    moves: [{ from: 'e2', to: 'e7' }],
    expectedFinalSquare: 'e7',
    visibleAfter: ['e3', 'e4', 'e5', 'e6', 'e8'],
  },
  {
    id: 'rook-down-file',
    board: {
      b1: { color: 'white', role: 'king' },
      e7: { color: 'white', role: 'rook' },
    },
    moves: [{ from: 'e7', to: 'e2' }],
    expectedFinalSquare: 'e2',
    visibleAfter: ['e1', 'e3', 'e4', 'e5', 'e6', 'e8'],
  },
  {
    id: 'rook-across-rank',
    board: {
      b1: { color: 'white', role: 'king' },
      b4: { color: 'white', role: 'rook' },
    },
    moves: [{ from: 'b4', to: 'g4' }],
    expectedFinalSquare: 'g4',
    visibleAfter: ['a4', 'c4', 'd4', 'e4', 'f4', 'h4'],
  },
  {
    id: 'rook-stop-before-blocker',
    board: {
      b1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'rook' },
      e5: { color: 'white', role: 'knight' },
    },
    moves: [{ from: 'e2', to: 'e4' }],
    rejected: [{ from: 'e2', to: 'e5' }],
    expectedFinalSquare: 'e4',
    visibleAfter: ['e3', 'e5'],
    hiddenAfter: ['e6'],
  },
  {
    id: 'rook-turn-corner',
    board: {
      b1: { color: 'white', role: 'king' },
      a2: { color: 'white', role: 'rook' },
    },
    moves: [
      { from: 'a2', to: 'a6' },
      { from: 'a6', to: 'f6' },
    ],
    expectedFinalSquare: 'f6',
    visibleAfter: ['a6', 'b6', 'c6', 'd6', 'e6', 'g6', 'h6'],
  },
  {
    id: 'rook-trail',
    board: {
      b1: { color: 'white', role: 'king' },
      c2: { color: 'white', role: 'rook' },
    },
    moves: [
      { from: 'c2', to: 'c6' },
      { from: 'c6', to: 'h6' },
      { from: 'h6', to: 'h3' },
      { from: 'h3', to: 'd3' },
    ],
    expectedFinalSquare: 'd3',
    visibleAfter: ['d1', 'd2', 'd4', 'd5', 'd6', 'd7', 'd8'],
  },
];

test('authored Rook tutorial sequences use legal moves through fog', () => {
  for (const position of positions) {
    let state = tutorialState(position.id, position.board);

    for (const rejected of position.rejected ?? []) {
      assert.equal(hasLegalMove(state, rejected), false, `${position.id}: expected ${moveLabel(rejected)} to be illegal`);
    }

    for (const move of position.moves) {
      assert.equal(hasLegalMove(state, move), true, `${position.id}: expected ${moveLabel(move)} to be legal`);
      const next = fogOfWarVariant.applyMove(state, move);
      state = {
        ...next,
        status: { type: 'playing', turn: 'white' } as const,
      };
    }

    assert.deepEqual(state.board[position.expectedFinalSquare], { color: 'white', role: 'rook' });
    const afterView = fogOfWarVariant.getPlayerView(state, 'white');
    const afterVisible = new Set(afterView.visibleSquares);
    for (const square of position.visibleAfter ?? []) {
      assert.equal(afterVisible.has(square), true, `${position.id}: expected ${square} to be visible`);
    }
    for (const square of position.hiddenAfter ?? []) {
      assert.equal(afterVisible.has(square), false, `${position.id}: expected ${square} to stay hidden`);
    }
  }
});

function hasLegalMove(state: GameState, move: Move): boolean {
  return fogOfWarVariant.getLegalMoves(state, 'white').some((candidate) => (
    candidate.from === move.from && candidate.to === move.to
  ));
}

function moveLabel(move: Move): string {
  return `${move.from}${move.to}`;
}

function tutorialState(id: string, board: Board): GameState {
  return {
    ...fogOfWarVariant.createInitialState(`tutorial-${id}`),
    board,
    status: { type: 'playing', turn: 'white' },
    castlingRights: [],
    halfmoveClock: 0,
    moveNumber: 1,
  };
}
