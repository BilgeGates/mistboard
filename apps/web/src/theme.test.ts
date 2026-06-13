import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initializeThemeSettings,
  readStoredSiteTheme,
  setSiteThemePreference,
  siteThemeOptions,
} from './theme.js';

describe('site appearance preference', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
    document.documentElement.removeAttribute('data-site-theme');
    document.documentElement.removeAttribute('data-effective-theme');
    document.documentElement.removeAttribute('style');
    document.head.innerHTML = '<meta name="theme-color" content="#1f2521">';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to system mode', () => {
    expect(readStoredSiteTheme()).toBe('system');
    expect(siteThemeOptions.map((option) => option.id)).toEqual(['system', 'light', 'dark']);
  });

  it('stores explicit dark mode and applies it to the root', () => {
    setSiteThemePreference('dark');

    expect(window.localStorage.getItem('mistboard.siteTheme')).toBe('dark');
    expect(document.documentElement.dataset.siteTheme).toBe('dark');
    expect(document.documentElement.dataset.effectiveTheme).toBe('dark');
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(
      '#121615',
    );
  });

  it('normalizes invalid stored values back to system', () => {
    window.localStorage.setItem('mistboard.siteTheme', 'sepia');

    expect(readStoredSiteTheme()).toBe('system');
  });

  it('resolves system mode from prefers-color-scheme', () => {
    stubPrefersDark(true);

    setSiteThemePreference('system');

    expect(document.documentElement.dataset.siteTheme).toBe('system');
    expect(document.documentElement.dataset.effectiveTheme).toBe('dark');
  });
});

function stubPrefersDark(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) satisfies MediaQueryList,
  );
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('appearance family gating', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() });
    document.body.innerHTML = '<nav class="site-nav"><div class="site-nav-utilities"></div></nav>';
    document.documentElement.removeAttribute('data-board-family');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('keeps Settings chess-only when no xiangqi variant is enabled', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'false');

    rebuildThemePanel();

    expect(document.querySelector('select[data-board-family-select]')).toBeNull();
    expect(document.querySelector('[data-theme-tile="xqboard"]')).toBeNull();
    expect(document.querySelector('[data-theme-tile="xqpiece"]')).toBeNull();
    // Chess pickers + the shared fog picker stay.
    expect(document.querySelector('[data-theme-tile="piece"]')).not.toBeNull();
    expect(document.querySelector('[data-theme-tile="fog"]')).not.toBeNull();
  });

  it('surfaces xiangqi pickers for Crossroads without adding a Crossroads family', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'false');

    rebuildThemePanel();

    const familySelect = document.querySelector<HTMLSelectElement>(
      'select[data-board-family-select]',
    );
    expect([...familySelect!.options].map((option) => option.value)).toEqual(['chess', 'xiangqi']);

    expect(document.querySelector('[data-theme-tile="piece"]')).not.toBeNull();
    expect(document.querySelector('[data-theme-tile="xqboard"]')).not.toBeNull();
    expect(document.querySelector('[data-theme-tile="xqpiece"]')).not.toBeNull();
  });

  it('surfaces the Game dropdown + xiangqi pickers when a xiangqi flag is on', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');

    rebuildThemePanel();

    expect(document.querySelector('select[data-board-family-select]')).not.toBeNull();
    expect(document.querySelector('[data-theme-tile="xqboard"]')).not.toBeNull();
    expect(document.querySelector('[data-theme-tile="xqpiece"]')).not.toBeNull();
  });
});

// Drop any panel the persistent nav observer mounted before the flag stub, then
// rebuild from scratch so the panel reflects the env stubbed in this test.
function rebuildThemePanel(): void {
  for (const control of document.querySelectorAll('[data-theme-control]')) control.remove();
  initializeThemeSettings();
}
