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
    // Xiangqi pivot: Drop Mini is off the rating grids now.
    expect(section.textContent).not.toContain('Drop Mini Xiangqi');
    expect(section.textContent).not.toContain('Crossroads Chess');
    // Fortress + Jungle + Flip Jungle + Dark Chess (always-on) + Dark Mini (render
    // flag) = 5 profile rows.
    expect(section.querySelectorAll('.profile-rating-row-empty')).toHaveLength(5);
  });

  it('localizes Traditional Chinese profile ratings rows', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    const { buildProfileRatings } = await import('./profile.js');

    // Xiangqi pivot: Drop Mini is off the rating grids; localize an on-grid row
    // (Fortress Xiangqi) instead.
    const section = buildProfileRatings(
      [
        {
          variant: 'fortress_xiangqi',
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
    expect(section.textContent).toContain('堡壘象棋');
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

  // Summary + online-players fetch stub for the leaderboard page. Ladders are
  // keyed by rating-pool name (the summary endpoint's vocabulary).
  function stubLeaderboardFetch(options?: {
    ladders?: { variant: string; leaderboard: unknown[] }[];
    activePlayers?: unknown[];
    players?: { handle: string; displayName: string; rating?: unknown; playing?: boolean }[];
    anonymousOnline?: number;
  }) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/players/online')
        ? {
            players: (options?.players ?? []).map((p) => ({ rating: null, playing: false, ...p })),
            count: options?.players?.length ?? 0,
            anonymousOnline: options?.anonymousOnline ?? 0,
          }
        : {
            timeClass: 'blitz',
            ladders: options?.ladders ?? [],
            activePlayers: options?.activePlayers ?? [],
          };
      return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    });
  }

  it('hides Crossroads rated leaderboard panels when play is not enabled', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'false');
    const fetchSpy = stubLeaderboardFetch();
    const root = document.createElement('div');
    const { mountLeaderboard } = await import('./profile.js');

    await mountLeaderboard(root);

    expect(root.textContent).not.toContain('Crossroads Chess');
    // Xiangqi pivot: Drop Mini is off the grids; Fortress is an always-on ladder.
    expect(root.textContent).not.toContain('Drop Mini Xiangqi');
    expect(root.textContent).toContain('Storm the Fortress');
    expect(root.textContent).toContain('Human blitz ladders');
    // 4 rated ladders (Dark Chess + always-on Jungle, Flip Jungle, Fortress) + the
    // Active players panel.
    expect(root.querySelectorAll('.leaderboard-panel')).toHaveLength(5);
    expect(root.textContent).toContain('Active players');
    expect(fetchSpy).toHaveBeenCalledWith('/api/leaderboard/summary?limit=10');
    expect(fetchSpy).toHaveBeenCalledWith('/api/players/online');
  });

  it('renders the community rail and the online players column', async () => {
    vi.stubEnv('DEV', false);
    stubLeaderboardFetch({
      players: [
        {
          handle: 'misty',
          displayName: 'Misty',
          rating: { variant: 'fog', eloRating: 1710, provisional: true },
          playing: true,
        },
      ],
      anonymousOnline: 3,
    });
    const root = document.createElement('div');
    const { mountLeaderboard } = await import('./profile.js');

    await mountLeaderboard(root);

    const rail = root.querySelector('.community-rail');
    expect(rail).not.toBeNull();
    const links = [...(rail?.querySelectorAll('a') ?? [])];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/leaderboard', '/bots']);
    expect(rail?.querySelector('a[aria-current="page"]')?.textContent).toBe('Leaderboard');

    expect(root.querySelector('.leaderboard-online-heading')?.textContent).toBe('Online players');
    const onlineLink = root.querySelector('.leaderboard-online-list a');
    expect(onlineLink?.getAttribute('href')).toBe('/@/misty');
    expect(onlineLink?.textContent).toContain('Misty');
    const rating = onlineLink?.querySelector('.leaderboard-online-rating');
    expect(rating?.textContent).toBe('1710?');
    expect(rating?.getAttribute('title')).toBe('Dark Chess');
    expect(onlineLink?.querySelector('.leaderboard-online-playing')?.getAttribute('title')).toBe(
      'Playing now',
    );
    expect(root.querySelector('.leaderboard-online-anon')?.textContent).toBe('+3 anonymous online');
  });

  it('shows the empty online state when nobody is online', async () => {
    vi.stubEnv('DEV', false);
    stubLeaderboardFetch();
    const root = document.createElement('div');
    const { mountLeaderboard } = await import('./profile.js');

    await mountLeaderboard(root);

    expect(root.querySelector('.leaderboard-online-empty')?.textContent).toBe('No players online.');
  });

  it('fills ladder tables, marks online players, and sinks empty panels last', async () => {
    vi.stubEnv('DEV', false);
    // Xiangqi pivot: Drop Mini is off the grids, so populate an on-grid ladder
    // (Fortress Xiangqi) to exercise populated-first ordering.
    stubLeaderboardFetch({
      ladders: [
        {
          variant: 'fortress_xiangqi',
          leaderboard: [
            {
              rank: 1,
              handle: 'misty',
              displayName: 'Misty',
              eloRating: 1520,
              gamesPlayed: 3,
              provisional: false,
            },
          ],
        },
      ],
      activePlayers: [{ rank: 1, handle: 'misty', displayName: 'Misty', gamesPlayed: 12 }],
      players: [{ handle: 'misty', displayName: 'Misty' }],
    });
    const root = document.createElement('div');
    const { mountLeaderboard } = await import('./profile.js');

    await mountLeaderboard(root);

    const row = root.querySelector('.leaderboard-table tbody tr');
    expect(row?.textContent).toContain('Misty');
    expect(row?.querySelector('a')?.getAttribute('href')).toBe('/@/misty');
    // Presence circle fills for players in the online set.
    expect(row?.querySelector('.leaderboard-presence-online')).not.toBeNull();
    // Ladders absent from the summary render the no-rated-games state.
    expect(root.textContent).toContain('No rated games yet.');

    // Populated-first ordering: Active players (12 games) leads, the populated
    // Fortress Xiangqi ladder follows, empty ladders sink to the tail.
    const titles = [...root.querySelectorAll('.leaderboard-panel-title')].map(
      (el) => el.textContent,
    );
    expect(titles[0]).toBe('Active players');
    expect(titles[1]).toBe('Storm the Fortress');
    const panels = [...root.querySelectorAll('.leaderboard-panel')];
    expect(panels[0]?.textContent).toContain('12');
    expect(panels[2]?.textContent).toContain('No rated games yet.');
  });

  it('localizes Traditional Chinese leaderboard chrome', async () => {
    window.history.replaceState(null, '', '/zh-hant/leaderboard');
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'false');
    // Xiangqi pivot: Drop Mini is off the grids; populate an on-grid ladder
    // (Fortress Xiangqi) instead.
    stubLeaderboardFetch({
      ladders: [
        {
          variant: 'fortress_xiangqi',
          leaderboard: [
            {
              rank: 1,
              handle: 'misty',
              displayName: 'Misty',
              eloRating: 1520,
              gamesPlayed: 3,
              provisional: false,
            },
          ],
        },
      ],
    });
    const root = document.createElement('div');
    const { mountLeaderboard } = await import('./profile.js');

    await mountLeaderboard(root);

    expect(root.querySelector('h1')?.textContent).toBe('排行榜');
    expect(root.textContent).toContain('Mistboard 公開變體的人類快棋排行榜。');
    expect(root.textContent).toContain('堡壘象棋');
    expect(root.textContent).toContain('還沒有計分對局。');
    expect(root.textContent).toContain('活躍玩家');
    expect(root.querySelector('.leaderboard-online-heading')?.textContent).toBe('線上玩家');
    expect(root.textContent).toContain('目前沒有玩家在線上。');
  });

  it('shows Crossroads rated leaderboard panels behind the play flag', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    stubLeaderboardFetch();
    const root = document.createElement('div');
    const { mountLeaderboard } = await import('./profile.js');

    await mountLeaderboard(root);

    expect(root.textContent).toContain('Crossroads Chess');
    // 5 rated ladders (Dark Chess + always-on Fortress, Jungle, Flip Jungle +
    // Crossroads behind the flag) + the Active players panel.
    expect(root.querySelectorAll('.leaderboard-panel')).toHaveLength(6);
  });
});
