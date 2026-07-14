import {
  applyJungleFlipMove,
  createInitialJungleFlipState,
  getJungleFlipPlayerView,
  type JungleFlipMove,
  jungleFlipTruthView,
  STANDARD_JUNGLE_FLIP_DEAL,
} from '@mistboard/game';
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
    expect(root.textContent).toContain('Spectator room');
    expect(root.textContent).toContain('Flip Jungle');
    expect(root.textContent).toContain('Red wins');
    expect(root.querySelectorAll('.jungle-flip-postgame-board')).toHaveLength(1);
    expect(root.querySelector('.review-stage')?.classList).toContain('review-stage--board-only');
    expect(root.querySelector('.review-shell__right .captures-strip')).toBeNull();

    // The opening action was a flip (self-move): the move list reads it as "a1 flip"
    // in the left cell (the first ply, `firstMover: 'a'`).
    const firstMove = root.querySelector<HTMLButtonElement>(
      '.review-move-list__row .review-move-list__move',
    );
    expect(firstMove?.querySelector('.review-move-list__san')?.textContent).toBe('a1 flip');
    // Opens at the final ply (the flip is the mainline tip): the highlighted current
    // cell is that flip move. (The tree move list highlights via --current.)
    const current = root.querySelector('.review-move-list__move--current');
    expect(current?.querySelector('.review-move-list__san')?.textContent).toBe('a1 flip');
    // Server-side computer analysis underboard is wired: a signed-out visitor sees the
    // sign-in CTA (the account-gated compute button) rather than nothing.
    const analyseButton = root.querySelector<HTMLButtonElement>('.xiangqi-review__analyse');
    expect(analyseButton).not.toBeNull();
    expect(analyseButton?.textContent).toContain('Sign in to request analysis');
  });
});

function postgameFixture() {
  // Build a REAL 1-ply flip-jungle game with the kernel so the tree can reconstruct
  // the deal (from history.revealed's ply-0 truth board) and replay it: the standard
  // fixed deal, opening a1 flip (a real game always opens with a flip), then black
  // resigns. Generating from the kernel keeps the fixture legal.
  const initial = createInitialJungleFlipState('jgf_postgame', STANDARD_JUNGLE_FLIP_DEAL);
  const flip: JungleFlipMove = { from: 'a1', to: 'a1' };
  const afterFlip = applyJungleFlipMove(initial, flip);
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
      moveNumber: afterFlip.moveNumber,
      timeControl: { initialMs: 180000, incrementMs: 2000 },
    },
    timeline: [
      { type: 'move-played', at: 4, color: 'red', move: flip, ply: 1 },
      { type: 'seat-resigned', at: 5, color: 'black', winner: 'red' },
    ],
    view: getJungleFlipPlayerView(afterFlip, 'red'),
    history: {
      // Spoiler overlay: the ply-0 board is the full deal the adapter reconstructs from.
      revealed: [
        { ply: 0, view: jungleFlipTruthView(initial) },
        { ply: 1, view: jungleFlipTruthView(afterFlip) },
      ],
    },
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
