import { afterEach, describe, expect, it, vi } from 'vitest';

describe('landing forum preview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates the homepage forum box with recent active topics', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          topics: [
            {
              id: 'topic_1',
              slug: 'first-topic',
              title: 'First topic',
              category: { slug: 'strategy', name: 'Strategy' },
              author: { handle: 'bob', displayName: 'Bob' },
              postCount: 2,
              lastPostAt: '2026-06-01T00:00:00.000Z',
              latestPost: {
                post: {
                  id: 'post_1',
                },
                author: { handle: 'alice', displayName: 'Alice' },
                createdAt: '2026-06-01T00:00:00.000Z',
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const { buildLandingForumPreview } = await import('./landing-forum-preview.js');

    const box = buildLandingForumPreview();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const header = box.querySelector<HTMLElement>('.landing-forum-header');
    const topicRow = box.querySelector<HTMLElement>(
      '.landing-forum-row:not(.landing-forum-header)',
    );
    const topicLink = box.querySelector<HTMLAnchorElement>('a.landing-forum-row-main');
    const latestPostLink = box.querySelector<HTMLAnchorElement>('a.landing-forum-row-last-title');
    const latestAuthorLink = box.querySelector<HTMLAnchorElement>('a.landing-forum-row-author');
    expect(fetchSpy).toHaveBeenCalledWith('/api/forum/topics?limit=5&offset=0', {
      headers: { accept: 'application/json' },
    });
    expect(header?.textContent).toContain('Topic');
    expect(header?.textContent).toContain('Replies');
    expect(topicLink?.getAttribute('href')).toBe('/forum/t/topic_1/first-topic');
    expect(latestPostLink?.getAttribute('href')).toBe('/forum/t/topic_1/first-topic#post_post_1');
    expect(latestAuthorLink?.getAttribute('href')).toBe('/@/alice');
    expect(topicRow?.textContent).toContain('First topic');
    expect(topicRow?.textContent).toContain('by Alice');
    expect(topicRow?.textContent).toContain('Strategy');
    expect(topicRow?.textContent).toContain('1');
  });
});
