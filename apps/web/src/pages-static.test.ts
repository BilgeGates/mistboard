import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountAbout } from './pages-static.js';

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('about page platform activity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('hydrates public platform activity stats', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        generatedAt: '2026-05-29T12:00:00.000Z',
        totalCompletedGames: 1234,
        last30dCompletedGames: 56,
        publicGames: 78,
        modeTotals: { pvp: 42, pve: 31, eve: 9 },
        dailyCompletedGames: [
          { date: '2026-05-11', completedGames: 10, cumulativeGames: 10 },
          { date: '2026-05-12', completedGames: 0, cumulativeGames: 10 },
          { date: '2026-05-13', completedGames: 20, cumulativeGames: 30 },
          { date: '2026-05-14', completedGames: 0, cumulativeGames: 30 },
          { date: '2026-05-15', completedGames: 26, cumulativeGames: 56 },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const root = document.createElement('main');
    document.body.append(root);
    mountAbout(root);

    expect(root.textContent).toContain('Loading activity totals…');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/stats/public', { credentials: 'same-origin' });
    expect(root.textContent).toContain('Player game activity');
    expect(root.textContent).toContain('player-facing completed games tracked');
    expect(root.textContent).toContain('1,234');
    expect(root.textContent).toContain('last 30 days');
    expect(root.textContent).toContain('Player vs player');
    expect(root.textContent).not.toContain('Engine lab');
    const pageText = root.textContent ?? '';
    expect(pageText.indexOf('Open source foundation')).toBeLessThan(
      pageText.indexOf('Player game activity'),
    );
    expect(root.querySelectorAll('.platform-activity-metric')).toHaveLength(0);
    expect(root.querySelector('.platform-activity-chart svg')).not.toBeNull();
    expect(root.querySelectorAll('.platform-activity-y-axis text').length).toBeGreaterThan(1);
    expect(root.querySelectorAll('.platform-activity-x-axis text').length).toBeGreaterThan(2);
    const modeItems = root.querySelectorAll('.platform-activity-mode-item');
    expect(modeItems).toHaveLength(2);
    expect(modeItems[0]?.textContent).toBe('Player vs player 42');
    expect(modeItems[1]?.textContent).toBe('Player vs engine 31');
    expect(root.querySelector('.platform-activity-mode-list')?.getAttribute('aria-label')).toBe(
      'Mode split',
    );
    expect(root.querySelector('.platform-activity-mode-heading')).toBeNull();
    expect(root.querySelector('.platform-activity-markers')).toBeNull();
  });

  it('keeps the about page readable when stats are unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503 })),
    );

    const root = document.createElement('main');
    document.body.append(root);
    mountAbout(root);
    await flushPromises();

    expect(root.textContent).toContain('Activity totals are unavailable');
    expect(root.textContent).toContain('Trust by design');
  });
});
