import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountDualChessPlay } from './dual-chess-play.js';

function click(root: HTMLElement, square: string): void {
  root
    .querySelector(`[data-square="${square}"]`)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function clickButton(root: HTMLElement, label: string): void {
  [...root.querySelectorAll<HTMLButtonElement>('.dual-play-btn')]
    .find((b) => b.textContent === label)
    ?.click();
}

describe('Dual Chess hot-seat controller', () => {
  it('mounts, selects a piece, plays a move and passes the turn', () => {
    const root = document.createElement('div');
    mountDualChessPlay(root);

    expect(root.querySelector('.dual-play-status')?.textContent).toBe('White to move');
    // 48 click targets (one per square) and the control buttons.
    expect(root.querySelectorAll('[data-square]').length).toBe(48);
    expect(root.querySelectorAll('.dual-play-btn').length).toBe(4);

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

describe('Dual Chess vs Computer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the engine for a reply after the human move and applies it', async () => {
    const fetchMock = vi.fn(async () => ({ json: async () => ({ move: 'a7a6' }) }));
    vi.stubGlobal('fetch', fetchMock);

    const root = document.createElement('div');
    mountDualChessPlay(root);
    clickButton(root, 'vs Computer');
    expect(root.querySelector('.dual-play-status')?.textContent).toBe('White to move');

    // Human (White) plays d1->e3; the bot (Red) should reply a7a6 via the API.
    click(root, 'd1');
    click(root, 'e3');

    await vi.waitFor(() => {
      expect(root.querySelector('.dual-play-status')?.textContent).toBe('White to move');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dual-chess/engine-move',
      expect.objectContaining({ method: 'POST' }),
    );
    // The Red pawn moved a7->a6.
    expect(root.querySelector('[data-square]')).toBeTruthy();
  });

  it('shows an error when the engine call fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const root = document.createElement('div');
    mountDualChessPlay(root);
    clickButton(root, 'vs Computer');
    click(root, 'd1');
    click(root, 'e3');

    await vi.waitFor(() => {
      expect(root.querySelector('.dual-play-status')?.textContent).toContain(
        'Computer unavailable',
      );
    });
  });
});
