import { afterEach, describe, expect, it, vi } from 'vitest';

describe('landing forum preview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates the homepage forum box with one link-line per latest post', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          posts: [
            {
              post: {
                id: 'post_2',
                page: 2,
                snippet: 'Developing knights first keeps more fog pressure.',
              },
              topic: {
                id: 'topic_1',
                slug: 'first-topic',
                title: 'First topic',
              },
              author: { handle: 'alice', displayName: 'Alice' },
              createdAt: '2026-06-01T00:05:00.000Z',
            },
            {
              post: {
                id: 'post_1',
                page: 1,
                snippet: 'I like opening with central pawns.',
              },
              topic: {
                id: 'topic_1',
                slug: 'first-topic',
                title: 'First topic',
              },
              author: null,
              createdAt: '2026-06-01T00:00:00.000Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const { buildLandingForumPreview } = await import('./landing-forum-preview.js');

    const box = buildLandingForumPreview();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchSpy).toHaveBeenCalledWith('/api/forum/latest-posts?limit=8', {
      headers: { accept: 'application/json' },
    });
    const rows = box.querySelectorAll<HTMLAnchorElement>('a.landing-forum-post');
    expect(rows.length).toBe(2);
    expect(rows[0]?.getAttribute('href')).toBe('/forum/t/topic_1/first-topic?page=2#post_post_2');
    expect(rows[0]?.textContent).toContain('First topic');
    expect(rows[0]?.textContent).toContain('Alice');
    expect(rows[0]?.textContent).toContain('Developing knights first keeps more fog pressure.');
    // The row itself is the only link: no nested anchors per post.
    expect(rows[0]?.querySelectorAll('a').length).toBe(0);
    expect(rows[1]?.getAttribute('href')).toBe('/forum/t/topic_1/first-topic#post_post_1');
    expect(rows[1]?.textContent).toContain('Deleted account');
  });
});
