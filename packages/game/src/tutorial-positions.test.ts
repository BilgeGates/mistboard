import assert from 'node:assert/strict';
import test from 'node:test';
import { fogOfWarVariant } from './variants.js';
import type { Board, GameState, Move, PieceRole, Square } from './types.js';

type TutorialPosition = {
  board: Board;
  castlingRights?: Square[];
  enPassantSquare?: Square;
  halfmoveClock?: number;
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
  {
    id: 'capture-rook-contact',
    pieceRole: 'rook',
    board: {
      b1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'rook' },
      e6: { color: 'black', role: 'pawn' },
    },
    moves: [{ from: 'e2', to: 'e6' }],
    expectedFinalSquare: 'e6',
    visibleAfter: ['e3', 'e4', 'e5', 'e7', 'e8'],
  },
  {
    id: 'capture-bishop-contact',
    pieceRole: 'bishop',
    board: {
      e1: { color: 'white', role: 'king' },
      c1: { color: 'white', role: 'bishop' },
      f4: { color: 'black', role: 'knight' },
    },
    moves: [{ from: 'c1', to: 'f4' }],
    expectedFinalSquare: 'f4',
    visibleAfter: ['d2', 'e3', 'g5', 'h6'],
  },
  {
    id: 'capture-knight-pocket',
    pieceRole: 'knight',
    board: {
      e1: { color: 'white', role: 'king' },
      c3: { color: 'white', role: 'knight' },
      d5: { color: 'black', role: 'bishop' },
    },
    moves: [{ from: 'c3', to: 'd5' }],
    expectedFinalSquare: 'd5',
    visibleAfter: ['b4', 'b6', 'f4', 'f6'],
  },
  {
    id: 'capture-pawn-diagonal',
    pieceRole: 'pawn',
    board: {
      e1: { color: 'white', role: 'king' },
      d4: { color: 'white', role: 'pawn' },
      e5: { color: 'black', role: 'knight' },
    },
    moves: [{ from: 'd4', to: 'e5' }],
    expectedFinalSquare: 'e5',
    visibleAfter: ['e6'],
  },
  {
    id: 'capture-queen-choice',
    pieceRole: 'queen',
    board: {
      b1: { color: 'white', role: 'king' },
      d3: { color: 'white', role: 'queen' },
      d7: { color: 'black', role: 'rook' },
      h3: { color: 'black', role: 'bishop' },
    },
    moves: [{ from: 'd3', to: 'd7' }],
    expectedFinalSquare: 'd7',
    visibleAfter: ['d4', 'd5', 'd6', 'd8'],
  },
  {
    id: 'capture-king-direct',
    pieceRole: 'rook',
    board: {
      b1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
    },
    moves: [{ from: 'e2', to: 'e8' }],
    expectedFinalSquare: 'e8',
    visibleAfter: ['e3', 'e4', 'e5', 'e6', 'e7'],
  },
  {
    id: 'protection-rook-file',
    pieceRole: 'rook',
    board: {
      b1: { color: 'white', role: 'king' },
      e1: { color: 'white', role: 'rook' },
      e5: { color: 'white', role: 'pawn' },
    },
    moves: [{ from: 'e1', to: 'e3' }],
    expectedFinalSquare: 'e3',
    visibleAfter: ['e4', 'e5'],
  },
  {
    id: 'protection-bishop-diagonal',
    pieceRole: 'bishop',
    board: {
      e1: { color: 'white', role: 'king' },
      c1: { color: 'white', role: 'bishop' },
      f4: { color: 'white', role: 'pawn' },
    },
    moves: [{ from: 'c1', to: 'e3' }],
    expectedFinalSquare: 'e3',
    visibleAfter: ['d2', 'f4'],
  },
  {
    id: 'protection-knight-pocket',
    pieceRole: 'knight',
    board: {
      e1: { color: 'white', role: 'king' },
      b1: { color: 'white', role: 'knight' },
      e4: { color: 'white', role: 'pawn' },
    },
    moves: [{ from: 'b1', to: 'c3' }],
    expectedFinalSquare: 'c3',
    visibleAfter: ['e4'],
  },
  {
    id: 'protection-king-close',
    pieceRole: 'king',
    board: {
      e2: { color: 'white', role: 'king' },
      f4: { color: 'white', role: 'pawn' },
    },
    moves: [{ from: 'e2', to: 'e3' }],
    expectedFinalSquare: 'e3',
    visibleAfter: ['f4'],
  },
  {
    id: 'protection-before-material',
    pieceRole: 'queen',
    board: {
      b1: { color: 'white', role: 'king' },
      d1: { color: 'white', role: 'queen' },
      d5: { color: 'white', role: 'pawn' },
      h5: { color: 'black', role: 'bishop' },
    },
    moves: [{ from: 'd1', to: 'd3' }],
    expectedFinalSquare: 'd3',
    visibleAfter: ['d4', 'd5'],
  },
  {
    id: 'protection-guard-chain',
    pieceRole: 'bishop',
    board: {
      e1: { color: 'white', role: 'king' },
      a1: { color: 'white', role: 'rook' },
      a5: { color: 'white', role: 'pawn' },
      c1: { color: 'white', role: 'bishop' },
      g5: { color: 'white', role: 'pawn' },
    },
    moves: [
      { from: 'a1', to: 'a3' },
      { from: 'c1', to: 'e3' },
    ],
    expectedFinalSquare: 'e3',
    visibleAfter: ['a4', 'a5', 'f4', 'g5'],
  },
  {
    id: 'combat-capture-with-backup',
    pieceRole: 'rook',
    board: {
      b1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'rook' },
      b3: { color: 'white', role: 'bishop' },
      e6: { color: 'black', role: 'pawn' },
    },
    moves: [{ from: 'e2', to: 'e6' }],
    expectedFinalSquare: 'e6',
    visibleAfter: ['c4', 'd5', 'e7', 'e8'],
  },
  {
    id: 'combat-knight-backed-capture',
    pieceRole: 'knight',
    board: {
      e1: { color: 'white', role: 'king' },
      d1: { color: 'white', role: 'queen' },
      c3: { color: 'white', role: 'knight' },
      d5: { color: 'black', role: 'bishop' },
    },
    moves: [{ from: 'c3', to: 'd5' }],
    expectedFinalSquare: 'd5',
    visibleAfter: ['d2', 'd3', 'd4'],
  },
  {
    id: 'combat-remove-attacker',
    pieceRole: 'queen',
    board: {
      b1: { color: 'white', role: 'king' },
      d1: { color: 'white', role: 'queen' },
      d5: { color: 'white', role: 'pawn' },
      h5: { color: 'black', role: 'bishop' },
    },
    moves: [{ from: 'd1', to: 'h5' }],
    expectedFinalSquare: 'h5',
    visibleAfter: ['e2', 'f3', 'g4'],
  },
  {
    id: 'combat-protect-then-capture',
    pieceRole: 'pawn',
    board: {
      e1: { color: 'white', role: 'king' },
      c1: { color: 'white', role: 'bishop' },
      g5: { color: 'white', role: 'pawn' },
      h6: { color: 'black', role: 'rook' },
    },
    moves: [
      { from: 'c1', to: 'e3' },
      { from: 'g5', to: 'h6' },
    ],
    expectedFinalSquare: 'h6',
    visibleAfter: ['e3', 'f4', 'g5'],
  },
  {
    id: 'combat-choose-safe-capture',
    pieceRole: 'queen',
    board: {
      b1: { color: 'white', role: 'king' },
      d1: { color: 'white', role: 'rook' },
      d3: { color: 'white', role: 'queen' },
      d7: { color: 'black', role: 'rook' },
      h3: { color: 'black', role: 'bishop' },
    },
    moves: [{ from: 'd3', to: 'd7' }],
    expectedFinalSquare: 'd7',
    visibleAfter: ['d1', 'd2', 'd4', 'd5', 'd6', 'd8'],
  },
  {
    id: 'combat-backed-king-capture',
    pieceRole: 'rook',
    board: {
      b1: { color: 'white', role: 'king' },
      e1: { color: 'white', role: 'queen' },
      e2: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
    },
    moves: [{ from: 'e2', to: 'e8' }],
    expectedFinalSquare: 'e8',
    visibleAfter: ['e1', 'e3', 'e4', 'e5', 'e6', 'e7'],
  },
  {
    id: 'find-king-rook-line',
    pieceRole: 'rook',
    board: {
      b1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
    },
    moves: [{ from: 'e2', to: 'e8' }],
    expectedFinalSquare: 'e8',
  },
  {
    id: 'find-king-bishop-line',
    pieceRole: 'bishop',
    board: {
      e1: { color: 'white', role: 'king' },
      c1: { color: 'white', role: 'bishop' },
      h6: { color: 'black', role: 'king' },
    },
    moves: [{ from: 'c1', to: 'h6' }],
    expectedFinalSquare: 'h6',
  },
  {
    id: 'find-king-knight-pocket',
    pieceRole: 'knight',
    board: {
      e1: { color: 'white', role: 'king' },
      c3: { color: 'white', role: 'knight' },
      d5: { color: 'black', role: 'king' },
    },
    moves: [{ from: 'c3', to: 'd5' }],
    expectedFinalSquare: 'd5',
  },
  {
    id: 'save-king-step-away',
    pieceRole: 'king',
    board: {
      e2: { color: 'white', role: 'king' },
      e5: { color: 'black', role: 'rook' },
    },
    moves: [{ from: 'e2', to: 'f2' }],
    expectedFinalSquare: 'f2',
  },
  {
    id: 'save-king-block-line',
    pieceRole: 'rook',
    board: {
      e1: { color: 'white', role: 'king' },
      a3: { color: 'white', role: 'rook' },
      e7: { color: 'black', role: 'rook' },
    },
    moves: [{ from: 'a3', to: 'e3' }],
    expectedFinalSquare: 'e3',
  },
  {
    id: 'save-king-capture-attacker',
    pieceRole: 'king',
    board: {
      e2: { color: 'white', role: 'king' },
      f3: { color: 'black', role: 'rook' },
    },
    moves: [{ from: 'e2', to: 'f3' }],
    expectedFinalSquare: 'f3',
  },
  {
    id: 'final-capture-rook',
    pieceRole: 'rook',
    board: {
      b1: { color: 'white', role: 'king' },
      h2: { color: 'white', role: 'rook' },
      h8: { color: 'black', role: 'king' },
    },
    moves: [{ from: 'h2', to: 'h8' }],
    expectedFinalSquare: 'h8',
  },
  {
    id: 'final-capture-pawn',
    pieceRole: 'pawn',
    board: {
      e1: { color: 'white', role: 'king' },
      d6: { color: 'white', role: 'pawn' },
      e7: { color: 'black', role: 'king' },
    },
    moves: [{ from: 'd6', to: 'e7' }],
    expectedFinalSquare: 'e7',
  },
  {
    id: 'final-capture-king',
    pieceRole: 'king',
    board: {
      e4: { color: 'white', role: 'king' },
      f5: { color: 'black', role: 'king' },
    },
    moves: [{ from: 'e4', to: 'f5' }],
    expectedFinalSquare: 'f5',
  },
  {
    id: 'setup-open-pawn',
    pieceRole: 'pawn',
    board: {
      a1: { color: 'white', role: 'rook' },
      b1: { color: 'white', role: 'knight' },
      c1: { color: 'white', role: 'bishop' },
      d1: { color: 'white', role: 'queen' },
      e1: { color: 'white', role: 'king' },
      f1: { color: 'white', role: 'bishop' },
      g1: { color: 'white', role: 'knight' },
      h1: { color: 'white', role: 'rook' },
      a2: { color: 'white', role: 'pawn' },
      b2: { color: 'white', role: 'pawn' },
      c2: { color: 'white', role: 'pawn' },
      d2: { color: 'white', role: 'pawn' },
      e2: { color: 'white', role: 'pawn' },
      f2: { color: 'white', role: 'pawn' },
      g2: { color: 'white', role: 'pawn' },
      h2: { color: 'white', role: 'pawn' },
      e8: { color: 'black', role: 'king' },
    },
    moves: [{ from: 'e2', to: 'e4' }],
    expectedFinalSquare: 'e4',
  },
  {
    id: 'setup-knight-develop',
    pieceRole: 'knight',
    board: {
      e1: { color: 'white', role: 'king' },
      g1: { color: 'white', role: 'knight' },
      e8: { color: 'black', role: 'king' },
    },
    moves: [{ from: 'g1', to: 'f3' }],
    expectedFinalSquare: 'f3',
  },
  {
    id: 'setup-bishop-develop',
    pieceRole: 'bishop',
    board: {
      e1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'pawn' },
      f1: { color: 'white', role: 'bishop' },
      e8: { color: 'black', role: 'king' },
    },
    moves: [
      { from: 'e2', to: 'e4' },
      { from: 'f1', to: 'c4' },
    ],
    expectedFinalSquare: 'c4',
  },
  {
    id: 'castling-kingside',
    pieceRole: 'king',
    board: {
      e1: { color: 'white', role: 'king' },
      h1: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
    },
    castlingRights: ['h1'],
    moves: [{ from: 'e1', to: 'h1' }],
    expectedFinalSquare: 'g1',
  },
  {
    id: 'castling-queenside',
    pieceRole: 'king',
    board: {
      e1: { color: 'white', role: 'king' },
      a1: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
    },
    castlingRights: ['a1'],
    moves: [{ from: 'e1', to: 'a1' }],
    expectedFinalSquare: 'c1',
  },
  {
    id: 'castling-draft960-shape',
    pieceRole: 'king',
    board: {
      d1: { color: 'white', role: 'king' },
      g1: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
    },
    castlingRights: ['g1'],
    moves: [{ from: 'd1', to: 'g1' }],
    expectedFinalSquare: 'g1',
  },
  {
    id: 'en-passant-left',
    pieceRole: 'pawn',
    board: {
      a1: { color: 'white', role: 'king' },
      e5: { color: 'white', role: 'pawn' },
      d5: { color: 'black', role: 'pawn' },
      h8: { color: 'black', role: 'king' },
    },
    enPassantSquare: 'd6',
    moves: [{ from: 'e5', to: 'd6' }],
    expectedFinalSquare: 'd6',
  },
  {
    id: 'en-passant-right',
    pieceRole: 'pawn',
    board: {
      a1: { color: 'white', role: 'king' },
      f5: { color: 'white', role: 'pawn' },
      g5: { color: 'black', role: 'pawn' },
      h8: { color: 'black', role: 'king' },
    },
    enPassantSquare: 'g6',
    moves: [{ from: 'f5', to: 'g6' }],
    expectedFinalSquare: 'g6',
  },
  {
    id: 'en-passant-expires',
    pieceRole: 'pawn',
    board: {
      a1: { color: 'white', role: 'king' },
      c5: { color: 'white', role: 'pawn' },
      b5: { color: 'black', role: 'pawn' },
      h8: { color: 'black', role: 'king' },
    },
    enPassantSquare: 'b6',
    moves: [{ from: 'c5', to: 'b6' }],
    expectedFinalSquare: 'b6',
  },
  {
    id: 'draw-clock',
    pieceRole: 'rook',
    board: {
      e1: { color: 'white', role: 'king' },
      a1: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
    },
    halfmoveClock: 99,
    moves: [{ from: 'a1', to: 'a2' }],
    expectedFinalSquare: 'a2',
  },
  {
    id: 'draw-reset-clock',
    pieceRole: 'pawn',
    board: {
      e1: { color: 'white', role: 'king' },
      a2: { color: 'white', role: 'pawn' },
      e8: { color: 'black', role: 'king' },
    },
    halfmoveClock: 98,
    moves: [{ from: 'a2', to: 'a4' }],
    expectedFinalSquare: 'a4',
  },
  {
    id: 'draw-repeat-shape',
    pieceRole: 'rook',
    board: {
      e1: { color: 'white', role: 'king' },
      a1: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
    },
    moves: [
      { from: 'a1', to: 'a3' },
      { from: 'a3', to: 'a1' },
    ],
    expectedFinalSquare: 'a1',
  },
  {
    id: 'value-queen-over-pawn',
    pieceRole: 'queen',
    board: {
      b1: { color: 'white', role: 'king' },
      d3: { color: 'white', role: 'queen' },
      d7: { color: 'black', role: 'rook' },
      h3: { color: 'black', role: 'pawn' },
    },
    moves: [{ from: 'd3', to: 'd7' }],
    expectedFinalSquare: 'd7',
  },
  {
    id: 'value-king-over-material',
    pieceRole: 'rook',
    board: {
      b1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
      h2: { color: 'black', role: 'queen' },
    },
    moves: [{ from: 'e2', to: 'e8' }],
    expectedFinalSquare: 'e8',
  },
  {
    id: 'value-scout-before-value',
    pieceRole: 'rook',
    board: {
      e1: { color: 'white', role: 'king' },
      a1: { color: 'white', role: 'rook' },
      a7: { color: 'black', role: 'rook' },
    },
    moves: [{ from: 'a1', to: 'a4' }],
    expectedFinalSquare: 'a4',
  },
  {
    id: 'capture-two-rook-route',
    pieceRole: 'rook',
    board: {
      b1: { color: 'white', role: 'king' },
      a2: { color: 'white', role: 'rook' },
      f6: { color: 'black', role: 'king' },
    },
    moves: [
      { from: 'a2', to: 'a6' },
      { from: 'a6', to: 'f6' },
    ],
    expectedFinalSquare: 'f6',
  },
  {
    id: 'capture-two-bishop-route',
    pieceRole: 'bishop',
    board: {
      e1: { color: 'white', role: 'king' },
      b2: { color: 'white', role: 'bishop' },
      b8: { color: 'black', role: 'king' },
    },
    moves: [
      { from: 'b2', to: 'e5' },
      { from: 'e5', to: 'b8' },
    ],
    expectedFinalSquare: 'b8',
  },
  {
    id: 'capture-two-knight-route',
    pieceRole: 'knight',
    board: {
      e1: { color: 'white', role: 'king' },
      b1: { color: 'white', role: 'knight' },
      e4: { color: 'black', role: 'king' },
    },
    moves: [
      { from: 'b1', to: 'c3' },
      { from: 'c3', to: 'e4' },
    ],
    expectedFinalSquare: 'e4',
  },
  {
    id: 'scouting-reveal-file',
    pieceRole: 'rook',
    board: {
      e1: { color: 'white', role: 'king' },
      a1: { color: 'white', role: 'rook' },
      a7: { color: 'black', role: 'bishop' },
    },
    moves: [{ from: 'a1', to: 'a4' }],
    expectedFinalSquare: 'a4',
  },
  {
    id: 'scouting-knight-pocket',
    pieceRole: 'knight',
    board: {
      e1: { color: 'white', role: 'king' },
      b1: { color: 'white', role: 'knight' },
      e4: { color: 'black', role: 'rook' },
    },
    moves: [{ from: 'b1', to: 'c3' }],
    expectedFinalSquare: 'c3',
  },
  {
    id: 'scouting-relevant-not-most',
    pieceRole: 'queen',
    board: {
      e1: { color: 'white', role: 'king' },
      d2: { color: 'white', role: 'queen' },
      d7: { color: 'black', role: 'rook' },
    },
    moves: [{ from: 'd2', to: 'd4' }],
    expectedFinalSquare: 'd4',
  },
];

test('authored tutorial sequences use legal moves through fog', () => {
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
  const position = positions.find((candidate) => candidate.id === id);
  return {
    ...fogOfWarVariant.createInitialState(`tutorial-${id}`),
    board,
    status: { type: 'playing', turn: 'white' },
    castlingRights: position?.castlingRights ?? [],
    enPassantSquare: position?.enPassantSquare,
    halfmoveClock: position?.halfmoveClock ?? 0,
    moveNumber: 1,
  };
}
