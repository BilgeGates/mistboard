import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLandingPlayPanel, maybeOpenPlayDeepLink } from './landing-play.js';

describe('landing play panel', () => {
  afterEach(() => {
    document.body.replaceChildren();
    window.history.replaceState(null, '', '/');
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

  it('shows the Misty brand placeholder, not a built-in engine name, before the roster loads', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    // Empty roster → the panel falls back to the loading placeholder. It must read
    // as the real product, never the old "Random Legal v1" built-in name.
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    const engineButton = [...panel.querySelectorAll('button')].find((candidate) =>
      candidate.textContent?.includes('Play the engine'),
    );

    engineButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const overlay = document.querySelector('.landing-setup-overlay');

    expect(overlay?.textContent).toContain('Misty');
    expect(overlay?.textContent).not.toContain('Random Legal');
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
      hiddenDraft960: false,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      rated: false,
      preferredColor: 'random',
    });
    expect(window.location.pathname).toBe('/room/dark_home');
  });

  it('creates a timed Dark Mini Xiangqi room from the flagged challenge variant', async () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dmxq_home' });
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
    expect([...variantSelect!.options].map((option) => option.value)).toContain(
      'dark-mini-xiangqi',
    );
    variantSelect!.value = 'dark-mini-xiangqi';
    variantSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.body.textContent).toContain('Red');
    // Mini is timed: the time-control section is shown like the other variants.
    const timeSection = document
      .querySelector('.landing-time-presets')
      ?.closest('.landing-setup-section') as HTMLElement | null;
    expect(timeSection?.hidden).toBe(false);
    const createButton = [...document.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Create room',
    );
    createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    const roomCall = fetchSpy.mock.calls.find(([input]) => String(input) === '/api/rooms');
    expect(roomCall).toBeDefined();
    expect(JSON.parse(String(roomCall?.[1]?.body))).toEqual({
      mode: 'pvp',
      gameSpecId: 'dark-mini-xiangqi',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      preferredColor: 'random',
    });
    expect(window.location.pathname).toBe('/room/dmxq_home');
  });

  it('keeps Dark Mini Xiangqi hidden from public entry unless its public-entry flag is enabled', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    [...panel.querySelectorAll('button')]
      .find((candidate) => candidate.textContent === 'Challenge a friend')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const variantSelect = document.querySelector<HTMLSelectElement>('.landing-variant-select');
    const options = variantSelect ? [...variantSelect.options].map((option) => option.value) : [];
    expect(options).not.toContain('dark-mini-xiangqi');
  });

  it('uses gameSpecId, not variant, to deep-link the challenge variant projection', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    window.history.replaceState(null, '', '/?play=friend&gameSpecId=dark-mini-xiangqi');

    maybeOpenPlayDeepLink([]);

    const variantSelect = document.querySelector<HTMLSelectElement>('.landing-variant-select');
    expect(variantSelect?.value).toBe('dark-mini-xiangqi');
    expect(window.location.search).toBe('');
  });

  it('allows a soft-launch Dark Mini Xiangqi deep link without public picker entry', async () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dmxq_soft' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    window.history.replaceState(null, '', '/?play=friend&gameSpecId=dark-mini-xiangqi');

    maybeOpenPlayDeepLink([]);
    expect(document.querySelector('.landing-variant-select')).toBeNull();
    expect(document.querySelector('.landing-variant-control')?.textContent).toBe(
      'Dark Mini Xiangqi',
    );
    document
      .querySelector<HTMLButtonElement>('.landing-setup-start')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    const roomCall = fetchSpy.mock.calls.find(([input]) => String(input) === '/api/rooms');
    expect(JSON.parse(String(roomCall?.[1]?.body))).toEqual({
      mode: 'pvp',
      gameSpecId: 'dark-mini-xiangqi',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      preferredColor: 'random',
    });
  });

  it('does not offer Dark Xiangqi (9x10) in the play menu — it has no runtime', () => {
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    [...panel.querySelectorAll('button')]
      .find((b) => b.textContent === 'Challenge a friend')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const variantSelect = document.querySelector<HTMLSelectElement>('.landing-variant-select');
    // With only Dark Xiangqi's flag on (no DMX), there's no second variant, so no picker.
    const options = variantSelect ? [...variantSelect.options].map((o) => o.value) : [];
    expect(options).not.toContain('dark-xiangqi');
  });

  it('sends the chess game spec id when finding a chess opponent', async () => {
    const fetchSpy = lobbyFetchSpy();
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    openLobbySetup(panel);
    document
      .querySelector<HTMLButtonElement>('.landing-setup-start')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(lobbyPostBody(fetchSpy).gameSpecId).toBe('dark-chess');
  });

  it('sends the Dark Mini Xiangqi game spec id when finding a DMX opponent', async () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');
    const fetchSpy = lobbyFetchSpy();
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    openLobbySetup(panel);
    const variantSelect = document.querySelector<HTMLSelectElement>('.landing-variant-select');
    variantSelect!.value = 'dark-mini-xiangqi';
    variantSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    document
      .querySelector<HTMLButtonElement>('.landing-setup-start')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(lobbyPostBody(fetchSpy).gameSpecId).toBe('dark-mini-xiangqi');
  });
});

// Resolve the lobby "Find opponent" → setup screen. The first matching button is
// the landing action; clicking it opens the setup whose start button is
// `.landing-setup-start`.
function openLobbySetup(panel: HTMLElement): void {
  [...panel.querySelectorAll('button')]
    .find((button) => button.textContent === 'Find opponent')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function lobbyFetchSpy(): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
    if (String(input) === '/api/lobby' && init?.method === 'POST') {
      return jsonResponse({ status: 'matched', roomId: 'dmxq_lobby', url: '/room/dmxq_lobby' });
    }
    if (String(input) === '/api/lobby') return jsonResponse({ requests: [] });
    return jsonResponse({}, { status: 404 });
  });
}

function lobbyPostBody(fetchSpy: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchSpy.mock.calls.find(
    ([input, init]) =>
      String(input) === '/api/lobby' && (init as RequestInit | undefined)?.method === 'POST',
  );
  expect(call).toBeDefined();
  return JSON.parse(String((call?.[1] as RequestInit).body)) as Record<string, unknown>;
}

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
