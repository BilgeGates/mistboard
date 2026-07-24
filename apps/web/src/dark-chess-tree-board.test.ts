import type { PlayerView } from '@mistboard/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDarkChessInteractiveBoard } from './dark-chess-tree-board.js';

function castlingView(): PlayerView {
  return {
    id: 'study-castling',
    variant: 'dark-chess',
    board: {
      a1: { color: 'white', role: 'rook' },
      e1: { color: 'white', role: 'king' },
      h1: { color: 'white', role: 'rook' },
    },
    visibleSquares: ['a1', 'e1', 'h1'],
    legalMoves: [
      { from: 'e1', to: 'a1' },
      { from: 'e1', to: 'h1' },
    ],
    status: { type: 'playing', turn: 'white' },
    perspective: 'white',
    moveNumber: 1,
  };
}

function pointerEvent(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY });
}

function clickSquare(board: HTMLElement, square: string): void {
  board
    .querySelector(`[data-square="${square}"]`)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('createDarkChessInteractiveBoard castling input', () => {
  it('accepts both the king destination and rook square', () => {
    const boardEl = document.createElement('div');
    const view = castlingView();
    const onMove = vi.fn();
    const board = createDarkChessInteractiveBoard({
      board: boardEl,
      getInteractionView: () => view,
      getPerspective: () => 'white',
      seatFor: () => 'white',
      enabled: () => true,
      onMove,
    });
    board.render(view, 'white');

    clickSquare(boardEl, 'e1');
    expect(boardEl.querySelector('[data-square="g1"]')?.classList).toContain('mb-grid-hit--target');
    expect(boardEl.querySelector('[data-square="c1"]')?.classList).toContain('mb-grid-hit--target');
    clickSquare(boardEl, 'g1');
    expect(onMove).toHaveBeenLastCalledWith({ from: 'e1', to: 'h1' }, view);

    clickSquare(boardEl, 'e1');
    clickSquare(boardEl, 'c1');
    expect(onMove).toHaveBeenLastCalledWith({ from: 'e1', to: 'a1' }, view);

    clickSquare(boardEl, 'e1');
    clickSquare(boardEl, 'a1');
    expect(onMove).toHaveBeenLastCalledWith({ from: 'e1', to: 'a1' }, view);
    expect(onMove).toHaveBeenCalledTimes(3);
  });

  it('resolves a king drag to its familiar destination as canonical castling', () => {
    const boardEl = document.createElement('div');
    const view = castlingView();
    const onMove = vi.fn();
    vi.spyOn(boardEl, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 800,
      height: 800,
      top: 0,
      right: 800,
      bottom: 800,
      left: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(document, 'elementFromPoint').mockImplementation(
      () => boardEl.querySelector('[data-square="g1"]') as Element,
    );
    document.body.append(boardEl);
    const board = createDarkChessInteractiveBoard({
      board: boardEl,
      getInteractionView: () => view,
      getPerspective: () => 'white',
      seatFor: () => 'white',
      enabled: () => true,
      onMove,
    });
    board.render(view, 'white');

    boardEl
      .querySelector<HTMLElement>('[data-square="e1"]')
      ?.dispatchEvent(pointerEvent('pointerdown', 50, 50));
    document.dispatchEvent(pointerEvent('pointermove', 60, 50));
    document.dispatchEvent(pointerEvent('pointerup', 650, 750));

    expect(onMove).toHaveBeenCalledWith({ from: 'e1', to: 'h1' }, view);
    expect(document.querySelector('.board-drag-ghost')).toBeNull();
  });
});
