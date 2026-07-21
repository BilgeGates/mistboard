import { afterEach, describe, expect, it, vi } from 'vitest';

function ratingSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gameSpecId: 'dark-chess',
    timeClass: 'blitz',
    rating: 1812,
    ratingDeviation: 92,
    games: 48,
    source: 'eve-anchor',
    sourceRef: 'report-1',
    createdAt: '2026-06-01T00:00:00.000Z',
    provisional: false,
    ...overrides,
  };
}

function misty(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const primaryRating = ratingSnapshot();
  return {
    id: 'misty',
    displayName: 'Misty',
    bio: 'Searches hidden positions with the Mistboard engine.',
    ownerType: 'system',
    ownerUserId: null,
    activeEngineId: 'python-v2-v1.5',
    defaultGameSpecId: 'dark-chess',
    supportedGameSpecIds: ['dark-chess', 'dark-draft960', 'banqi'],
    play: {
      mode: 'pve',
      gameSpecId: 'dark-chess',
      engineId: 'python-v2-v1.5',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      preferredColor: 'random',
    },
    playOptions: [
      { gameSpecId: 'dark-chess', engineId: 'python-v2-v1.5', playable: true },
      { gameSpecId: 'dark-draft960', engineId: 'python-v2-v1.5', playable: true },
      { gameSpecId: 'banqi', engineId: 'misty-banqi', playable: true },
    ],
    gamesTotal: 12,
    record: { games: 12, wins: 8, losses: 3, draws: 1 },
    rating: primaryRating,
    ratings: [
      primaryRating,
      ratingSnapshot({ gameSpecId: 'banqi', timeClass: 'rapid', rating: 1620, games: 12 }),
    ],
    games: [],
    ...overrides,
  };
}

function pikafish(): Record<string, unknown> {
  return misty({
    id: 'pikafish',
    displayName: 'Pikafish',
    bio: 'Full-strength Pikafish.',
    activeEngineId: 'pikafish',
    defaultGameSpecId: 'xiangqi',
    supportedGameSpecIds: ['xiangqi', 'jieqi'],
    playOptions: [
      { gameSpecId: 'xiangqi', engineId: 'pikafish', playable: true },
      { gameSpecId: 'jieqi', engineId: 'pikafish-jieqi', playable: true },
    ],
    rating: null,
    ratings: [],
  });
}

function ladderBot(
  level: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return misty({
    id: `fairy-stockfish-level-${level}`,
    displayName: `Fairy-Stockfish Level ${level}`,
    bio: `Fairy-Stockfish at level ${level}.`,
    activeEngineId: `fairy-stockfish-xiangqi-level-${level}`,
    defaultGameSpecId: 'xiangqi',
    supportedGameSpecIds: ['xiangqi', 'fortress-xiangqi'],
    playOptions: [
      {
        gameSpecId: 'xiangqi',
        engineId: `fairy-stockfish-xiangqi-level-${level}`,
        playable: true,
      },
      {
        gameSpecId: 'fortress-xiangqi',
        engineId: `fairy-stockfish-fortress-xiangqi-level-${level}`,
        playable: false,
      },
    ],
    rating: null,
    ratings: [],
    ...overrides,
  });
}

function rosterPayload(): { bots: Record<string, unknown>[] } {
  return {
    bots: [
      misty(),
      pikafish(),
      // Out of order on purpose: the directory sorts the ladder by level.
      ...[3, 1, 2, 4, 5, 6, 7, 8].map((level) => ladderBot(level)),
    ],
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200,
    ...init,
  });
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('bot pages', () => {
  afterEach(() => {
    document.body.replaceChildren();
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('renders featured Misty/Pikafish rows and the ladder as 8 rows', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(rosterPayload()));
    const root = document.createElement('div');
    const { mountBots } = await import('./bots.js');

    await mountBots(root);

    expect(
      [...root.querySelectorAll('.bot-roster-section h2')].map((el) => el.textContent),
    ).toEqual(['Featured', 'Fairy-Stockfish ladder']);
    // Community rail is shared with /player; Online bots is the active entry.
    expect(root.querySelector('.community-rail a[aria-current="page"]')?.textContent).toBe(
      'Online bots',
    );

    const featuredNames = [...root.querySelectorAll('.bot-row-featured .bot-row-name')].map(
      (el) => el.textContent,
    );
    expect(featuredNames).toEqual(['Misty', 'Pikafish']);
    expect(
      root.querySelector<HTMLAnchorElement>('.bot-row-featured .bot-row-name')?.href,
    ).toContain('/bot/misty');
    expect(root.textContent).toContain('Searches hidden positions');
    // Misty's primary rating + games sit right-aligned on the row.
    expect(root.querySelector('.bot-row-featured .bot-row-rating')?.textContent).toBe('1,812');
    expect(root.querySelector('.bot-row-featured .bot-row-games')?.textContent).toBe('12 games');

    const ladderRows = [...root.querySelectorAll('.bot-row-ladder')];
    expect(ladderRows).toHaveLength(8);
    expect(ladderRows.map((row) => row.querySelector('.bot-row-name')?.textContent)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8].map((level) => `Fairy-Stockfish Level ${level}`),
    );

    // dark-draft960 stays hidden as a separate chip.
    expect(root.textContent).not.toContain('Draft960');
  });

  it('shows the xiangqi blitz rating per ladder row, dash and ?-suffix included', async () => {
    const payload = {
      bots: [
        ladderBot(1, {
          ratings: [
            ratingSnapshot({ gameSpecId: 'xiangqi', timeClass: 'blitz', rating: 1450, games: 30 }),
          ],
        }),
        ladderBot(2, {
          ratings: [
            ratingSnapshot({
              gameSpecId: 'xiangqi',
              timeClass: 'blitz',
              rating: 1710,
              games: 4,
              provisional: true,
            }),
          ],
        }),
        ladderBot(3),
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(payload));
    const root = document.createElement('div');
    const { mountBots } = await import('./bots.js');

    await mountBots(root);

    const ratings = [...root.querySelectorAll('.bot-row-ladder .bot-row-ladder-rating')].map(
      (el) => el.textContent,
    );
    expect(ratings).toEqual(['1,450', '1,710?', '—']);
  });

  it('starts a game directly when a playable chip is clicked', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        if (String(input) === '/api/bots') return jsonResponse({ bots: [misty()] });
        if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/bot_fog' });
        return jsonResponse({}, { status: 404 });
      });
    const root = document.createElement('div');
    const { mountBots } = await import('./bots.js');

    await mountBots(root);
    const fogChip = [...root.querySelectorAll<HTMLButtonElement>('button.bot-play-chip')].find(
      (chip) => chip.textContent?.includes('Fog Chess'),
    );
    expect(fogChip).toBeDefined();
    fogChip?.click();
    // The chip itself shows the starting state while the room is created.
    expect(fogChip?.textContent).toContain('Starting...');
    expect(fogChip?.disabled).toBe(true);
    await flushPromises();

    const roomCall = fetchMock.mock.calls.find(([input]) => String(input) === '/api/rooms');
    expect(roomCall).toBeDefined();
    const roomInit = roomCall?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(roomInit?.body))).toEqual({
      mode: 'pve',
      botId: 'misty',
      gameSpecId: 'dark-chess',
      preferredColor: 'random',
      rated: false,
    });
    expect(window.location.pathname).toBe('/room/bot_fog');
  });

  it('renders playable=false chips muted and inert (no fetch on click)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ bots: [ladderBot(4)] }));
    const root = document.createElement('div');
    const { mountBots } = await import('./bots.js');

    await mountBots(root);
    const offChip = root.querySelector<HTMLElement>('.bot-play-chip-off');
    expect(offChip?.textContent).toContain('Fortress Xiangqi');
    expect(offChip?.tagName).not.toBe('BUTTON');
    offChip?.click();
    await flushPromises();

    // Only the roster fetch; the muted chip never creates a room.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/bots');
  });

  it('renders the bot profile on the shared profile shell with a play row per option', async () => {
    const profile = misty({
      games: [
        {
          roomId: 'room_recent',
          variant: 'dark-chess',
          mode: 'pve',
          rated: false,
          result: 'white-wins',
          termination: 'checkmate',
          plyCount: 44,
          whiteName: 'Misty',
          blackName: 'challenger',
          corpusId: null,
          endedAt: '2026-07-01T00:00:00.000Z',
          playerColor: 'white',
        },
      ],
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ bot: profile }));
    const root = document.createElement('div');
    const { mountBotProfile } = await import('./bots.js');

    await mountBotProfile(root, 'misty');

    // Shared profile shell vocabulary (buildProfileHeaderShell + profile body).
    expect(
      root.querySelector('.profile-shell .profile-header .site-section-heading')?.textContent,
    ).toBe('Misty');
    expect(root.querySelector('.profile-role-bot')?.textContent).toBe('BOT');
    expect(root.querySelector('.profile-role-owner')?.textContent).toBe('First-party');
    expect(root.querySelector('.profile-body')).not.toBeNull();
    // Header stats: primary rating, record, games, variants. No raw engine id.
    const statValues = [...root.querySelectorAll('.profile-stat-value')].map(
      (el) => el.textContent,
    );
    expect(statValues).toEqual(['1,812', '8-3-1', '12', '2']);
    expect(root.querySelector('.profile-stats')?.textContent).not.toContain('python-v2-v1.5');

    // One play row per visible playOption (dark-draft960 stays hidden).
    const playRows = [...root.querySelectorAll('.bot-play-row')];
    expect(playRows).toHaveLength(2);
    expect(playRows.map((row) => row.querySelector('.bot-play-row-name')?.textContent)).toEqual([
      'Fog Chess',
      'Flip Xiangqi',
    ]);
    expect(playRows[0]?.querySelector('.bot-play-row-button')?.textContent).toBe('Play');

    // Sidebar ratings reuse the profile rail rows; provenance lives in About.
    const ratingRows = [...root.querySelectorAll('.profile-rating-row')];
    expect(ratingRows).toHaveLength(2);
    expect(ratingRows[0]?.textContent).toContain('1,812');
    expect(ratingRows[0]?.textContent).toContain('48 rated games');
    expect(root.querySelector('.bot-profile-about')?.textContent).toContain('python-v2-v1.5');

    // Recent games ride the shared profile game rows.
    expect(root.querySelectorAll('.profile-game-list .profile-game-row')).toHaveLength(1);
  });

  it('marks unplayable variants on the profile and posts the row variant on Play', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        if (String(input) === '/api/bots/fairy-stockfish-level-4') {
          return jsonResponse({ bot: ladderBot(4) });
        }
        if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/bot_xq' });
        return jsonResponse({}, { status: 404 });
      });
    const root = document.createElement('div');
    const { mountBotProfile } = await import('./bots.js');

    await mountBotProfile(root, 'fairy-stockfish-level-4');

    const offRow = root.querySelector('.bot-play-row-off');
    expect(offRow?.textContent).toContain('Fortress Xiangqi');
    expect(offRow?.textContent).toContain('Not available right now');
    expect(offRow?.querySelector('.bot-play-row-button')).toBeNull();

    root.querySelector<HTMLButtonElement>('.bot-play-row .bot-play-row-button')?.click();
    await flushPromises();

    const roomCall = fetchMock.mock.calls.find(([input]) => String(input) === '/api/rooms');
    expect(roomCall).toBeDefined();
    const roomInit = roomCall?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(roomInit?.body))).toEqual({
      mode: 'pve',
      botId: 'fairy-stockfish-level-4',
      gameSpecId: 'xiangqi',
      preferredColor: 'random',
      rated: false,
    });
    expect(window.location.pathname).toBe('/room/bot_xq');
  });
});
