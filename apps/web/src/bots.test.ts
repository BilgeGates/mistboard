import { afterEach, describe, expect, it, vi } from 'vitest';

function bot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'misty-dark-chess',
    displayName: 'Misty',
    bio: 'Searches hidden positions with the Mistboard engine.',
    ownerType: 'system',
    ownerUserId: null,
    activeEngineId: 'python-v2-v1.5',
    defaultGameSpecId: 'dark-chess',
    supportedGameSpecIds: ['dark-chess', 'banqi'],
    play: {
      mode: 'pve',
      gameSpecId: 'dark-chess',
      engineId: 'python-v2-v1.5',
      timeControl: {
        initialMs: 180_000,
        incrementMs: 2_000,
      },
      preferredColor: 'random',
    },
    gamesTotal: 12,
    record: {
      games: 12,
      wins: 8,
      losses: 3,
      draws: 1,
    },
    rating: {
      gameSpecId: 'dark-chess',
      timeClass: 'blitz',
      rating: 1812,
      ratingDeviation: 92,
      games: 48,
      source: 'eve-anchor',
      sourceRef: 'report-1',
      createdAt: '2026-06-01T00:00:00.000Z',
      provisional: false,
    },
    games: [],
    ...overrides,
  };
}

describe('bot pages', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('groups the bot directory by featured and community bots', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          bots: [
            bot(),
            bot({
              id: 'community-bot',
              displayName: 'Community Bot',
              ownerType: 'user',
              bio: 'A public community engine profile.',
            }),
          ],
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    );
    const root = document.createElement('div');
    const { mountBots } = await import('./bots.js');

    await mountBots(root);

    expect(
      [...root.querySelectorAll('.bot-directory-section h2')].map((el) => el.textContent),
    ).toEqual(['Featured bots', 'Community bots']);
    expect(root.textContent).toContain('Searches hidden positions');
    expect(root.querySelector('.bot-card-rating-value')?.textContent).toBe('1,812');
    expect(root.querySelector<HTMLAnchorElement>('.bot-card-title')?.href).toContain(
      '/bot/misty-dark-chess',
    );
  });

  it('renders the bot profile rating and supported variants', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ bot: bot() }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    const root = document.createElement('div');
    const { mountBotProfile } = await import('./bots.js');

    await mountBotProfile(root, 'misty-dark-chess');

    expect(root.querySelector('.profile-role-owner')?.textContent).toBe('First-party');
    expect(root.querySelector('.bot-profile-rating')?.textContent).toContain('1,812');
    expect(root.querySelector('.bot-profile-rating')?.textContent).toContain('48 rated games');
    expect(root.querySelector('.bot-profile-variants')?.textContent).toContain('Banqi');
  });
});
