import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLandingPlayPanel } from './landing-play.js';

describe('landing play panel', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps Dark Xiangqi hidden unless the client flag is enabled', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);

    expect(panel.textContent).not.toContain('Dark Xiangqi');
  });

  it('creates dark chess rooms with a canonical game spec id behind the Variant UI', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dark_home' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    const challengeButton = [...panel.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Challenge a friend',
    );

    challengeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const createButton = [...document.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Create room',
    );
    createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    const roomCall = fetchSpy.mock.calls.find(([input]) => String(input) === '/api/rooms');
    expect(roomCall).toBeDefined();
    expect(JSON.parse(String(roomCall?.[1]?.body))).toEqual({
      mode: 'pvp',
      gameSpecId: 'dark-chess',
      variant: 'dark-chess',
      hiddenDraft960: false,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      rated: false,
      preferredColor: 'random',
    });
    expect(window.location.pathname).toBe('/room/dark_home');
  });

  it('creates a Dark Xiangqi room from the flagged challenge variant', async () => {
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dxq_home' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    const challengeButton = [...panel.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Challenge a friend',
    );

    challengeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const variantSelect = document.querySelector<HTMLSelectElement>('.landing-variant-select');
    expect(variantSelect).not.toBeNull();
    variantSelect!.value = 'dark-xiangqi';
    variantSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.body.textContent).toContain('Red');
    expect(document.body.textContent).not.toContain('White');
    const glyphs = [...document.querySelectorAll('.landing-color-glyph')].map((glyph) =>
      glyph.textContent?.trim(),
    );
    expect(glyphs).toEqual(['帥', '帥將', '將']);
    const createButton = [...document.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Create room',
    );
    createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    const roomCall = fetchSpy.mock.calls.find(([input]) => String(input) === '/api/rooms');
    expect(roomCall).toBeDefined();
    expect(JSON.parse(String(roomCall?.[1]?.body))).toEqual({
      mode: 'pvp',
      gameSpecId: 'dark-xiangqi',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      preferredColor: 'random',
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
