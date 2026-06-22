import { afterEach, describe, expect, it, vi } from 'vitest';

describe('landing forum preview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates the homepage forum box with category activity links', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          categories: [
            {
              slug: 'strategy',
              name: 'Strategy',
              description: 'Openings and patterns.',
              topicCount: 1,
              postCount: 2,
              latestPost: {
                post: {
                  id: 'post_1',
                },
                topic: {
                  id: 'topic_1',
                  slug: 'first-topic',
                  title: 'First topic',
                  postCount: 2,
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
    const categoryRow = box.querySelector<HTMLElement>(
      '.landing-forum-row:not(.landing-forum-header)',
    );
    const categoryLink = box.querySelector<HTMLAnchorElement>('a.landing-forum-row-main');
    const latestPostLink = box.querySelector<HTMLAnchorElement>('a.landing-forum-row-last-title');
    const latestAuthorLink = box.querySelector<HTMLAnchorElement>('a.landing-forum-row-author');
    expect(header?.textContent).toContain('Forum');
    expect(categoryLink?.getAttribute('href')).toBe('/forum/strategy');
    expect(latestPostLink?.getAttribute('href')).toBe('/forum/t/topic_1/first-topic#post_post_1');
    expect(latestAuthorLink?.getAttribute('href')).toBe('/@/alice');
    expect(categoryRow?.textContent).toContain('First topic');
    expect(categoryRow?.textContent).toContain('by Alice');
    expect(categoryRow?.textContent).toContain('Strategy');
    expect(categoryRow?.textContent).toContain('2');
  });
});
