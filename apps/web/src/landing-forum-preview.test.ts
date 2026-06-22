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
                topic: {
                  id: 'topic_1',
                  slug: 'first-topic',
                  title: 'First topic',
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
    const categoryRow = box.querySelector<HTMLAnchorElement>('a.landing-forum-row');
    expect(header?.textContent).toContain('Forum');
    expect(categoryRow?.getAttribute('href')).toBe('/forum?category=strategy');
    expect(categoryRow?.textContent).toContain('First topic');
    expect(categoryRow?.textContent).toContain('Strategy');
    expect(categoryRow?.textContent).toContain('2');
  });
});
