import { describe, expect, it } from 'vitest';
import { mountDualChessPlay } from './dual-chess-play.js';

function click(root: HTMLElement, square: string): void {
  root
    .querySelector(`[data-square="${square}"]`)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('Dual Chess hot-seat controller', () => {
  it('mounts, selects a piece, plays a move and passes the turn', () => {
    const root = document.createElement('div');
    mountDualChessPlay(root);

    expect(root.querySelector('.dual-play-status')?.textContent).toBe('White to move');
    // 48 click targets (one per square) and the two control buttons.
    expect(root.querySelectorAll('[data-square]').length).toBe(48);
    expect(root.querySelectorAll('.dual-play-btn').length).toBe(2);

    // Select the d1 Knight, then move it to e3 (one of its two legal jumps).
    click(root, 'd1');
    expect(root.querySelector('.dual-play-status')?.textContent).toBe('White to move');
    click(root, 'e3');
    expect(root.querySelector('.dual-play-status')?.textContent).toBe('Red to move');
  });

  it('New game resets the board to White to move', () => {
    const root = document.createElement('div');
    mountDualChessPlay(root);
    click(root, 'd1');
    click(root, 'e3'); // now Red to move
    const reset = [...root.querySelectorAll<HTMLButtonElement>('.dual-play-btn')].find(
      (b) => b.textContent === 'New game',
    );
    reset?.click();
    expect(root.querySelector('.dual-play-status')?.textContent).toBe('White to move');
  });
});
