import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildLandingChat,
  CHAT_VISIBLE_LINES,
  CHAT_WINDOW_MS,
  type ChatLine,
  createLandingChatFeed,
  readStoredChatMuted,
  visibleChatWindow,
} from './landing-chat.js';

const T0 = Date.UTC(2026, 6, 10, 12, 0, 0);

function line(id: string, ageMs: number, now = T0): ChatLine {
  return {
    id,
    handle: `user_${id}`,
    text: `message ${id}`,
    createdAt: new Date(now - ageMs).toISOString(),
  };
}

describe('visibleChatWindow', () => {
  it('keeps a seven-day activity window', () => {
    expect(CHAT_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('keeps lines inside the window and drops lines at or beyond it', () => {
    const lines = [
      line('expired', CHAT_WINDOW_MS + 1),
      line('boundary', CHAT_WINDOW_MS),
      line('fresh', CHAT_WINDOW_MS - 1),
      line('now', 0),
    ];
    expect(visibleChatWindow(lines, T0).map((l) => l.id)).toEqual(['fresh', 'now']);
  });

  it('caps the window at the newest CHAT_VISIBLE_LINES', () => {
    const lines = Array.from({ length: CHAT_VISIBLE_LINES + 10 }, (_, i) =>
      line(`m${String(i).padStart(2, '0')}`, (CHAT_VISIBLE_LINES + 10 - i) * 1000),
    );
    const visible = visibleChatWindow(lines, T0);
    expect(visible).toHaveLength(CHAT_VISIBLE_LINES);
    expect(visible[0]?.id).toBe('m10');
    expect(visible[visible.length - 1]?.id).toBe(`m${CHAT_VISIBLE_LINES + 9}`);
  });

  it('drops lines with unparseable timestamps and returns [] for empty input', () => {
    expect(visibleChatWindow([], T0)).toEqual([]);
    const bad: ChatLine = { id: 'bad', handle: 'x', text: 'y', createdAt: 'not-a-date' };
    expect(visibleChatWindow([bad, line('ok', 1000)], T0).map((l) => l.id)).toEqual(['ok']);
  });
});

describe('createLandingChatFeed', () => {
  const state = { canReport: false, isAdmin: false, viewerHandle: null };

  function feedWithClock(startAt = T0, onEmpty?: () => void) {
    let now = startAt;
    const feed = createLandingChatFeed({
      state,
      locale: 'en',
      mode: 'live',
      now: () => now,
      onEmpty,
    });
    return { feed, advance: (ms: number) => (now += ms) };
  }

  function renderedIds(feed: { element: HTMLElement }): string[] {
    return [...feed.element.querySelectorAll('.landing-chat-line .landing-chat-text')].map(
      (el) => el.textContent?.replace('message ', '') ?? '',
    );
  }

  it('renders only lines inside the window on ingest', () => {
    const { feed } = feedWithClock();
    feed.ingest([line('old', CHAT_WINDOW_MS + 5000), line('a', 60_000), line('b', 1000)]);
    expect(renderedIds(feed)).toEqual(['a', 'b']);
    expect(feed.visibleIds()).toEqual(['a', 'b']);
  });

  it('renders a localized timestamp for every visible line', () => {
    const { feed } = feedWithClock();
    const message = line('timestamped', 60_000);
    feed.ingest([message]);

    const timestamp = feed.element.querySelector<HTMLTimeElement>('.landing-chat-timestamp');
    expect(timestamp?.dateTime).toBe(message.createdAt);
    expect(timestamp?.textContent).toMatch(/Fri.*(AM|PM)/);
    expect(timestamp?.title).toContain('2026');
  });

  it('does not resurrect expired lines when a new message is ingested', () => {
    const { feed } = feedWithClock();
    // The whole served history is old: the visible window is empty.
    feed.ingest([line('old1', CHAT_WINDOW_MS + 60_000), line('old2', CHAT_WINDOW_MS + 5000)]);
    expect(renderedIds(feed)).toEqual([]);
    // Typing a new message re-renders from the same windowed store: only the
    // fresh line shows, even if a re-fetch delivers the old lines again.
    feed.ingest([line('old1', CHAT_WINDOW_MS + 60_000), line('fresh', 0)]);
    expect(renderedIds(feed)).toEqual(['fresh']);
  });

  it('ages lines out on expireTick as the clock advances', () => {
    const { feed, advance } = feedWithClock();
    feed.ingest([line('a', 2 * 60 * 60 * 1000), line('b', 60_000)]);
    expect(renderedIds(feed)).toEqual(['a', 'b']);

    advance(CHAT_WINDOW_MS - 60 * 60 * 1000); // 'a' is now past the window
    feed.expireTick();
    expect(renderedIds(feed)).toEqual(['b']);
  });

  it('invokes onEmpty when the last line ages out', () => {
    const onEmpty = vi.fn();
    const { feed, advance } = feedWithClock(T0, onEmpty);
    feed.ingest([line('a', 1000)]);
    expect(onEmpty).not.toHaveBeenCalled();

    advance(CHAT_WINDOW_MS + 1000);
    feed.expireTick();
    expect(renderedIds(feed)).toEqual([]);
    expect(onEmpty).toHaveBeenCalledTimes(1);

    // A quiet tick over an already-empty feed does not re-fire.
    feed.expireTick();
    expect(onEmpty).toHaveBeenCalledTimes(1);
  });

  it('enforces the visible cap, dropping the oldest line first', () => {
    const { feed } = feedWithClock();
    feed.ingest(
      Array.from({ length: CHAT_VISIBLE_LINES }, (_, i) =>
        line(`m${String(i).padStart(2, '0')}`, (CHAT_VISIBLE_LINES - i) * 1000),
      ),
    );
    expect(renderedIds(feed)).toHaveLength(CHAT_VISIBLE_LINES);
    expect(renderedIds(feed)[0]).toBe('m00');

    feed.ingest([line('newest', 0)]);
    const ids = renderedIds(feed);
    expect(ids).toHaveLength(CHAT_VISIBLE_LINES);
    expect(ids[0]).toBe('m01');
    expect(ids[ids.length - 1]).toBe('newest');
  });

  it('removes a line from the store so re-renders cannot bring it back', () => {
    const { feed } = feedWithClock();
    feed.ingest([line('a', 2000), line('b', 1000)]);
    feed.remove('a');
    expect(renderedIds(feed)).toEqual(['b']);
    feed.expireTick();
    expect(renderedIds(feed)).toEqual(['b']);
  });
});

describe('buildLandingChat (live, stubbed fetch)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  function jsonResponse(payload: unknown): Response {
    return { ok: true, status: 200, json: async () => payload } as Response;
  }

  it('shows the quiet invitation, not old lines, when the window is empty on load', async () => {
    const oldLines = [line('old1', CHAT_WINDOW_MS + 60_000, Date.now())];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          lines: oldLines,
          canPost: true,
          canReport: false,
          viewerHandle: 'you',
          isAdmin: false,
        }),
      ),
    );

    const mount = buildLandingChat();
    document.body.append(mount);
    await vi.waitFor(() => {
      expect(mount.querySelector('.landing-chat-quiet')).toBeTruthy();
    });
    expect(mount.querySelectorAll('.landing-chat-line')).toHaveLength(0);
  });

  it('posting from the quiet state shows only the new line, never the expired history', async () => {
    const oldLines = [
      line('old1', CHAT_WINDOW_MS + 60_000, Date.now()),
      line('old2', CHAT_WINDOW_MS + 5000, Date.now()),
    ];
    const posted: ChatLine = {
      id: 'posted',
      handle: 'you',
      text: 'hello there',
      createdAt: new Date().toISOString(),
    };
    let sent = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: unknown, init?: { method?: string }) => {
        if (init?.method === 'POST') {
          sent = true;
          return jsonResponse({ line: posted });
        }
        return jsonResponse({
          lines: sent ? [...oldLines, posted] : oldLines,
          canPost: true,
          canReport: false,
          viewerHandle: 'you',
          isAdmin: false,
        });
      }),
    );

    const mount = buildLandingChat();
    document.body.append(mount);
    await vi.waitFor(() => {
      expect(mount.querySelector('.landing-chat-quiet')).toBeTruthy();
    });

    const input = mount.querySelector<HTMLInputElement>('.landing-chat-input');
    const form = mount.querySelector<HTMLFormElement>('.landing-chat-composer');
    expect(input && form).toBeTruthy();
    if (!input || !form) return;
    input.value = 'hello there';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(mount.querySelectorAll('.landing-chat-line')).toHaveLength(1);
    });
    const texts = [...mount.querySelectorAll('.landing-chat-text')].map((el) => el.textContent);
    expect(texts).toEqual(['hello there']);
  });
});

describe('landing chat mute persistence (live)', () => {
  const CHAT_MUTED_KEY = 'mistboard.chatMuted';

  // The jsdom test env ships no window.localStorage (production code try/catches
  // around it); install an in-memory stub so the persistence path is exercised.
  let originalLocalStorage: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
    const store = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
        setItem: (k: string, v: string) => void store.set(k, String(v)),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
        key: (i: number) => [...store.keys()][i] ?? null,
        get length() {
          return store.size;
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalLocalStorage) {
      Object.defineProperty(window, 'localStorage', originalLocalStorage);
    } else {
      Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'localStorage');
    }
    document.body.replaceChildren();
  });

  function stubRoomFetch(): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          lines: [line('a', 60_000, Date.now()), line('b', 1000, Date.now())],
          canPost: true,
          canReport: false,
          viewerHandle: 'you',
          isAdmin: false,
        }),
      })),
    );
  }

  it('reads the stored mute flag', () => {
    expect(readStoredChatMuted()).toBe(false);
    window.localStorage.setItem(CHAT_MUTED_KEY, 'true');
    expect(readStoredChatMuted()).toBe(true);
    window.localStorage.setItem(CHAT_MUTED_KEY, 'false');
    expect(readStoredChatMuted()).toBe(false);
  });

  it('renders the muted box (no feed) on load when mute was persisted', async () => {
    window.localStorage.setItem(CHAT_MUTED_KEY, 'true');
    stubRoomFetch();

    const mount = buildLandingChat();
    document.body.append(mount);
    // The box paints (chat exists) but in the muted state: the toggle is present,
    // the feed is not.
    await vi.waitFor(() => {
      expect(mount.querySelector('.landing-chat.is-chat-muted')).toBeTruthy();
    });
    expect(mount.querySelector('.landing-chat-toggle')).toBeTruthy();
    expect(mount.querySelectorAll('.landing-chat-line')).toHaveLength(0);
  });

  it('toggling mute writes the flag, and unmuting restores the feed and clears it', async () => {
    stubRoomFetch();

    const mount = buildLandingChat();
    document.body.append(mount);
    await vi.waitFor(() => {
      expect(mount.querySelectorAll('.landing-chat-line').length).toBeGreaterThan(0);
    });

    const toggle = mount.querySelector<HTMLButtonElement>('.landing-chat-toggle');
    expect(toggle).toBeTruthy();
    if (!toggle) return;

    toggle.click();
    expect(window.localStorage.getItem(CHAT_MUTED_KEY)).toBe('true');
    expect(mount.querySelector('.landing-chat.is-chat-muted')).toBeTruthy();
    expect(mount.querySelectorAll('.landing-chat-line')).toHaveLength(0);

    toggle.click();
    expect(window.localStorage.getItem(CHAT_MUTED_KEY)).toBe('false');
    await vi.waitFor(() => {
      expect(mount.querySelectorAll('.landing-chat-line').length).toBeGreaterThan(0);
    });
  });
});
