import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLandingPlayPanel, maybeOpenPlayDeepLink, setRoomNavigator } from './landing-play.js';
import { setRatedModeEnabled } from './rated-flag.js';

describe('landing play panel', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
    setRatedModeEnabled(false);
    setRoomNavigator(null);
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

  it('remembers start setup separately for engine, friend, and lobby entry points', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/sticky' });
      if (String(input) === '/api/lobby' && init?.method === 'POST') {
        return jsonResponse({ status: 'waiting', ticketId: 'sticky-ticket', pollAfterMs: 60_000 });
      }
      return jsonResponse({ requests: [] });
    });
    vi.stubGlobal('fetch', fetchSpy);
    setRoomNavigator(() => {});
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Play the engine');
    clickModalButton('1 + 1');
    clickModalColor('Black');
    clickModalButton('Start game');
    await flushPromises();
    document.querySelector('.landing-setup-overlay')?.remove();

    openPlaySetup(panel, 'Challenge a friend');
    expect(selectedModalTimeControl()).toBe('3 + 2');
    expect(selectedModalColor()).toBe('Random');
    clickModalColor('White');
    clickModalButton('Create room');
    await flushPromises();
    document.querySelector('.landing-setup-overlay')?.remove();

    openPlaySetup(panel, 'Find opponent');
    expect(selectedModalTimeControl()).toBe('3 + 2');
    expect(document.querySelector('.landing-color-label')).toBeNull();
    clickModalButton('1 + 1');
    clickModalButton('Find opponent');
    await flushPromises();
    document.querySelector('.landing-setup-overlay')?.remove();

    openPlaySetup(panel, 'Play the engine');
    expect(selectedModalTimeControl()).toBe('1 + 1');
    expect(selectedModalColor()).toBe('Black');
    document.querySelector('.landing-setup-overlay')?.remove();

    openPlaySetup(panel, 'Challenge a friend');
    expect(selectedModalTimeControl()).toBe('3 + 2');
    expect(selectedModalColor()).toBe('White');
    document.querySelector('.landing-setup-overlay')?.remove();

    openPlaySetup(panel, 'Find opponent');
    expect(selectedModalTimeControl()).toBe('1 + 1');
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
    clickModalButton('1 + 1');
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
      timeControl: { initialMs: 60_000, incrementMs: 1_000 },
      rated: false,
      preferredColor: 'random',
    });
    expect(window.location.pathname).toBe('/room/dmxq_home');
  });

  it('creates a timed Crossroads Chess room from the flagged challenge variant', async () => {
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dchess_home' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Challenge a friend');
    const variantSelect = document.querySelector<HTMLSelectElement>('.landing-variant-select');
    expect(variantSelect).not.toBeNull();
    expect([...variantSelect!.options].map((option) => option.value)).toContain('crossroads-chess');
    selectModalVariant('crossroads-chess');
    expect(modalColorOptions()).toEqual([
      { label: 'White', glyph: '♔', classes: 'landing-color-glyph white' },
      { label: 'Random', glyph: '♔♚', classes: 'landing-color-glyph random' },
      { label: 'Black', glyph: '♚', classes: 'landing-color-glyph black' },
    ]);
    expect(document.body.textContent).toContain('Black');
    expect(document.body.textContent).not.toContain('Red');
    expect(visibleModalTimeControls()).toEqual(['1 + 1', '3 + 2', '5 + 5']);
    clickModalButton('5 + 5');
    clickModalColor('Black');
    clickModalButton('Create room');
    await flushPromises();

    expect(roomPostBody(fetchSpy)).toEqual({
      mode: 'pvp',
      gameSpecId: 'crossroads-chess',
      timeControl: { initialMs: 300_000, incrementMs: 5_000 },
      rated: false,
      preferredColor: 'black',
    });
    expect(window.location.pathname).toBe('/room/dchess_home');
  });

  it('shows a specific error when Crossroads room creation is disabled server-side', async () => {
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') {
        return jsonResponse({ error: 'crossroads_chess_disabled' }, { status: 404 });
      }
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Challenge a friend');
    selectModalVariant('crossroads-chess');
    clickModalButton('Create room');
    await flushPromises();

    expect(document.querySelector('.landing-setup-status')?.textContent).toBe(
      'Crossroads Chess live rooms are not enabled on this server.',
    );
  });

  it('keeps Crossroads Chess inside the friend-room variant picker, not as a hub link', () => {
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );

    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    expect(panel.querySelector<HTMLAnchorElement>('.landing-play-action-crossroads')).toBeNull();

    openPlaySetup(panel, 'Challenge a friend');
    const variantSelect = document.querySelector<HTMLSelectElement>('.landing-variant-select');
    expect([...variantSelect!.options].map((option) => option.value)).toContain('crossroads-chess');
  });

  it('keeps 5+5 hidden for fog variants in the setup modal', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Challenge a friend');
    expect(visibleModalTimeControls()).toEqual(['1 + 1', '3 + 2']);

    selectModalVariant('dark-mini-xiangqi');
    expect(visibleModalTimeControls()).toEqual(['1 + 1', '3 + 2']);
  });

  it('keeps Crossroads Chess out of engine and lobby entry points for now', () => {
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Play the engine');
    let variantSelect = document.querySelector<HTMLSelectElement>('.landing-variant-select');
    let options = variantSelect ? [...variantSelect.options].map((option) => option.value) : [];
    expect(options).not.toContain('crossroads-chess');
    document.querySelector('.landing-setup-overlay')?.remove();

    openPlaySetup(panel, 'Find opponent');
    variantSelect = document.querySelector<HTMLSelectElement>('.landing-variant-select');
    options = variantSelect ? [...variantSelect.options].map((option) => option.value) : [];
    expect(options).not.toContain('crossroads-chess');
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

  it('uses gameSpecId to deep-link Dark Mini Xiangqi engine play', async () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dmxq_engine' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    setRoomNavigator(() => {});
    window.history.replaceState(null, '', '/?play=computer&gameSpecId=dark-mini-xiangqi');

    maybeOpenPlayDeepLink([
      { id: 'python-v2-v1.0', name: 'Misty', familyName: 'Misty', kind: 'fog-chess' },
    ]);
    expect(document.querySelector<HTMLSelectElement>('.landing-variant-select')?.value).toBe(
      'dark-mini-xiangqi',
    );
    document
      .querySelector<HTMLButtonElement>('.landing-setup-start')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(roomPostBody(fetchSpy)).toMatchObject({
      mode: 'pve',
      gameSpecId: 'dark-mini-xiangqi',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      preferredColor: 'random',
    });
    expect(window.location.search).toBe('');
  });

  it('sends selected Dark Mini Xiangqi engine colors from the setup modal', async () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dmxq_color' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    setRoomNavigator(() => {});
    const panel = buildLandingPlayPanel([
      { id: 'python-v2-v1.0', name: 'Misty', familyName: 'Misty', kind: 'fog-chess' },
    ]);
    document.body.append(panel);

    openPlaySetup(panel, 'Play the engine');
    selectModalVariant('dark-mini-xiangqi');
    clickModalColor('Black');
    clickModalButton('Start game');
    await flushPromises();
    expect(roomPostBody(fetchSpy)).toMatchObject({
      mode: 'pve',
      gameSpecId: 'dark-mini-xiangqi',
      preferredColor: 'black',
    });

    document.querySelector('.landing-setup-overlay')?.remove();
    fetchSpy.mockClear();

    openPlaySetup(panel, 'Play the engine');
    selectModalVariant('dark-mini-xiangqi');
    clickModalColor('Random');
    clickModalButton('Start game');
    await flushPromises();
    expect(roomPostBody(fetchSpy)).toMatchObject({
      mode: 'pve',
      gameSpecId: 'dark-mini-xiangqi',
      preferredColor: 'random',
    });
  });

  it('keeps the old engine deep-link alias working', () => {
    window.history.replaceState(null, '', '/?play=engine');

    maybeOpenPlayDeepLink([]);

    expect(document.querySelector('.landing-setup-dialog')?.textContent).toContain(
      'Play the engine',
    );
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
      rated: false,
      preferredColor: 'random',
    });
  });

  it('allows a rated soft-launch Dark Mini Xiangqi lobby deep link without public picker entry', async () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    setRatedModeEnabled(true);
    const fetchSpy = lobbyFetchSpy();
    vi.stubGlobal('fetch', fetchSpy);
    window.history.replaceState(null, '', '/?play=lobby&gameSpecId=dark-mini-xiangqi');

    maybeOpenPlayDeepLink([]);
    expect(document.querySelector('.landing-variant-select')).toBeNull();
    expect(document.querySelector('.landing-variant-control')?.textContent).toBe(
      'Dark Mini Xiangqi',
    );
    document
      .querySelector<HTMLButtonElement>('.landing-setup-start')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(lobbyPostBody(fetchSpy)).toMatchObject({
      gameSpecId: 'dark-mini-xiangqi',
      rated: true,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
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

function openPlaySetup(panel: HTMLElement, label: string): void {
  [...panel.querySelectorAll('button')]
    .find((button) => button.textContent === label)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function clickModalButton(label: string): void {
  [...document.querySelectorAll<HTMLButtonElement>('.landing-setup-dialog button')]
    .find((button) => button.textContent === label)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function clickModalColor(label: string): void {
  [...document.querySelectorAll<HTMLButtonElement>('.landing-color-option')]
    .find((button) => button.querySelector('.landing-color-label')?.textContent === label)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function selectModalVariant(gameSpecId: string): void {
  const variantSelect = document.querySelector<HTMLSelectElement>('.landing-variant-select');
  expect(variantSelect).not.toBeNull();
  variantSelect!.value = gameSpecId;
  variantSelect!.dispatchEvent(new Event('change', { bubbles: true }));
}

function selectedModalTimeControl(): string | undefined {
  return [
    ...document.querySelectorAll<HTMLButtonElement>('.landing-time-presets .selected'),
  ][0]?.textContent?.trim();
}

function visibleModalTimeControls(): string[] {
  return [...document.querySelectorAll<HTMLButtonElement>('.landing-time-presets button')]
    .filter((button) => !button.hidden)
    .map((button) => button.textContent?.trim() ?? '');
}

function selectedModalColor(): string | undefined {
  return document
    .querySelector<HTMLButtonElement>('.landing-color-option.selected .landing-color-label')
    ?.textContent?.trim();
}

function modalColorOptions(): Array<{ label: string; glyph: string; classes: string }> {
  return [...document.querySelectorAll<HTMLButtonElement>('.landing-color-option')].map(
    (button) => ({
      label: button.querySelector('.landing-color-label')?.textContent?.trim() ?? '',
      glyph: button.querySelector('.landing-color-glyph')?.textContent?.trim() ?? '',
      classes: button.querySelector('.landing-color-glyph')?.className ?? '',
    }),
  );
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

function roomPostBody(fetchSpy: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchSpy.mock.calls.find(
    ([input, init]) =>
      String(input) === '/api/rooms' && (init as RequestInit | undefined)?.method === 'POST',
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

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
