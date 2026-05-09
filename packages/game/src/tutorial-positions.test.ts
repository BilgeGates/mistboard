import assert from 'node:assert/strict';
import test from 'node:test';
import { fogOfWarVariant } from './variants.js';
import type { Board, GameState, Move, PieceRole, Square } from './types.js';

type TutorialPosition = {
  board: Board;
  expectedFinalSquare: Square;
  id: string;
  moves: Move[];
  rejected?: Move[];
  visibleAfter?: Square[];
  hiddenAfter?: Square[];
  pieceRole: PieceRole;
};

const positions: TutorialPosition[] = [
  {
    id: 'rook-up-file',
    pieceRole: 'rook',
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
    pieceRole: 'rook',
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
    pieceRole: 'rook',
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
    pieceRole: 'rook',
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
    pieceRole: 'rook',
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
    pieceRole: 'rook',
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
  {
    id: 'bishop-up-right',
    pieceRole: 'bishop',
    board: {
      e1: { color: 'white', role: 'king' },
      c1: { color: 'white', role: 'bishop' },
    },
    moves: [{ from: 'c1', to: 'g5' }],
    expectedFinalSquare: 'g5',
    visibleAfter: ['d2', 'e3', 'f4', 'h6'],
  },
  {
    id: 'bishop-up-left',
    pieceRole: 'bishop',
    board: {
      e1: { color: 'white', role: 'king' },
      f1: { color: 'white', role: 'bishop' },
    },
    moves: [{ from: 'f1', to: 'b5' }],
    expectedFinalSquare: 'b5',
    visibleAfter: ['a6', 'c4', 'd3', 'e2'],
  },
  {
    id: 'bishop-back-down',
    pieceRole: 'bishop',
    board: {
      e1: { color: 'white', role: 'king' },
      g5: { color: 'white', role: 'bishop' },
    },
    moves: [{ from: 'g5', to: 'c1' }],
    expectedFinalSquare: 'c1',
    visibleAfter: ['d2', 'e3', 'f4', 'h6'],
  },
  {
    id: 'bishop-stop-before-blocker',
    pieceRole: 'bishop',
    board: {
      e1: { color: 'white', role: 'king' },
      c1: { color: 'white', role: 'bishop' },
      f4: { color: 'white', role: 'knight' },
    },
    moves: [{ from: 'c1', to: 'e3' }],
    rejected: [{ from: 'c1', to: 'f4' }],
    expectedFinalSquare: 'e3',
    visibleAfter: ['d2', 'f4'],
    hiddenAfter: ['g5'],
  },
  {
    id: 'bishop-change-diagonal',
    pieceRole: 'bishop',
    board: {
      e1: { color: 'white', role: 'king' },
      b2: { color: 'white', role: 'bishop' },
    },
    moves: [
      { from: 'b2', to: 'e5' },
      { from: 'e5', to: 'b8' },
    ],
    expectedFinalSquare: 'b8',
    visibleAfter: ['c7', 'd6', 'e5', 'f4', 'g3', 'h2'],
  },
  {
    id: 'bishop-trail',
    pieceRole: 'bishop',
    board: {
      e1: { color: 'white', role: 'king' },
      d2: { color: 'white', role: 'bishop' },
    },
    moves: [
      { from: 'd2', to: 'h6' },
      { from: 'h6', to: 'e3' },
      { from: 'e3', to: 'b6' },
      { from: 'b6', to: 'd8' },
    ],
    expectedFinalSquare: 'd8',
    visibleAfter: ['b6', 'c7', 'e7', 'f6', 'g5', 'h4'],
  },
  {
    id: 'queen-up-file',
    pieceRole: 'queen',
    board: {
      b1: { color: 'white', role: 'king' },
      d2: { color: 'white', role: 'queen' },
    },
    moves: [{ from: 'd2', to: 'd7' }],
    expectedFinalSquare: 'd7',
    visibleAfter: ['d3', 'd4', 'd5', 'd6', 'd8'],
  },
  {
    id: 'queen-across-rank',
    pieceRole: 'queen',
    board: {
      b1: { color: 'white', role: 'king' },
      c4: { color: 'white', role: 'queen' },
    },
    moves: [{ from: 'c4', to: 'h4' }],
    expectedFinalSquare: 'h4',
    visibleAfter: ['a4', 'b4', 'd4', 'e4', 'f4', 'g4'],
  },
  {
    id: 'queen-diagonal',
    pieceRole: 'queen',
    board: {
      e1: { color: 'white', role: 'king' },
      d1: { color: 'white', role: 'queen' },
    },
    moves: [{ from: 'd1', to: 'h5' }],
    expectedFinalSquare: 'h5',
    visibleAfter: ['e2', 'f3', 'g4'],
  },
  {
    id: 'queen-choose-line',
    pieceRole: 'queen',
    board: {
      b1: { color: 'white', role: 'king' },
      d4: { color: 'white', role: 'queen' },
    },
    moves: [{ from: 'd4', to: 'h8' }],
    expectedFinalSquare: 'h8',
    visibleAfter: ['e5', 'f6', 'g7'],
  },
  {
    id: 'queen-stop-before-blocker',
    pieceRole: 'queen',
    board: {
      b1: { color: 'white', role: 'king' },
      d2: { color: 'white', role: 'queen' },
      d6: { color: 'white', role: 'bishop' },
    },
    moves: [{ from: 'd2', to: 'd5' }],
    rejected: [{ from: 'd2', to: 'd6' }],
    expectedFinalSquare: 'd5',
    visibleAfter: ['d3', 'd4', 'd6'],
    hiddenAfter: ['d7'],
  },
  {
    id: 'queen-lantern-trail',
    pieceRole: 'queen',
    board: {
      b1: { color: 'white', role: 'king' },
      d1: { color: 'white', role: 'queen' },
    },
    moves: [
      { from: 'd1', to: 'd5' },
      { from: 'd5', to: 'h5' },
      { from: 'h5', to: 'e8' },
      { from: 'e8', to: 'b5' },
    ],
    expectedFinalSquare: 'b5',
    visibleAfter: ['a4', 'a5', 'a6', 'b1', 'b2', 'b3', 'b4', 'b6', 'b7', 'b8', 'c4', 'c5', 'c6', 'd3', 'd5', 'd7', 'e2', 'e5', 'e8'],
  },
  {
    id: 'king-one-step-up',
    pieceRole: 'king',
    board: {
      e2: { color: 'white', role: 'king' },
    },
    moves: [{ from: 'e2', to: 'e3' }],
    expectedFinalSquare: 'e3',
    visibleAfter: ['d2', 'd3', 'd4', 'e2', 'e4', 'f2', 'f3', 'f4'],
  },
  {
    id: 'king-side-step',
    pieceRole: 'king',
    board: {
      d4: { color: 'white', role: 'king' },
    },
    moves: [{ from: 'd4', to: 'e4' }],
    expectedFinalSquare: 'e4',
    visibleAfter: ['d3', 'd4', 'd5', 'e3', 'e5', 'f3', 'f4', 'f5'],
  },
  {
    id: 'king-diagonal-step',
    pieceRole: 'king',
    board: {
      d3: { color: 'white', role: 'king' },
    },
    moves: [{ from: 'd3', to: 'e4' }],
    expectedFinalSquare: 'e4',
    visibleAfter: ['d3', 'd4', 'd5', 'e3', 'e5', 'f3', 'f4', 'f5'],
  },
  {
    id: 'king-corner',
    pieceRole: 'king',
    board: {
      a1: { color: 'white', role: 'king' },
    },
    moves: [{ from: 'a1', to: 'b2' }],
    expectedFinalSquare: 'b2',
    visibleAfter: ['a1', 'a2', 'a3', 'b1', 'b3', 'c1', 'c2', 'c3'],
  },
  {
    id: 'king-occupied-square',
    pieceRole: 'king',
    board: {
      e2: { color: 'white', role: 'king' },
      e3: { color: 'white', role: 'rook' },
    },
    moves: [{ from: 'e2', to: 'd3' }],
    rejected: [{ from: 'e2', to: 'e3' }],
    expectedFinalSquare: 'd3',
    visibleAfter: ['c2', 'c3', 'c4', 'd2', 'd4', 'e2', 'e3', 'e4'],
  },
  {
    id: 'king-walk',
    pieceRole: 'king',
    board: {
      e1: { color: 'white', role: 'king' },
    },
    moves: [
      { from: 'e1', to: 'e2' },
      { from: 'e2', to: 'f3' },
      { from: 'f3', to: 'f4' },
      { from: 'f4', to: 'e5' },
    ],
    expectedFinalSquare: 'e5',
    visibleAfter: ['d4', 'd5', 'd6', 'e4', 'e6', 'f4', 'f5', 'f6'],
  },
  {
    id: 'knight-first-l',
    pieceRole: 'knight',
    board: {
      e1: { color: 'white', role: 'king' },
      b1: { color: 'white', role: 'knight' },
    },
    moves: [{ from: 'b1', to: 'c3' }],
    expectedFinalSquare: 'c3',
    visibleAfter: ['a2', 'a4', 'b5', 'd1', 'e2', 'e4'],
  },
  {
    id: 'knight-other-l',
    pieceRole: 'knight',
    board: {
      e1: { color: 'white', role: 'king' },
      d4: { color: 'white', role: 'knight' },
    },
    moves: [{ from: 'd4', to: 'f5' }],
    expectedFinalSquare: 'f5',
    visibleAfter: ['d4', 'd6', 'e3', 'g3', 'h4', 'h6'],
  },
  {
    id: 'knight-jump-wall',
    pieceRole: 'knight',
    board: {
      e1: { color: 'white', role: 'king' },
      b1: { color: 'white', role: 'knight' },
      b2: { color: 'white', role: 'pawn' },
      c2: { color: 'white', role: 'pawn' },
    },
    moves: [{ from: 'b1', to: 'c3' }],
    expectedFinalSquare: 'c3',
    visibleAfter: ['a2', 'a4', 'b1', 'b5', 'd1', 'e2', 'e4'],
  },
  {
    id: 'knight-from-edge',
    pieceRole: 'knight',
    board: {
      e1: { color: 'white', role: 'king' },
      a1: { color: 'white', role: 'knight' },
    },
    moves: [{ from: 'a1', to: 'b3' }],
    expectedFinalSquare: 'b3',
    visibleAfter: ['a1', 'c1', 'd2', 'd4'],
  },
  {
    id: 'knight-choose-pocket',
    pieceRole: 'knight',
    board: {
      g1: { color: 'white', role: 'king' },
      e4: { color: 'white', role: 'knight' },
    },
    moves: [{ from: 'e4', to: 'd6' }],
    expectedFinalSquare: 'd6',
    visibleAfter: ['b5', 'b7', 'c4', 'e4', 'f5', 'f7'],
  },
  {
    id: 'knight-pocket-trail',
    pieceRole: 'knight',
    board: {
      e1: { color: 'white', role: 'king' },
      b1: { color: 'white', role: 'knight' },
    },
    moves: [
      { from: 'b1', to: 'c3' },
      { from: 'c3', to: 'e4' },
      { from: 'e4', to: 'f6' },
      { from: 'f6', to: 'h5' },
    ],
    expectedFinalSquare: 'h5',
    visibleAfter: ['f4', 'f6', 'g3'],
  },
  {
    id: 'pawn-one-step',
    pieceRole: 'pawn',
    board: {
      e1: { color: 'white', role: 'king' },
      e3: { color: 'white', role: 'pawn' },
    },
    moves: [{ from: 'e3', to: 'e4' }],
    expectedFinalSquare: 'e4',
    visibleAfter: ['e5'],
    hiddenAfter: ['d5', 'f5'],
  },
  {
    id: 'pawn-first-double',
    pieceRole: 'pawn',
    board: {
      e1: { color: 'white', role: 'king' },
      d2: { color: 'white', role: 'pawn' },
    },
    moves: [{ from: 'd2', to: 'd4' }],
    expectedFinalSquare: 'd4',
    visibleAfter: ['d5'],
    hiddenAfter: ['c5', 'e5'],
  },
  {
    id: 'pawn-after-first',
    pieceRole: 'pawn',
    board: {
      e1: { color: 'white', role: 'king' },
      d4: { color: 'white', role: 'pawn' },
    },
    moves: [{ from: 'd4', to: 'd5' }],
    expectedFinalSquare: 'd5',
    visibleAfter: ['d6'],
    hiddenAfter: ['c6', 'e6'],
  },
  {
    id: 'pawn-blocked',
    pieceRole: 'pawn',
    board: {
      e1: { color: 'white', role: 'king' },
      d3: { color: 'white', role: 'pawn' },
      d4: { color: 'white', role: 'bishop' },
      f3: { color: 'white', role: 'pawn' },
    },
    moves: [{ from: 'f3', to: 'f4' }],
    rejected: [{ from: 'd3', to: 'd4' }],
    expectedFinalSquare: 'f4',
    visibleAfter: ['f5'],
  },
  {
    id: 'pawn-no-backward',
    pieceRole: 'pawn',
    board: {
      e1: { color: 'white', role: 'king' },
      e5: { color: 'white', role: 'pawn' },
    },
    moves: [{ from: 'e5', to: 'e6' }],
    rejected: [{ from: 'e5', to: 'e4' }],
    expectedFinalSquare: 'e6',
    visibleAfter: ['e7'],
  },
  {
    id: 'pawn-forward-trail',
    pieceRole: 'pawn',
    board: {
      e1: { color: 'white', role: 'king' },
      b2: { color: 'white', role: 'pawn' },
    },
    moves: [
      { from: 'b2', to: 'b4' },
      { from: 'b4', to: 'b5' },
      { from: 'b5', to: 'b6' },
      { from: 'b6', to: 'b7' },
    ],
    expectedFinalSquare: 'b7',
    visibleAfter: ['b8'],
    hiddenAfter: ['a8', 'c8'],
  },
];

test('authored piece tutorial sequences use legal moves through fog', () => {
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

    assert.deepEqual(state.board[position.expectedFinalSquare], { color: 'white', role: position.pieceRole });
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
