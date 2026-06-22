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
  },
  {
    id: 'strategy',
    slug: 'strategy',
    name: 'Strategy',
    description: 'Openings and patterns.',
    sortOrder: 30,
    topicWritePolicy: 'account',
    topicCount: 1,
  },
];

const topic = {
  id: 'topic_strategy',
  slug: 'scouting-the-center',
  title: 'Scouting the center',
  category: { slug: 'strategy', name: 'Strategy' },
  author: { handle: 'alice', displayName: 'Alice' },
  postCount: 1,
  pinned: false,
  locked: false,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  lastPostAt: '2026-06-01T00:00:00.000Z',
};

describe('forum pages', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(root.textContent).toContain('Scouting the center');
    expect(root.textContent).toContain('Sign in to start a topic.');
    expect(root.querySelector<HTMLAnchorElement>('.forum-topic-card')?.getAttribute('href')).toBe(
      '/forum/t/topic_strategy/scouting-the-center',
    );
  });

  it('allows admins to start announcement topics', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/forum/categories')) return json({ categories });
      if (url.startsWith('/api/forum/topics')) return json({ topics: [topic] });
      if (url.startsWith('/api/auth/me')) {
        return json({
          user: {
            id: 'admin_1',
            email: 'admin@example.com',
            emailVerified: true,
            handle: 'admin',
            handleChangedAt: null,
            displayName: 'Admin',
            displayNameChangedAt: null,
            profileVisibility: 'public',
            accountRole: 'admin',
          },
        });
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
