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
};

describe('account nav', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
    window.history.replaceState(null, '', '/');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('mounts the account menu when auth resolves before the nav is inserted', async () => {
    const user = testUser('misty');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ user })),
    );

    const { initializeAccountNav } = await import('./account-nav.js');
    const { buildNav } = await import('./site-shell.js');

    initializeAccountNav();
    await flushDom();

    document.body.append(buildNav());
    await flushDom();

    expect(document.querySelector('.account-nav-trigger')?.textContent).toBe('misty');
    expect(document.querySelector('.site-nav-link-signin')).toBeNull();
  });

  it('can replace a mounted account menu with signed-out links', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ user: null })),
    );

    const { buildNav } = await import('./site-shell.js');
    const { setAccountNavUser } = await import('./account-nav.js');
    document.body.append(buildNav());

    setAccountNavUser(testUser('misty'));
    expect(document.querySelector('.account-nav-trigger')?.textContent).toBe('misty');

    setAccountNavUser(null);
    expect(document.querySelector('.account-nav-trigger')).toBeNull();
    expect(document.querySelector('.site-nav-link-signin')?.textContent).toBe('Sign in');
    expect(document.querySelector('.site-nav-link-register')?.textContent).toBe('Register');
  });
});

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
  };
}

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
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
