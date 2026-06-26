import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('profile ratings rail', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
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
    expect(section.textContent).not.toContain('Crossroads Chess');
    expect(section.querySelectorAll('.profile-rating-row-empty')).toHaveLength(3);
  });

  it('localizes Traditional Chinese profile ratings rows', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    const { buildProfileRatings } = await import('./profile.js');

    const section = buildProfileRatings(
      [
        {
          variant: 'drop_mini_xiangqi',
          timeClass: 'blitz',
          eloRating: 1520,
          ratedGamesPlayed: 2,
          totalGamesPlayed: 3,
          provisional: false,
        },
      ],
      'zh-Hant',
    );

    expect(section.querySelector('h2')?.textContent).toBe('評分');
    expect(section.textContent).toContain('打入迷你象棋');
    expect(section.textContent).toContain('2 局計分對局');
  });

  it('localizes Traditional Chinese profile game rows', async () => {
    const { buildProfileGameRow } = await import('./profile-ui.js');

    const row = buildProfileGameRow(
      {
        roomId: 'room-1',
        variant: 'drop-mini-xiangqi',
        mode: 'pvp',
        rated: true,
        result: 'red-wins',
        termination: 'resignation',
        plyCount: 12,
        whiteName: null,
        blackName: null,
        corpusId: null,
        endedAt: '2026-06-01T12:00:00.000Z',
        participants: [
          {
            color: 'red',
            displayName: 'Misty',
            subjectType: 'user',
            subjectId: 'user-red',
            visibility: 'public',
          },
          {
            color: 'black',
            displayName: 'Opponent',
            subjectType: 'user',
            subjectId: 'user-black',
            visibility: 'public',
          },
        ],
        playerColor: 'red',
      },
      { locale: 'zh-Hant', timeOnly: true },
    );

    expect(row.textContent).toContain('勝');
    expect(row.textContent).toContain('對 Opponent');
    expect(row.textContent).toContain('打入迷你象棋');
    expect(row.textContent).toContain('紅方');
    expect(row.textContent).toContain('計分');
    expect(row.textContent).toContain('人類對人類');
    expect(row.textContent).toContain('12 手');
  });

  it('hides Crossroads rated leaderboard panels when play is not enabled', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'false');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ leaderboard: [] }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
    );
    const root = document.createElement('div');
    const { mountLeaderboard } = await import('./profile.js');

    await mountLeaderboard(root);

    expect(root.textContent).not.toContain('Crossroads Chess');
    expect(root.textContent).toContain('Drop Mini Xiangqi');
    expect(root.textContent).toContain('Human blitz ladders');
    expect(root.querySelector('.leaderboard-stat-value')?.textContent).toBe('2');
    expect(root.querySelector('.leaderboard-panel-subtitle')?.textContent).toBe('Blitz rating');
    expect(root.querySelectorAll('.leaderboard-panel')).toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledWith('/api/leaderboard?variant=drop-mini-xiangqi&limit=10');
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/leaderboard?variant=crossroads-chess&limit=10');
  });

  it('localizes Traditional Chinese leaderboard chrome', async () => {
    window.history.replaceState(null, '', '/zh-hant/leaderboard');
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'false');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const leaderboard = url.includes('drop-mini-xiangqi')
        ? [
            {
              rank: 1,
              handle: 'misty',
              displayName: 'Misty',
              eloRating: 1520,
              gamesPlayed: 3,
              provisional: false,
            },
          ]
        : [];
      return new Response(JSON.stringify({ leaderboard }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    });
    const root = document.createElement('div');
    const { mountLeaderboard } = await import('./profile.js');

    await mountLeaderboard(root);

    expect(root.querySelector('h1')?.textContent).toBe('排行榜');
    expect(root.textContent).toContain('Mistboard 公開變體的人類快棋排行榜。');
    expect(root.textContent).toContain('玩家');
    expect(root.textContent).toContain('最高評分');
    expect(root.textContent).toContain('打入迷你象棋');
    expect(root.textContent).toContain('快棋評分');
    expect(root.textContent).toContain('還沒有計分對局。');
  });

  it('shows Crossroads rated leaderboard panels behind the play flag', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ leaderboard: [] }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
    );
    const root = document.createElement('div');
    const { mountLeaderboard } = await import('./profile.js');

    await mountLeaderboard(root);

    expect(root.textContent).toContain('Crossroads Chess');
    expect(root.querySelector('.leaderboard-stat-value')?.textContent).toBe('3');
    expect(root.querySelectorAll('.leaderboard-panel')).toHaveLength(3);
    expect(fetchSpy).toHaveBeenCalledWith('/api/leaderboard?variant=crossroads-chess&limit=10');
  });
});
