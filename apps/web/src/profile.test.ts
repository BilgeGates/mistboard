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
    expect(section.textContent).toContain('Crossroads Chess');
    expect(section.querySelectorAll('.profile-rating-row-empty')).toHaveLength(3);
  });

  it('shows Crossroads rated leaderboard panels even when play is not enabled', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'false');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ leaderboard: [] }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    const root = document.createElement('div');
    const { mountLeaderboard } = await import('./profile.js');

    await mountLeaderboard(root);

    expect(root.textContent).toContain('Crossroads Chess');
    expect(root.textContent).toContain('Human blitz ladders');
    expect(root.querySelector('.leaderboard-stat-value')?.textContent).toBe('2');
    expect(root.querySelector('.leaderboard-panel-subtitle')?.textContent).toBe('Blitz rating');
    expect(root.querySelectorAll('.leaderboard-panel')).toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledWith('/api/leaderboard?variant=crossroads-chess&limit=10');
  });
});
