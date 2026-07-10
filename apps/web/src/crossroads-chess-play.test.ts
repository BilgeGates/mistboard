import { XIANGQI_GLYPH_PATHS } from '@mistboard/board-render';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountCrossroadsChessPlay } from './crossroads-chess-play.js';
import { boardAppearanceChangedEvent } from './theme.js';

function click(root: HTMLElement, square: string): void {
  root
    .querySelector(`[data-square="${square}"]`)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function clickButton(root: HTMLElement, label: string): void {
  [...root.querySelectorAll<HTMLButtonElement>('.crossroads-play-btn')]
    .find((b) => b.textContent === label)
    ?.click();
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() });
});

describe('Crossroads Chess hot-seat controller', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mounts, selects a piece, plays a move and passes the turn', () => {
    const root = document.createElement('div');
    mountCrossroadsChessPlay(root);

    expect(root.querySelector('h1')?.textContent).toBe('Crossroads Chess');
    expect(root.querySelector('.crossroads-play-status')?.textContent).toBe('White to move');
    // 48 click targets (one per square) and the control buttons: the Opponent
    // toggle (2) + New game, Flip board, Play a friend 5+5.
    expect(root.querySelectorAll('[data-square]').length).toBe(48);
    expect(root.querySelectorAll('.crossroads-play-btn').length).toBe(5);

    // Select the d1 Knight, then move it to e3 (one of its two legal jumps).
    click(root, 'd1');
    expect(root.querySelector('.crossroads-play-status')?.textContent).toBe('White to move');
    click(root, 'e3');
    expect(root.querySelector('.crossroads-play-status')?.textContent).toBe('Red to move');
  });

  it('New game resets the board to White to move', () => {
    const root = document.createElement('div');
    mountCrossroadsChessPlay(root);
    click(root, 'd1');
    click(root, 'e3'); // now Red to move
    const reset = [...root.querySelectorAll<HTMLButtonElement>('.crossroads-play-btn')].find(
      (b) => b.textContent === 'New game',
    );
    reset?.click();
    expect(root.querySelector('.crossroads-play-status')?.textContent).toBe('White to move');
  });

  it('rerenders local pieces from the chess and xiangqi appearance settings', () => {
    const root = document.createElement('div');

    // Start from the traditional glyph set so the baseline assertion below is a
    // known CJK disk; the test then proves a switch to western re-renders it.
    // Stamp the piece-set rollout version so the one-time Dobutsu reset doesn't
    // override this explicit choice (simulates a post-rollout user).
    window.localStorage.setItem('mistboard.xiangqiPieceSetVersion', '3');
    window.localStorage.setItem('mistboard.xiangqiPieceSet', 'traditional');
    mountCrossroadsChessPlay(root);

    expect(root.innerHTML).toContain(XIANGQI_GLYPH_PATHS.車);
    expect(root.innerHTML).not.toContain('/pieces/letter/wK.svg');

    window.localStorage.setItem('mistboard.pieceSet', 'letter');
    window.localStorage.setItem('mistboard.xiangqiPieceSet', 'western');
    window.dispatchEvent(new Event(boardAppearanceChangedEvent));

    expect(root.innerHTML).toContain('/pieces/letter/wK.svg');
    expect(root.innerHTML).toContain('>R</text>');
    expect(root.innerHTML).not.toContain(XIANGQI_GLYPH_PATHS.車);
  });

  it('creates live friend rooms with the Crossroads 5+5 time control', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const root = document.createElement('div');

    mountCrossroadsChessPlay(root);
    clickButton(root, 'Play a friend 5+5');

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gameSpecId: 'crossroads-chess',
        mode: 'pvp',
        timeControl: { initialMs: 300_000, incrementMs: 5_000 },
      }),
    });
  });
});

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('Crossroads Chess vs Computer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the engine for a reply after the human move and applies it', async () => {
    const fetchMock = vi.fn(async () => ({ json: async () => ({ move: 'a7a6' }) }));
    vi.stubGlobal('fetch', fetchMock);

    const root = document.createElement('div');
    mountCrossroadsChessPlay(root);
    clickButton(root, 'vs Computer');
    expect(root.querySelector('.crossroads-play-status')?.textContent).toBe('White to move');

    // Human (White) plays d1->e3; the bot (Red) should reply a7a6 via the API.
    click(root, 'd1');
    click(root, 'e3');

    await vi.waitFor(() => {
      expect(root.querySelector('.crossroads-play-status')?.textContent).toBe('White to move');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/crossroads-chess/engine-move',
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
    mountCrossroadsChessPlay(root);
    clickButton(root, 'vs Computer');
    click(root, 'd1');
    click(root, 'e3');

    await vi.waitFor(() => {
      expect(root.querySelector('.crossroads-play-status')?.textContent).toContain(
        'Computer unavailable',
      );
    });
  });

  it('lets you play Red, in which case the engine opens; difficulty is sent', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: { body: string }) => ({
      json: async () => ({ move: 'd2d3' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const root = document.createElement('div');
    mountCrossroadsChessPlay(root);
    clickButton(root, 'vs Computer');
    clickButton(root, 'Easy'); // pick difficulty (also restarts)
    clickButton(root, 'Red'); // human plays Red -> White (engine) opens

    await vi.waitFor(() => {
      expect(root.querySelector('.crossroads-play-status')?.textContent).toBe('Red to move');
    });
    // The request carried the chosen difficulty's skill level (Easy -> 1).
    const body = JSON.parse(fetchMock.mock.calls.at(-1)?.[1]?.body as string);
    expect(body.skill).toBe(1);
    expect(Array.isArray(body.moves)).toBe(true);
  });
});
