import { afterEach, describe, expect, it, vi } from 'vitest';
import { installBoardDrag } from './board-drag.js';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('installBoardDrag native selection', () => {
  it('prevents native selection from a draggable piece press and preserves its click handler', () => {
    const board = document.createElement('div');
    const square = document.createElement('button');
    square.dataset.square = 'e1';
    board.append(square);
    document.body.append(board);
    const onSquareClick = vi.fn();

    installBoardDrag({
      board,
      ghostSizePx: 80,
      onSquareClick,
      canDragFrom: () => true,
      ghostHtml: () => null,
      onDragStart: vi.fn(),
      onDrop: vi.fn(),
    });

    const pointerDown = new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      cancelable: true,
    });
    square.dispatchEvent(pointerDown);
    document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    square.click();

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(onSquareClick).toHaveBeenCalledWith('e1');
  });

  it('does not block native selection when the pressed square is not draggable', () => {
    const board = document.createElement('div');
    const square = document.createElement('span');
    square.dataset.square = 'e4';
    board.append(square);

    installBoardDrag({
      board,
      ghostSizePx: 80,
      onSquareClick: vi.fn(),
      canDragFrom: () => false,
      ghostHtml: () => null,
      onDragStart: vi.fn(),
      onDrop: vi.fn(),
    });

    const pointerDown = new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      cancelable: true,
    });
    square.dispatchEvent(pointerDown);

    expect(pointerDown.defaultPrevented).toBe(false);
  });
});
