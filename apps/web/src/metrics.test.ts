import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountMetrics } from './metrics.js';

const publicStats = {
  generatedAt: '2026-07-21T00:00:00.000Z',
  totalCompletedGames: 682,
  last30dCompletedGames: 191,
  publicGames: 540,
  modeTotals: { pvp: 300, pve: 382, eve: 12 },
  variantTotals: [
    { variant: 'xiangqi', count: 402 },
    { variant: 'dark-xiangqi', count: 180 },
  ],
  dailyCompletedGames: [
    { date: '2026-07-19', completedGames: 3, cumulativeGames: 679 },
    { date: '2026-07-20', completedGames: 3, cumulativeGames: 682 },
  ],
};

const adminStats = {
  accounts: 42,
  accountsLast7d: 4,
  accountsLast30d: 11,
  games: 900,
  publicGames: 540,
  last7dGames: 30,
  gamesByResult: { 'red-win': 350, 'black-win': 300, draw: 32 },
  gamesByVariant: { xiangqi: 402, 'dark-xiangqi': 180 },
};

function stubFetch(overrides: Record<string, () => Response> = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (overrides[url]) return overrides[url]();
      if (url === '/api/stats/public') return json(publicStats);
      if (url === '/api/live-stats') return json({ playing: 2, online: 5 });
      if (url === '/api/stats') return json(adminStats);
      return json({}, 404);
    }),
  );
}

describe('metrics page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    document.body.className = '';
  });

  it('public /stats shows games, variants and modes but no players or results', async () => {
    stubFetch();
    const root = mountRoot();
    await mountMetrics(root, { admin: false });

    expect(root.querySelector('.site-section-heading')?.textContent).toBe('Statistics');
    const cardLabels = [...root.querySelectorAll('.metrics-card-label')].map((n) => n.textContent);
    expect(cardLabels).toContain('Games played');
    expect(cardLabels).toContain('Public games');
    expect(cardLabels).toContain('In play now');
    // Admin-only cards must not leak onto the public page.
    expect(cardLabels).not.toContain('Players');
    expect(cardLabels).not.toContain('Online now');

    const sectionTitles = [...root.querySelectorAll('.metrics-section-heading')].map(
      (n) => n.textContent,
    );
    expect(sectionTitles).toEqual(['Games over time', 'Games by variant', 'Games by mode']);

    // Variant labels use the public-facing names (dark-xiangqi -> Fog Xiangqi).
    expect(root.textContent).toContain('Fog Xiangqi');
    expect(root.textContent).not.toContain('dark-xiangqi');
    // Bot-vs-bot (EvE) is hidden from the public page, even though the API
    // returns a non-zero eve count.
    expect(root.textContent).toContain('Human vs human');
    expect(root.textContent).not.toContain('Bot vs bot');
    expect(root.querySelector('svg.platform-activity-svg')).not.toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith('/api/stats', expect.anything());
  });

  it('admin /metrics adds the players card, online count and result split', async () => {
    stubFetch();
    const root = mountRoot();
    await mountMetrics(root, { admin: true });

    expect(root.querySelector('.site-section-heading')?.textContent).toBe('Metrics');
    const cardLabels = [...root.querySelectorAll('.metrics-card-label')].map((n) => n.textContent);
    expect(cardLabels).toContain('Players');
    expect(cardLabels).toContain('Online now');

    const playersCard = [...root.querySelectorAll('.metrics-card')].find((c) =>
      c.querySelector('.metrics-card-label')?.textContent?.includes('Players'),
    );
    expect(playersCard?.querySelector('.metrics-card-value')?.textContent).toBe('42');
    expect(playersCard?.querySelector('.metrics-card-note')?.textContent).toBe('+11 this month');

    const sectionTitles = [...root.querySelectorAll('.metrics-section-heading')].map(
      (n) => n.textContent,
    );
    expect(sectionTitles).toContain('Games by result');
    expect(root.textContent).toContain('Red win');
    // Admin keeps the bot-vs-bot mode row.
    expect(root.textContent).toContain('Bot vs bot');
  });

  it('falls back to a notice when statistics are unavailable', async () => {
    stubFetch({
      '/api/stats/public': () => json({}, 503),
      '/api/live-stats': () => json({}, 503),
      '/api/stats': () => json({}, 503),
    });
    const root = mountRoot();
    await mountMetrics(root, { admin: true });

    expect(root.textContent).toContain('Could not load statistics');
    expect(root.querySelector('.metrics-card')).toBeNull();
  });
});

function mountRoot(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
