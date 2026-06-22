import { afterEach, describe, expect, it, vi } from 'vitest';

describe('profile ratings rail', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('shows soft-launch profile rows before rated games', async () => {
    // Pin prod semantics so dev-on variants (jieqi/banqi) don't add extra rows.
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    const { buildProfileRatings } = await import('./profile.js');

    const section = buildProfileRatings([]);

    expect(section.textContent).toContain('Dark Chess');
    expect(section.textContent).toContain('Dark Mini Xiangqi');
    expect(section.textContent).toContain('Drop Mini Xiangqi');
    expect(section.textContent).toContain('Crossroads Chess');
    expect(section.querySelectorAll('.profile-rating-row-empty')).toHaveLength(4);
  });

  it('shows Crossroads rated leaderboard panels even when play is not enabled', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'false');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ leaderboard: [] }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    const root = document.createElement('div');
    const { mountLeaderboard } = await import('./profile.js');

    await mountLeaderboard(root);

    expect(root.textContent).toContain('Crossroads Chess');
    expect(root.textContent).toContain('Drop Mini Xiangqi');
    expect(root.textContent).toContain('Human blitz ladders');
    expect(root.querySelector('.leaderboard-stat-value')?.textContent).toBe('3');
    expect(root.querySelector('.leaderboard-panel-subtitle')?.textContent).toBe('Blitz rating');
    expect(root.querySelectorAll('.leaderboard-panel')).toHaveLength(3);
    expect(fetchSpy).toHaveBeenCalledWith('/api/leaderboard?variant=drop-mini-xiangqi&limit=10');
    expect(fetchSpy).toHaveBeenCalledWith('/api/leaderboard?variant=crossroads-chess&limit=10');
  });
});
