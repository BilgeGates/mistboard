import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLandingActivity } from './landing-activity.js';

describe('landing activity', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it('promotes durable game totals to linked primary rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
        if (url === '/api/stats/public') {
          return jsonResponse({ totalCompletedGames: 575, last30dCompletedGames: 261 });
        }
        return jsonResponse({}, { status: 404 });
      }),
    );

    const activity = buildLandingActivity();
    document.body.append(activity);

    await vi.waitFor(() => {
      expect(activity.querySelector('.landing-activity-value')?.textContent).toBe('575');
    });

    const links = [...activity.querySelectorAll<HTMLAnchorElement>('.landing-activity-link')];
    expect(links.map((link) => link.textContent)).toEqual([
      '575games played',
      '261games this month',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/watch',
      '/about#platform-activity',
    ]);
    expect(activity.querySelector('.landing-activity-live')?.textContent).toBe(
      '0 games in play0 players online',
    );
  });

  it('keeps live-only zeros in the secondary line when durable totals are unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
        if (url === '/api/stats/public') return jsonResponse({}, { status: 503 });
        return jsonResponse({}, { status: 404 });
      }),
    );

    const activity = buildLandingActivity();
    document.body.append(activity);

    await vi.waitFor(() => {
      expect(activity.querySelector('.landing-activity-live')?.textContent).toBe(
        '0 games in play0 players online',
      );
    });

    expect(activity.querySelector('.landing-activity-primary')).toBeNull();
    expect(activity.querySelector('.landing-activity-value')).toBeNull();
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}
