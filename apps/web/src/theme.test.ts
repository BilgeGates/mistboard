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
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  it('puts signed-out language choices inside the gear menu', () => {
    window.history.replaceState(null, '', '/zh-hant/rules/banqi');

    rebuildThemePanel();

    expect(document.querySelector('.site-nav-language')).toBeNull();
    expect(
      document.querySelector<HTMLElement>(
        '[data-theme-control] [data-appearance-target="language"]',
      )?.textContent,
    ).toBe('語言');
    expect(
      [...document.querySelectorAll<HTMLElement>('.appearance-language-option')].map(
        (option) => option.textContent,
      ),
    ).toEqual(['English', '简体中文', '繁體中文', '日本語']);
    expect(
      document
        .querySelector<HTMLElement>('.appearance-language-option.selected')
        ?.getAttribute('data-locale'),
    ).toBe('zh-Hant');
  });

  it('surfaces xiangqi and shogi settings by default', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_SHOGI_ENABLED', 'false');

    rebuildThemePanel();

    const familyGroup = document.querySelector<HTMLElement>('[data-board-family-select]');
    expect(
      [...familyGroup!.querySelectorAll<HTMLButtonElement>('[data-board-family-option]')].map(
        (option) => option.dataset.boardFamilyOption,
      ),
    ).toEqual(['chess', 'xiangqi', 'shogi']);
    expect(document.querySelector('[data-theme-tile="piece"]')).not.toBeNull();
    expect(document.querySelector('[data-theme-tile="fog"]')).not.toBeNull();
    expect(document.querySelector('[data-theme-tile="xqboard"]')).not.toBeNull();
    expect(document.querySelector('[data-theme-tile="xqpiece"]')).not.toBeNull();
  });

  it('keeps Crossroads inside the xiangqi appearance family', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'false');

    rebuildThemePanel();

    const familyGroup = document.querySelector<HTMLElement>('[data-board-family-select]');
    expect(
      [...familyGroup!.querySelectorAll<HTMLButtonElement>('[data-board-family-option]')].map(
        (option) => option.dataset.boardFamilyOption,
      ),
    ).toEqual(['chess', 'xiangqi', 'shogi']);

    expect(document.querySelector('[data-theme-tile="piece"]')).not.toBeNull();
    expect(document.querySelector('[data-theme-tile="xqboard"]')).not.toBeNull();
    expect(document.querySelector('[data-theme-tile="xqpiece"]')).not.toBeNull();
  });

  it('surfaces the Game toggle + xiangqi pickers without xiangqi env flags', () => {
    rebuildThemePanel();

    expect(document.querySelector('[data-board-family-select]')).not.toBeNull();
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
