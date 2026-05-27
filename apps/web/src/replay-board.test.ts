import type { Move, Piece, PieceRole, PlayerView } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  createPane,
  renderPaneCaptures,
  renderTruthCaptures,
  revealKingCaptureForLoser,
  squareFromCgBoardClick,
} from './replay-board.js';

function boardClick(clientX: number, clientY: number): MouseEvent {
  return new MouseEvent('click', { clientX, clientY });
}

function mockBoardRect(cgBoard: HTMLElement): void {
  cgBoard.getBoundingClientRect = () =>
    ({
      bottom: 100,
      height: 80,
      left: 10,
      right: 90,
      top: 20,
      width: 80,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('createPane', () => {
  it('creates the replay pane shell with optional captures', () => {
    const withCaptures = createPane("White's view", 'white');
    const withSplitCaptures = createPane("Black's view", 'black', true, 'split');
    const withoutCaptures = createPane('Truth', 'truth', false);

    expect(withCaptures.el.className).toContain('replay-pane-white');
    expect(withCaptures.labelEl.textContent).toBe("White's view");
    expect(withCaptures.el.contains(withCaptures.capturesEl)).toBe(true);
    expect(withCaptures.el.contains(withCaptures.topCapturesEl)).toBe(false);
    expect(withSplitCaptures.el.contains(withSplitCaptures.topCapturesEl)).toBe(true);
    expect(
      [...withSplitCaptures.el.children].map((child) => (child as HTMLElement).className),
    ).toEqual([
      'replay-pane-label',
      'replay-pane-name',
      'captures-strip replay-captures replay-captures-top',
      'board replay-board',
      'captures-strip replay-captures replay-captures-bottom',
      'replay-pane-clock-slot',
      'replay-pane-status',
    ]);
    expect(withoutCaptures.el.contains(withoutCaptures.capturesEl)).toBe(false);
  });
});

describe('capture rendering', () => {
  it('renders captured pieces in stable material order with count badges', () => {
    const target = document.createElement('div');

    renderPaneCaptures(target, ['pawn', 'queen', 'pawn'] as PieceRole[], 'black');

    const pieces = [...target.querySelectorAll('.captures-piece')];
    expect(target.classList.contains('has-captures')).toBe(true);
    expect(pieces.map((piece) => piece.getAttribute('aria-label'))).toEqual([
      'black queen',
      'black pawn x2',
    ]);
    expect(pieces[1]?.querySelector('.captures-count-badge')?.textContent).toBe('2');
  });

  it('renders truth captures from the captured side perspective', () => {
    const target = document.createElement('div');

    renderTruthCaptures(target, {
      black: ['queen'],
      white: ['pawn'],
    });

    expect(target.querySelectorAll('.captures-row')).toHaveLength(1);
    expect(
      [...target.querySelectorAll('.captures-piece')].map((piece) =>
        piece.getAttribute('aria-label'),
      ),
    ).toEqual(['black pawn', 'white queen']);
  });
});

describe('squareFromCgBoardClick', () => {
  it('maps clicks to squares for white and black board orientation', () => {
    const boardEl = document.createElement('div');
    const cgBoard = document.createElement('cg-board');
    boardEl.append(cgBoard);
    mockBoardRect(cgBoard);

    expect(squareFromCgBoardClick(boardEl, boardClick(15, 25), 'white')).toBe('a8');
    expect(squareFromCgBoardClick(boardEl, boardClick(15, 25), 'black')).toBe('h1');
    expect(squareFromCgBoardClick(boardEl, boardClick(9, 25), 'white')).toBeNull();
  });
});

describe('revealKingCaptureForLoser', () => {
  it('reveals the capture source and destination to the losing player view', () => {
    const attacker: Piece = { color: 'black', role: 'queen' };
    const move = { from: 'd2', to: 'e1' } as Move;
    const view = {
      board: {
        d2: attacker,
        e1: { color: 'white', role: 'king' },
      },
      visibleSquares: ['e1'],
    } as PlayerView;

    const result = revealKingCaptureForLoser(view, move, attacker);

    expect(result.board.e1).toBe(attacker);
    expect(result.board.d2).toBeUndefined();
    expect(result.visibleSquares).toEqual(['d2', 'e1']);
    expect(result.lastMove).toBe(move);
  });
});
