import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLobbyPanel } from './landing-play.js';

// The Lobby tab carries a compact table of rotating bot "seeks" (always-available
// computer opponents) so the hooks surface is never empty at zero human
// liquidity. These are client-derived launchers, not server seeks: the pool is
// deterministic per UTC day, one click creates the PvE room directly, and the
// invariants worth pinning are honesty (labeled engine), separation from the
// human seek table, and the day-stable rotation.

// 2026-07-21 → UTC day-of-year 202: anchor Fairy-Stockfish level = 2 + 202 % 6 = 6.
const FIXED_DATE = new Date('2026-07-21T12:00:00Z');

describe('landing lobby bot seeks', () => {
  beforeEach(() => {
    // Freeze only Date so the day rotation is fixed; timers stay real for the
    // async fetch flushes below.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_DATE);
  });

  afterEach(() => {
    document.body.replaceChildren();
    window.history.replaceState(null, '', '/');
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders at most six rows led by the three daily anchors', () => {
    const panel = buildLobbyPanel('en', { hydrate: false });
    const seeds = [...panel.querySelectorAll<HTMLElement>('.landing-lobby-seed')];
    expect(seeds.length).toBeGreaterThan(0);
    expect(seeds.length).toBeLessThanOrEqual(6);

    const signature = seeds.map((seed) => `${seed.dataset.botId}|${seed.dataset.gameSpec}`);
    // Anchors, in order: Misty fog chess, Pikafish xiangqi, and the daily
    // Fairy-Stockfish ladder rung (level 6 on the frozen date).
    expect(signature.slice(0, 3)).toEqual([
      'misty|dark-chess',
      'pikafish|xiangqi',
      'fairy-stockfish-level-6|xiangqi',
    ]);
    // Dark chess is unconditionally enabled, so its variant label is a stable
    // anchor regardless of which variant flags the test env sets.
    const labels = seeds.map(
      (seed) => seed.querySelector('.landing-lobby-seed-variant')?.textContent,
    );
    expect(labels).toContain('Fog Chess');
  });

  it('labels each seed as an engine game rather than a human seek', () => {
    const panel = buildLobbyPanel('en', { hydrate: false });
    const seeds = [...panel.querySelectorAll<HTMLElement>('.landing-lobby-seed')];
    expect(seeds.length).toBeGreaterThan(0);
    for (const seed of seeds) {
      expect(seed.getAttribute('aria-label')?.startsWith('Play the engine')).toBe(true);
      const opponent = seed.querySelector('.landing-lobby-seed-opponent');
      // A bot icon plus a non-empty engine name is the honesty signal.
      expect(opponent?.querySelector('.landing-lobby-seed-boticon')).not.toBeNull();
      expect((opponent?.textContent ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps bot seeks out of the human seek table, under their own divider', () => {
    const panel = buildLobbyPanel('en', { hydrate: false });
    const seedsBlock = panel.querySelector('.landing-lobby-seeds');
    expect(seedsBlock).not.toBeNull();
    expect(panel.querySelector('.landing-lobby-thead')).not.toBeNull();
    // Seeds are their own row grammar; they must not masquerade as
    // .landing-lobby-trow human seek rows (which carry the Join action).
    expect(seedsBlock?.querySelector('.landing-lobby-trow')).toBeNull();
    expect(seedsBlock?.querySelector('.landing-lobby-seeds-divider')?.textContent).toBe('Bots');
  });

  it('creates and joins the bot game on a single row click', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/bot_seek' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLobbyPanel('en', { hydrate: false });
    document.body.append(panel);

    const row = panel.querySelector<HTMLButtonElement>(
      '.landing-lobby-seed[data-bot-id="misty"][data-game-spec="dark-chess"]',
    );
    expect(row).not.toBeNull();
    row!.click();
    await flushPromises();

    const call = fetchSpy.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/rooms' && (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(call).toBeDefined();
    expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({
      mode: 'pve',
      botId: 'misty',
      gameSpecId: 'dark-chess',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      preferredColor: 'random',
      rated: false,
    });
    expect(window.location.pathname).toBe('/room/bot_seek');
  });

  it('fills rating cells from the /api/bots roster', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/bots') {
        return jsonResponse({
          bots: [
            {
              id: 'misty',
              displayName: 'Misty',
              ratings: [
                {
                  gameSpecId: 'dark-chess',
                  timeClass: 'blitz',
                  rating: 1874.4,
                  provisional: false,
                },
              ],
            },
            {
              id: 'pikafish',
              displayName: 'Pikafish',
              // No blitz entry for the 3+2 xiangqi seed: falls back to the
              // variant's only rating, keeping the provisional '?' suffix.
              ratings: [
                { gameSpecId: 'xiangqi', timeClass: 'rapid', rating: 2450, provisional: true },
              ],
            },
          ],
        });
      }
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLobbyPanel('en');
    document.body.append(panel);
    await flushPromises();

    const misty = panel.querySelector(
      '.landing-lobby-seed[data-bot-id="misty"][data-game-spec="dark-chess"] .landing-lobby-seed-rating',
    );
    expect(misty?.textContent).toBe('1874');
    const pikafish = panel.querySelector(
      '.landing-lobby-seed[data-bot-id="pikafish"][data-game-spec="xiangqi"] .landing-lobby-seed-rating',
    );
    expect(pikafish?.textContent).toBe('2450?');
    // Unmatched bots keep the placeholder rather than guessing a number.
    const ladder = panel.querySelector(
      '.landing-lobby-seed[data-bot-id="fairy-stockfish-level-6"] .landing-lobby-seed-rating',
    );
    expect(ladder?.textContent).toBe('—');
  });

  it('renders the same seed list for two builds on the same day', () => {
    const signature = (panel: HTMLElement): string[] =>
      [...panel.querySelectorAll<HTMLElement>('.landing-lobby-seed')].map(
        (seed) => `${seed.dataset.botId}|${seed.dataset.gameSpec}|${seed.dataset.timeClass}`,
      );
    const first = signature(buildLobbyPanel('en', { hydrate: false }));
    const second = signature(buildLobbyPanel('en', { hydrate: false }));
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });
});

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
