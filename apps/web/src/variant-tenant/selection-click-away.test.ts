import { describe, expect, it } from 'vitest';
import { installSelectionClickAway } from './selection-click-away.js';

describe('installSelectionClickAway', () => {
  it('clears selection only when the pointer starts outside registered roots', () => {
    const root = document.createElement('main');
    const board = document.createElement('div');
    const hand = document.createElement('div');
    const outside = document.createElement('button');
    root.append(board, hand, outside);
    document.body.append(root);
    let selected = true;
    let clears = 0;
    const uninstall = installSelectionClickAway({
      roots: () => [board, hand],
      hasSelection: () => selected,
      clearSelection: () => {
        selected = false;
        clears += 1;
      },
    });

    board.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    hand.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(clears).toBe(0);

    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(selected).toBe(false);
    expect(clears).toBe(1);

    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(clears).toBe(1);

    uninstall();
    root.remove();
  });
});
