import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLandingPlayPanel } from './landing-play.js';

describe('landing play panel', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps Dark Xiangqi hidden unless the client flag is enabled', () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ playing: 0, online: 0 })));
    const panel = buildLandingPlayPanel([]);

    expect(panel.textContent).not.toContain('Dark Xiangqi');
  });

  it('creates a Dark Xiangqi room from the flagged homepage action', async () => {
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dxq_home' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    const button = [...panel.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Dark Xiangqi',
    );

    expect(button).toBeDefined();
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    const roomCall = fetchSpy.mock.calls.find(([input]) => String(input) === '/api/rooms');
    expect(roomCall).toBeDefined();
    expect(JSON.parse(String(roomCall?.[1]?.body))).toEqual({
      mode: 'pvp',
      gameSpecId: 'dark-xiangqi',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    });
    expect(window.location.pathname).toBe('/room/dxq_home');
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
