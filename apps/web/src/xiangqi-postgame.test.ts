import { createInitialXiangqiState, getStandardXiangqiPlayerView } from '@mistboard/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountXiangqiPostgame, xiangqiPostgameApiUrl } from './xiangqi-postgame.js';

describe('Xiangqi postgame page', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_XIANGQI_ENABLED', 'true');
    window.history.replaceState(null, '', '/');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('builds the family-native public postgame API URL', () => {
    expect(xiangqiPostgameApiUrl('xq room')).toBe('/api/xiangqi/games/xq%20room');
  });

  it('renders the review without play-again, home, or room action links', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/xiangqi/games/xq_postgame') return jsonResponse(postgameFixture());
      if (url === '/api/xiangqi/games/xq_postgame/analysis') return new Response(null, { status: 204 });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountXiangqiPostgame(root, 'xq_postgame');
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledWith('/api/xiangqi/games/xq_postgame');
    expect(root.querySelector('.site-nav')).not.toBeNull();
    expect(root.textContent).toContain('Elephant Chess');
    expect(root.querySelector('.review-actions--rail')).toBeNull();
    expect(root.querySelector('.dxq-postgame__actions')).toBeNull();
    expect(root.textContent).not.toContain('Play again');
    expect(root.textContent).not.toContain('Back home');
    expect(root.querySelector<HTMLAnchorElement>('a[href="/room/xq_postgame"]')).toBeNull();
  });
});

function postgameFixture() {
  const state = createInitialXiangqiState('xq_postgame');
  const view = getStandardXiangqiPlayerView(state, 'red');
  return {
    game: {
      roomId: 'xq_postgame',
      variant: 'xiangqi',
      mode: 'pvp',
      result: 'red-wins',
      termination: 'resignation',
      plyCount: 0,
      startedAt: '2026-07-01T12:00:00.000Z',
      endedAt: '2026-07-01T12:05:00.000Z',
      rated: false,
      visibility: 'public',
      initialMs: 180_000,
      incrementMs: 2_000,
      players: [
        { color: 'red', name: 'Red', rating: null, kind: 'guest' },
        { color: 'black', name: 'Black', rating: null, kind: 'guest' },
      ],
    },
    state: {
      status: view.status,
      moveNumber: view.moveNumber,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    },
    timeline: [],
    view,
    views: { truth: view },
    history: { truth: [{ ply: 0, view }] },
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
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
