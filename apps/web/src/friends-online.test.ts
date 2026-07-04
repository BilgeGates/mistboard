import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const SIGNED_IN = { user: { id: 'u1', handle: 'me', displayName: 'Me', accountRole: 'player' } };

type Friend = {
  handle: string;
  displayName: string;
  rating: { variant: string; eloRating: number; provisional: boolean } | null;
  playing: boolean;
};

// Route fetch by URL: /api/auth/me for the signed-in gate, online-following for
// the widget's data.
function stubFetch(opts: { signedIn?: boolean; friends?: Friend[] }): void {
  const signedIn = opts.signedIn ?? true;
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/auth/me')) {
      return Promise.resolve(json(signedIn ? SIGNED_IN : { user: null }));
    }
    if (url.includes('/api/relations/online-following')) {
      const friends = opts.friends ?? [];
      return Promise.resolve(json({ players: friends, count: friends.length }));
    }
    return Promise.resolve(json({}, 404));
  });
}

async function mount(): Promise<void> {
  // Fresh module each test so the module-level `mounted` guard resets.
  vi.resetModules();
  const { mountFriendsOnline } = await import('./friends-online.js');
  await mountFriendsOnline();
}

const friend = (over: Partial<Friend> = {}): Friend => ({
  handle: 'conan',
  displayName: 'Conan_The_Barbarian8',
  rating: { variant: 'fog', eloRating: 2903, provisional: false },
  playing: false,
  ...over,
});

describe('friends-online widget', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not mount for an anonymous viewer', async () => {
    stubFetch({ signedIn: false, friends: [friend()] });
    await mount();
    expect(document.querySelector('.friends-online')).toBeNull();
  });

  it('quiet-collapses (stays hidden) when no friends are online', async () => {
    stubFetch({ friends: [] });
    await mount();
    const box = document.querySelector('.friends-online') as HTMLElement;
    expect(box).not.toBeNull();
    expect(box.hidden).toBe(true);
  });

  it('renders a row per online friend with name and rating', async () => {
    stubFetch({ friends: [friend(), friend({ handle: 'diego', displayName: 'DiegoMaciasPino' })] });
    await mount();
    const box = document.querySelector('.friends-online') as HTMLElement;
    expect(box.hidden).toBe(false);
    const names = [...box.querySelectorAll('.friends-online-name')].map((el) => el.textContent);
    expect(names).toEqual(['Conan_The_Barbarian8', 'DiegoMaciasPino']);
    expect(box.querySelector('.friends-online-rating')?.textContent).toBe('2903');
  });

  it('marks a playing friend', async () => {
    stubFetch({ friends: [friend({ playing: true })] });
    await mount();
    expect(document.querySelector('.friends-online-playing')).not.toBeNull();
  });

  it('starts collapsed and expands on toggle click', async () => {
    stubFetch({ friends: [friend()] });
    await mount();
    const box = document.querySelector('.friends-online') as HTMLElement;
    const toggle = box.querySelector('.friends-online-toggle') as HTMLButtonElement;
    const label = box.querySelector('.friends-online-toggle-label') as HTMLElement;
    expect(box.classList.contains('friends-online-expanded')).toBe(false);
    expect(label.textContent).toBe('friends online');
    toggle.click();
    expect(box.classList.contains('friends-online-expanded')).toBe(true);
    expect(label.textContent).toBe('1 friend online');
  });
});
