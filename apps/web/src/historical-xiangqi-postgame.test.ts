import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  historicalXiangqiGameApiUrl,
  loadHistoricalXiangqiGame,
  mountHistoricalXiangqiPostgame,
} from './historical-xiangqi-postgame.js';

describe('historical xiangqi review page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the archive detail endpoint', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ game: historicalGameFixture() }));
    vi.stubGlobal('fetch', fetchSpy);
    expect(historicalXiangqiGameApiUrl('hxq game')).toBe(
      '/api/historical-xiangqi/games/hxq%20game',
    );

    const result = await loadHistoricalXiangqiGame('hxq_1');

    expect(fetchSpy).toHaveBeenCalledWith('/api/historical-xiangqi/games/hxq_1', {
      headers: { accept: 'application/json' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.game.redNameRaw).toBe('Hu Ronghua');
  });

  it('renders a historical game through the shared xiangqi review shell', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ game: historicalGameFixture() }));
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountHistoricalXiangqiPostgame(root, 'hxq_1');
    await flushPromises();

    expect(root.querySelector('.xiangqi-live-board')).not.toBeNull();
    expect(root.querySelector('.engine-panel')).not.toBeNull();
    expect(root.textContent).toContain('Historical game');
    expect(root.textContent).toContain('Hu Ronghua');
    expect(root.textContent).toContain('Liu Dahua');
    expect(root.textContent).toContain('Draw');
    expect(root.textContent).not.toContain('Draw wins');
    expect(root.textContent).toContain('h3-e3');
    expect(root.textContent).toContain('Search games');
    expect(root.textContent).not.toContain('Request computer analysis');
  });
});

function historicalGameFixture() {
  return {
    id: 'hxq_1',
    sourceId: 'hxqs_xqbase',
    sourceGameId: '123',
    sourceUrl: 'https://example.test/game/123',
    eventName: 'Wuyang Cup',
    site: 'Guangzhou',
    round: '1',
    board: null,
    playedOn: '1982-01-04',
    redNameRaw: 'Hu Ronghua',
    blackNameRaw: 'Liu Dahua',
    result: '1/2-1/2',
    termination: null,
    plyCount: 3,
    moveFormat: 'wxf',
    moves: [
      { from: 'h3', to: 'e3' },
      { from: 'h8', to: 'e8' },
      { from: 'h1', to: 'g3' },
    ],
    tags: {},
    qualityFlags: [],
    visibility: 'public',
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
