import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TestUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  handle: string;
  handleChangedAt: string | null;
  displayName: string;
  displayNameChangedAt: string | null;
  profileVisibility: 'private' | 'unlisted' | 'public';
  accountRole: 'player' | 'admin';
  locale: 'en' | 'zh-Hans' | 'zh-Hant' | 'ja' | null;
  dmPolicy: 'never' | 'friends' | 'always';
};

describe('account page auth flow', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
    window.history.replaceState(null, '', '/account?tab=login');
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('updates the top nav after confirming a login code in-page', async () => {
    const user = testUser('misty');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/auth/me') return jsonResponse({ user: null });
        if (url === '/api/auth/email/start') {
          return jsonResponse({ loginId: 'login-1', devCode: '123456' }, 202);
        }
        if (url === '/api/auth/email/confirm') {
          return jsonResponse({ user, isNewUser: false });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const { initializeAccountNav } = await import('./account-nav.js');
    const { mountAccount } = await import('./account.js');

    initializeAccountNav();
    await mountAccount(document.querySelector<HTMLElement>('#app') as HTMLElement);
    await flushDom();

    expect(document.querySelector('.site-nav-link-signin')?.textContent).toBe('Sign in');

    const email = document.querySelector<HTMLInputElement>('input[name="email"]');
    email?.setAttribute('value', 'misty@example.com');
    if (email) email.value = 'misty@example.com';
    submitAccountForm();
    await flushDom();

    expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')?.textContent).toBe(
      'Confirm',
    );

    submitAccountForm();
    await flushDom();

    expect(document.querySelector('.account-nav-trigger')?.textContent).toBe('misty');
    expect(document.querySelector('.site-nav-link-signin')).toBeNull();
    expect(window.location.pathname).toBe('/');
    expect(document.querySelector('h1')?.textContent).toBe('Sign in');
  });

  it('shows local setup guidance when the auth API is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/auth/me') return jsonResponse({ user: null });
        if (url === '/api/auth/email/start') throw new TypeError('fetch failed');
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const { initializeAccountNav } = await import('./account-nav.js');
    const { mountAccount } = await import('./account.js');

    initializeAccountNav();
    await mountAccount(document.querySelector<HTMLElement>('#app') as HTMLElement);
    await flushDom();

    const email = document.querySelector<HTMLInputElement>('input[name="email"]');
    if (email) email.value = 'misty@example.com';
    submitAccountForm();
    await flushDom();

    expect(document.querySelector('.account-status')?.textContent).toContain(
      'Auth server unavailable',
    );
  });

  it('localizes the Traditional Chinese register flow', async () => {
    window.history.replaceState(null, '', '/zh-hant/account?tab=register');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/auth/me') return jsonResponse({ user: null });
        if (url === '/api/auth/email/start') {
          return jsonResponse({ loginId: 'login-1' }, 202);
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const { mountAccount } = await import('./account.js');

    await mountAccount(document.querySelector<HTMLElement>('#app') as HTMLElement);
    await flushDom();

    expect(document.querySelector('.account-auth-tabs')?.getAttribute('aria-label')).toBe(
      '帳號存取',
    );
    expect(document.querySelector('h1')?.textContent).toBe('建立帳號');
    expect(document.querySelector('.account-copy')?.textContent).toBe(
      '輸入信箱。我們會寄送驗證碼，不需要密碼。',
    );
    expect(document.querySelector<HTMLInputElement>('input[name="email"]')?.placeholder).toBe(
      '信箱地址',
    );
    expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')?.textContent).toBe(
      '寄送驗證碼',
    );
    expect(document.querySelector('.account-legal')?.textContent).toContain(
      '建立帳號即表示你同意我們的 條款 與 隱私。',
    );

    const email = document.querySelector<HTMLInputElement>('input[name="email"]');
    if (email) email.value = 'misty@example.com';
    submitAccountForm();
    await flushDom();

    expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')?.textContent).toBe(
      '確認',
    );
    expect(document.querySelector('.account-status')?.textContent).toBe(
      '請檢查信箱中的登入驗證碼。',
    );
  });

  it('uses the centered auth flow for signed-out settings deep links', async () => {
    window.history.replaceState(null, '', '/account/settings/privacy');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/auth/me') return jsonResponse({ user: null });
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const { mountAccountSettings } = await import('./account.js');

    await mountAccountSettings(document.querySelector<HTMLElement>('#app') as HTMLElement);
    await flushDom();

    const shell = document.querySelector<HTMLElement>('main.account-shell');
    expect(shell?.classList.contains('account-settings-shell')).toBe(false);
    expect(document.querySelector('.account-settings-rail')).toBeNull();
    expect(document.querySelector('h1')?.textContent).toBe('Sign in');
  });

  it('renders display preferences separately from the appearance menu', async () => {
    window.history.replaceState(null, '', '/account/settings/display');
    const user = testUser('misty');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/auth/me') return jsonResponse({ user });
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const { displayPreferenceStorageKey } = await import('./display-preferences.js');
    const { mountAccountSettings } = await import('./account.js');

    await mountAccountSettings(document.querySelector<HTMLElement>('#app') as HTMLElement);
    await flushDom();

    expect(document.querySelector('.account-settings-rail-link.active')?.textContent).toBe(
      'Display',
    );
    expect(document.querySelector('h1')?.textContent).toBe('Display');
    expect(document.querySelector('.account-settings-panel .appearance-menu')).toBeNull();
    expect(document.querySelector('[name="pieceAnimation"]')).not.toBeNull();
    expect(document.querySelector('[name="playerRatings"]')).toBeNull();
    expect(
      [...document.querySelectorAll('.account-settings-rail-link')].map((link) => link.textContent),
    ).toEqual(['Display', 'Privacy', 'Change username', 'Email and sign-in']);
    expect(document.querySelectorAll('.account-settings-rail-separator')).toHaveLength(1);

    const animation = document.querySelector<HTMLInputElement>(
      'input[name="pieceAnimation"][value="fast"]',
    );
    if (!animation) throw new Error('missing fast piece animation option');
    animation.checked = true;
    animation.dispatchEvent(new Event('change', { bubbles: true }));

    const stored = JSON.parse(window.localStorage.getItem(displayPreferenceStorageKey) ?? '{}') as {
      pieceAnimation?: string;
    };
    expect(stored.pieceAnimation).toBe('fast');
  });

  it('renders privacy as the supported messaging policy without profile hiding', async () => {
    window.history.replaceState(null, '', '/account/settings/privacy');
    const user = testUser('misty');
    const requests: Array<{ body: unknown; url: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/auth/me') return jsonResponse({ user });
        if (url === '/api/account/preferences') {
          requests.push({ url, body: JSON.parse(String(init?.body)) as unknown });
          return jsonResponse({ user: { ...user, dmPolicy: 'friends' } });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const { mountAccountSettings } = await import('./account.js');

    await mountAccountSettings(document.querySelector<HTMLElement>('#app') as HTMLElement);
    await flushDom();

    expect(document.querySelector('.account-settings-rail-link.active')?.textContent).toBe(
      'Privacy',
    );
    expect(document.querySelector('h1')?.textContent).toBe('Privacy');
    expect(document.querySelector('[name="profileVisibility"]')).toBeNull();

    expect(document.querySelector<HTMLInputElement>('input[value="always"]')?.checked).toBe(true);
    const friends = document.querySelector<HTMLInputElement>('input[value="friends"]');
    if (!friends) throw new Error('missing friends messaging policy option');
    friends.checked = true;
    friends.dispatchEvent(new Event('change', { bubbles: true }));
    await flushDom();

    expect(requests).toEqual([{ url: '/api/account/preferences', body: { dmPolicy: 'friends' } }]);
    expect(document.querySelector('.account-preference-help')?.textContent).toBe(
      'Messaging preference saved.',
    );
  });

  it('separates username from the email sign-in summary', async () => {
    window.history.replaceState(null, '', '/account/settings/username');
    const user = testUser('misty');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/auth/me') return jsonResponse({ user });
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const { mountAccountSettings } = await import('./account.js');
    const root = document.querySelector<HTMLElement>('#app') as HTMLElement;
    await mountAccountSettings(root);
    await flushDom();

    expect(document.querySelector('h1')?.textContent).toBe('Change username');
    expect(document.querySelector('input[name="handle"]')).not.toBeNull();
    expect(document.querySelector('input[name="email"]')).toBeNull();

    window.history.replaceState(null, '', '/account/settings/account');
    await mountAccountSettings(root);
    await flushDom();

    expect(document.querySelector('h1')?.textContent).toBe('Email and sign-in');
    expect([...document.querySelectorAll('dd')].map((value) => value.textContent)).toEqual([
      'misty@example.com',
      'Verified',
    ]);
    expect(document.querySelector('.account-settings-panel input')).toBeNull();
  });
});

function submitAccountForm(): void {
  const form = document.querySelector<HTMLFormElement>('form.account-form');
  if (!form) throw new Error('missing account form');
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function testUser(handle: string): TestUser {
  return {
    id: `user-${handle}`,
    email: `${handle}@example.com`,
    emailVerified: true,
    handle,
    handleChangedAt: null,
    displayName: handle,
    displayNameChangedAt: null,
    profileVisibility: 'public',
    accountRole: 'player',
    locale: null,
    dmPolicy: 'always',
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

async function flushDom(): Promise<void> {
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
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}
