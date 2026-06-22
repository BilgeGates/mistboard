import { afterEach, describe, expect, it, vi } from 'vitest';

const categories = [
  {
    id: 'announcements',
    slug: 'announcements',
    name: 'Announcements',
    description: 'Official updates.',
    sortOrder: 10,
    topicWritePolicy: 'admin',
    topicCount: 0,
    postCount: 0,
    latestPost: null,
  },
  {
    id: 'strategy',
    slug: 'strategy',
    name: 'Strategy',
    description: 'Openings and patterns.',
    sortOrder: 30,
    topicWritePolicy: 'account',
    topicCount: 1,
    postCount: 2,
    latestPost: {
      post: {
        id: 'post_strategy_reply',
      },
      topic: {
        id: 'topic_strategy',
        slug: 'scouting-the-center',
        title: 'Scouting the center',
        postCount: 2,
      },
      author: { handle: 'bob', displayName: 'Bob' },
      createdAt: '2026-06-01T00:05:00.000Z',
    },
  },
];

const topic = {
  id: 'topic_strategy',
  slug: 'scouting-the-center',
  title: 'Scouting the center',
  category: { slug: 'strategy', name: 'Strategy' },
  author: { handle: 'alice', displayName: 'Alice' },
  latestPost: {
    post: {
      id: 'post_strategy_reply',
    },
    author: { handle: 'bob', displayName: 'Bob' },
    createdAt: '2026-06-01T00:05:00.000Z',
  },
  postCount: 2,
  pinned: false,
  locked: false,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  lastPostAt: '2026-06-01T00:00:00.000Z',
};

const adminUser = {
  id: 'admin_1',
  email: 'admin@example.com',
  emailVerified: true,
  handle: 'admin',
  handleChangedAt: null,
  displayName: 'Admin',
  displayNameChangedAt: null,
  profileVisibility: 'public',
  accountRole: 'admin',
};

describe('forum pages', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.pushState(null, '', '/');
  });

  it('renders the forum index with account-gated topic creation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/forum/categories')) return json({ categories });
      if (url.startsWith('/api/forum/topics')) return json({ topics: [topic] });
      if (url.startsWith('/api/auth/me')) return json({ user: null });
      throw new Error(`unexpected fetch ${url}`);
    });
    const root = document.createElement('div');
    const { mountForum } = await import('./forum.js');

    await mountForum(root);

    expect(root.textContent).toContain('Forum');
    expect(root.textContent).toContain('Topics');
    expect(root.textContent).toContain('Posts');
    expect(root.textContent).toContain('Bob');
    expect(root.textContent).toContain('Scouting the center');
    expect(root.textContent).toContain('Sign in to start a topic.');
    expect(
      root.querySelector<HTMLAnchorElement>('a.forum-category-index-main')?.getAttribute('href'),
    ).toBe('/forum?category=announcements');
    expect(
      root.querySelector<HTMLAnchorElement>('a.forum-category-index-last')?.getAttribute('href'),
    ).toBe('/forum/t/topic_strategy/scouting-the-center#post_post_strategy_reply');
    expect(root.querySelector<HTMLAnchorElement>('.forum-topic-title')?.getAttribute('href')).toBe(
      '/forum/t/topic_strategy/scouting-the-center',
    );
    expect(
      root.querySelector<HTMLAnchorElement>('.forum-topic-latest-link')?.getAttribute('href'),
    ).toBe('/forum/t/topic_strategy/scouting-the-center#post_post_strategy_reply');
  });

  it('renders a selected category as a focused topic view', async () => {
    const fetchedUrls: string[] = [];
    window.history.pushState(null, '', '/forum?category=strategy');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      fetchedUrls.push(url);
      if (url.startsWith('/api/forum/categories')) return json({ categories });
      if (url.startsWith('/api/forum/topics')) return json({ topics: [topic] });
      if (url.startsWith('/api/auth/me')) return json({ user: null });
      throw new Error(`unexpected fetch ${url}`);
    });
    const root = document.createElement('div');
    const { mountForum } = await import('./forum.js');

    await mountForum(root);

    expect(fetchedUrls).toContain('/api/forum/topics?category=strategy&limit=26&offset=0');
    expect(root.textContent).toContain('Openings and patterns.');
    expect(root.textContent).toContain('1 topic · 2 posts');
    expect(root.querySelector('.forum-category-header-box')?.textContent).toContain('Strategy');
  });

  it('paginates forum topic lists with stable page URLs', async () => {
    const fetchedUrls: string[] = [];
    window.history.pushState(null, '', '/forum?category=strategy&page=2');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      fetchedUrls.push(url);
      if (url.startsWith('/api/forum/categories')) return json({ categories });
      if (url.startsWith('/api/forum/topics')) {
        return json({
          topics: Array.from({ length: 26 }, (_, index) => ({
            ...topic,
            id: `topic_strategy_${index}`,
            title: `Scouting the center ${index}`,
            slug: `scouting-the-center-${index}`,
          })),
        });
      }
      if (url.startsWith('/api/auth/me')) return json({ user: null });
      throw new Error(`unexpected fetch ${url}`);
    });
    const root = document.createElement('div');
    const { mountForum } = await import('./forum.js');

    await mountForum(root);

    expect(fetchedUrls).toContain('/api/forum/topics?category=strategy&limit=26&offset=25');
    expect(root.querySelectorAll('.forum-topic-card')).toHaveLength(25);
    expect(root.querySelector('.forum-pager-current')?.textContent).toBe('Page 2');
    const pageLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('.forum-pager-link'));
    expect(pageLinks.map((link) => link.textContent)).toEqual(['Previous', 'Next']);
    expect(pageLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/forum?category=strategy',
      '/forum?category=strategy&page=3',
    ]);
  });

  it('renders backend forum search with paginated result URLs', async () => {
    const fetchedUrls: string[] = [];
    window.history.pushState(null, '', '/forum?q=central%20fog&page=2');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      fetchedUrls.push(url);
      if (url.startsWith('/api/forum/categories')) return json({ categories });
      if (url.startsWith('/api/forum/search')) {
        return json({
          topics: Array.from({ length: 26 }, (_, index) => ({
            ...topic,
            id: `topic_search_${index}`,
            title: `Search result ${index}`,
            slug: `search-result-${index}`,
          })),
        });
      }
      if (url.startsWith('/api/auth/me')) return json({ user: null });
      throw new Error(`unexpected fetch ${url}`);
    });
    const root = document.createElement('div');
    const { mountForum } = await import('./forum.js');

    await mountForum(root);

    expect(fetchedUrls).toContain('/api/forum/search?q=central+fog&limit=26&offset=25');
    expect(root.textContent).toContain('Search results');
    expect(root.textContent).toContain('"central fog"');
    expect(root.querySelector<HTMLInputElement>('input[name="q"]')?.value).toBe('central fog');
    expect(root.querySelectorAll('.forum-topic-card')).toHaveLength(25);
    const pageLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('.forum-pager-link'));
    expect(pageLinks.map((link) => link.textContent)).toEqual(['Previous', 'Next']);
    expect(pageLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/forum?q=central+fog',
      '/forum?q=central+fog&page=3',
    ]);
  });

  it('links latest posts to their topic page when threads are long', async () => {
    const longTopic = { ...topic, postCount: 26 };
    const longCategories = categories.map((category) =>
      category.slug === 'strategy' && category.latestPost
        ? {
            ...category,
            latestPost: {
              ...category.latestPost,
              topic: {
                ...category.latestPost.topic,
                postCount: 26,
              },
            },
          }
        : category,
    );
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/forum/categories')) return json({ categories: longCategories });
      if (url.startsWith('/api/forum/topics')) return json({ topics: [longTopic] });
      if (url.startsWith('/api/auth/me')) return json({ user: null });
      throw new Error(`unexpected fetch ${url}`);
    });
    const root = document.createElement('div');
    const { mountForum } = await import('./forum.js');

    await mountForum(root);

    expect(
      root.querySelector<HTMLAnchorElement>('a.forum-category-index-last')?.getAttribute('href'),
    ).toBe('/forum/t/topic_strategy/scouting-the-center?page=2#post_post_strategy_reply');
    expect(
      root.querySelector<HTMLAnchorElement>('.forum-topic-latest-link')?.getAttribute('href'),
    ).toBe('/forum/t/topic_strategy/scouting-the-center?page=2#post_post_strategy_reply');
  });

  it('allows admins to start announcement topics', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/forum/categories')) return json({ categories });
      if (url.startsWith('/api/forum/topics')) return json({ topics: [topic] });
      if (url.startsWith('/api/auth/me')) {
        return json({ user: adminUser });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const root = document.createElement('div');
    const { mountForum } = await import('./forum.js');

    await mountForum(root);

    const announcement = root.querySelector<HTMLOptionElement>('option[value="announcements"]');
    expect(announcement?.disabled).toBe(false);
    expect(announcement?.selected).toBe(true);
  });

  it('renders topic moderation controls for admins', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/forum/topics/topic_strategy')) {
        return json({
          topic: {
            ...topic,
            posts: [
              {
                id: 'post_1',
                author: { handle: 'alice', displayName: 'Alice' },
                bodyText: 'Opening post.',
                createdAt: '2026-06-01T00:00:00.000Z',
                updatedAt: '2026-06-01T00:00:00.000Z',
              },
            ],
          },
        });
      }
      if (url.startsWith('/api/auth/me')) return json({ user: adminUser });
      throw new Error(`unexpected fetch ${url}`);
    });
    const root = document.createElement('div');
    const { mountForumTopic } = await import('./forum.js');

    await mountForumTopic(root, 'topic_strategy');

    const buttonLabels = Array.from(root.querySelectorAll('button'), (button) =>
      button.textContent?.trim(),
    );
    expect(root.textContent).toContain('Moderation');
    expect(buttonLabels).toContain('Pin');
    expect(buttonLabels).toContain('Lock');
    expect(buttonLabels).toContain('Hide topic');
    expect(buttonLabels).toContain('Hide post');
  });

  it('renders topic breadcrumbs and category navigation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/forum/categories')) return json({ categories });
      if (url.startsWith('/api/forum/topics/topic_strategy')) {
        return json({
          topic: {
            ...topic,
            posts: [
              {
                id: 'post_1',
                author: { handle: 'alice', displayName: 'Alice' },
                bodyText: 'Opening post.',
                createdAt: '2026-06-01T00:00:00.000Z',
                updatedAt: '2026-06-01T00:00:00.000Z',
              },
            ],
          },
        });
      }
      if (url.startsWith('/api/auth/me')) return json({ user: null });
      throw new Error(`unexpected fetch ${url}`);
    });
    const root = document.createElement('div');
    const { mountForumTopic } = await import('./forum.js');

    await mountForumTopic(root, 'topic_strategy');

    const breadcrumbs = Array.from(
      root.querySelectorAll<HTMLAnchorElement>('.forum-breadcrumbs a'),
    );
    expect(breadcrumbs.map((link) => link.textContent)).toEqual(['Forum', 'Strategy']);
    expect(breadcrumbs.map((link) => link.getAttribute('href'))).toEqual([
      '/forum',
      '/forum?category=strategy',
    ]);
    expect(root.querySelector<HTMLInputElement>('input[name="q"]')).not.toBeNull();
    expect(root.querySelector('.forum-category-card-active')?.textContent).toContain('Strategy');
  });

  it('redirects a new reply to its stable post anchor', async () => {
    window.history.pushState(null, '', '/forum/t/topic_strategy/scouting-the-center');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith('/api/forum/topics/topic_strategy') && init?.method !== 'POST') {
        return json({
          topic: {
            ...topic,
            posts: [
              {
                id: 'post_1',
                author: { handle: 'alice', displayName: 'Alice' },
                bodyText: 'Opening post.',
                createdAt: '2026-06-01T00:00:00.000Z',
                updatedAt: '2026-06-01T00:00:00.000Z',
              },
            ],
          },
        });
      }
      if (url === '/api/forum/topics/topic_strategy/posts') {
        return json({
          post: {
            id: 'post_created',
            author: { handle: 'bob', displayName: 'Bob' },
            bodyText: 'A sharper reply.',
            createdAt: '2026-06-01T00:05:00.000Z',
            updatedAt: '2026-06-01T00:05:00.000Z',
          },
        });
      }
      if (url.startsWith('/api/auth/me')) return json({ user: adminUser });
      throw new Error(`unexpected fetch ${url}`);
    });
    const root = document.createElement('div');
    const { mountForumTopic } = await import('./forum.js');

    await mountForumTopic(root, 'topic_strategy');
    const body = root.querySelector<HTMLTextAreaElement>('textarea[name="body"]');
    if (!body) throw new Error('missing reply textarea');
    body.value = 'A sharper reply.';
    const form = root.querySelector<HTMLFormElement>('form.forum-form');
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    const postCall = fetchSpy.mock.calls.find(
      ([input]) => String(input) === '/api/forum/topics/topic_strategy/posts',
    );
    expect(postCall?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({ body: 'A sharper reply.' });
    expect(window.location.pathname).toBe('/forum/t/topic_strategy/scouting-the-center');
    expect(window.location.hash).toBe('#post_post_created');
  });

  it('paginates topic posts with stable page URLs', async () => {
    const fetchedUrls: string[] = [];
    window.history.pushState(null, '', '/forum/t/topic_strategy/scouting-the-center?page=2');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      fetchedUrls.push(url);
      if (url.startsWith('/api/forum/topics/topic_strategy')) {
        return json({
          topic: {
            ...topic,
            postCount: 52,
            posts: Array.from({ length: 26 }, (_, index) => ({
              id: `post_page_${index}`,
              author: { handle: 'alice', displayName: 'Alice' },
              bodyText: `Post ${index}`,
              createdAt: '2026-06-01T00:00:00.000Z',
              updatedAt: '2026-06-01T00:00:00.000Z',
            })),
          },
        });
      }
      if (url.startsWith('/api/auth/me')) return json({ user: null });
      throw new Error(`unexpected fetch ${url}`);
    });
    const root = document.createElement('div');
    const { mountForumTopic } = await import('./forum.js');

    await mountForumTopic(root, 'topic_strategy');

    expect(fetchedUrls).toContain('/api/forum/topics/topic_strategy?limit=26&offset=25');
    expect(root.querySelectorAll('.forum-post')).toHaveLength(25);
    expect(root.querySelector<HTMLElement>('.forum-post')?.id).toBe('post_post_page_0');
    expect(root.querySelector('.forum-pager-current')?.textContent).toBe('Page 2');
    const pageLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('.forum-pager-link'));
    expect(pageLinks.map((link) => link.textContent)).toEqual(['Previous', 'Next']);
    expect(pageLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/forum/t/topic_strategy/scouting-the-center',
      '/forum/t/topic_strategy/scouting-the-center?page=3',
    ]);
  });

  it('renders topic posts as escaped plaintext', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/forum/topics/topic_strategy')) {
        return json({
          topic: {
            ...topic,
            posts: [
              {
                id: 'post_1',
                author: { handle: 'alice', displayName: 'Alice' },
                bodyText: 'Hello <script>alert(1)</script>\nSecond line',
                createdAt: '2026-06-01T00:00:00.000Z',
                updatedAt: '2026-06-01T00:00:00.000Z',
              },
            ],
          },
        });
      }
      if (url.startsWith('/api/auth/me')) return json({ user: null });
      throw new Error(`unexpected fetch ${url}`);
    });
    const root = document.createElement('div');
    const { mountForumTopic } = await import('./forum.js');

    await mountForumTopic(root, 'topic_strategy');

    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector<HTMLElement>('.forum-post')?.id).toBe('post_post_1');
    expect(
      root.querySelector<HTMLAnchorElement>('.forum-post-permalink')?.getAttribute('href'),
    ).toBe('/forum/t/topic_strategy/scouting-the-center#post_post_1');
    expect(root.querySelector('.forum-post-body')?.textContent).toContain(
      'Hello <script>alert(1)</script>',
    );
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
