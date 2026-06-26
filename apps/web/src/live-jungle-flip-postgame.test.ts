import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jungleFlipResultLabel } from './jungle-flip-result-label.js';
import {
  initialPlyFromSearch,
  jungleFlipPostgameApiUrl,
  mountJungleFlipPostgame,
} from './live-jungle-flip-postgame.js';

describe('jungleFlipResultLabel maps the winning seat to its flip-bound ink', () => {
  it('resolves seat -> ink once the opening flip binds', () => {
    // First-mover ('red') seat flipped black → owns black ink.
    expect(jungleFlipResultLabel('red-wins', 'black')).toBe('Black wins');
    expect(jungleFlipResultLabel('black-wins', 'black')).toBe('Red wins');
    expect(jungleFlipResultLabel('red-wins', 'red')).toBe('Red wins');
    expect(jungleFlipResultLabel('black-wins', 'red')).toBe('Black wins');
  });

  it('keeps draws ink-agnostic and falls back to move order before the flip binds', () => {
    expect(jungleFlipResultLabel('draw', 'red')).toBe('Draw');
    expect(jungleFlipResultLabel('red-wins', null)).toBe('First wins');
    expect(jungleFlipResultLabel('black-wins', null)).toBe('Second wins');
  });
});

describe('Flip Jungle postgame page', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_JUNGLE_FLIP_ENABLED', 'true');
    window.history.replaceState(null, '', '/');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('builds the family-native public postgame API URL', () => {
    expect(jungleFlipPostgameApiUrl('jgf room')).toBe('/api/jungle-flip/games/jgf%20room');
  });

  it('reads the initial ply from the query string', () => {
    expect(initialPlyFromSearch('?ply=2')).toBe(2);
    expect(initialPlyFromSearch('?ply=x')).toBeNull();
  });

  it('renders a single review board, info rail, and move rows', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(postgameFixture()));
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountJungleFlipPostgame(root, 'jgf_postgame');
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledWith('/api/jungle-flip/games/jgf_postgame');
    expect(root.textContent).toContain('Game review');
    expect(root.textContent).toContain('Flip Jungle');
    expect(root.textContent).toContain('Red wins');
    expect(root.querySelectorAll('.jungle-flip-postgame-board')).toHaveLength(1);

    // The opening action was a flip (self-move): the move list reads it as "a1 flip".
    const whitePly = root.querySelector<HTMLButtonElement>('.move-row .white-ply');
    expect(whitePly?.textContent).toBe('a1 flip');
    expect(root.textContent).toContain('ply 1 of 1');
  });

  it('hides unflipped tiles by default and reveals them on toggle', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(postgameFixture()));
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountJungleFlipPostgame(root, 'jgf_postgame');
    await flushPromises();

    const board = () => root.querySelector('.jungle-flip-postgame-board') as HTMLElement;
    // Step back to ply 0 (before the flip): the as-played mask paints face-down backs
    // (a tile drawn with the neutral "back" gradient fill).
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(board().innerHTML).toContain('url(#jungleflip-back)');

    const reveal = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (el) => el.textContent === 'Reveal tiles',
    );
    expect(reveal).not.toBeUndefined();
    reveal!.click();
    // Revealed overlay: no tile is painted with the back fill, even at ply 0.
    expect(reveal!.textContent).toBe('Hide tiles');
    expect(board().innerHTML).not.toContain('url(#jungleflip-back)');
  });
});

function postgameFixture() {
  return {
    game: {
      roomId: 'jgf_postgame',
      variant: 'jungle-flip',
      mode: 'pvp',
      result: 'red-wins',
      termination: 'resignation',
      plyCount: 1,
      startedAt: '2026-06-24T12:00:00.000Z',
      endedAt: '2026-06-24T12:05:00.000Z',
      rated: false,
      visibility: 'private',
      initialMs: 180000,
      incrementMs: 2000,
    },
    state: {
      status: { type: 'finished', winner: 'red', reason: 'resignation' },
      moveNumber: 1,
      timeControl: { initialMs: 180000, incrementMs: 2000 },
    },
    timeline: [
      { type: 'move-played', at: 4, color: 'red', move: { from: 'a1', to: 'a1' }, ply: 1 },
      { type: 'seat-resigned', at: 5, color: 'black', winner: 'red' },
    ],
    // Truth view: ink bound red to the first seat (so 'red-wins' → "Red wins").
    view: revealedView(1),
    history: {
      truth: [
        { ply: 0, view: maskedView(0) },
        { ply: 1, view: revealedView(1) },
      ],
      revealed: [
        { ply: 0, view: revealedView(0) },
        { ply: 1, view: revealedView(1) },
      ],
    },
  };
}

const finished = { type: 'finished', winner: 'red', reason: 'resignation' } as const;
const playing = { type: 'playing', turn: 'black' } as const;

function maskedView(ply: number) {
  return {
    id: `jgf_t${ply}`,
    perspective: 'red',
    board: { a1: { faceDown: true }, b2: { faceDown: true } },
    legalMoves: [],
    captured: [],
    status: ply === 0 ? playing : finished,
    ply,
    firstColor: 'red',
    moveNumber: 1,
    lastMove: ply === 0 ? undefined : { from: 'a1', to: 'a1' },
  };
}

function revealedView(ply: number) {
  return {
    id: `jgf_r${ply}`,
    perspective: 'red',
    board: {
      a1: { color: 'red', role: 'rat', faceDown: false },
      b2: { color: 'black', role: 'elephant', faceDown: false },
    },
    legalMoves: [],
    captured: [],
    status: ply === 0 ? playing : finished,
    ply,
    firstColor: 'red',
    moveNumber: 1,
    lastMove: ply === 0 ? undefined : { from: 'a1', to: 'a1' },
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: init.status ?? 200,
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

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
