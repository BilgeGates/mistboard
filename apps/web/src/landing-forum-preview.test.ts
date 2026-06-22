import { afterEach, describe, expect, it, vi } from 'vitest';

describe('landing forum preview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates the homepage forum box with latest topic links', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          topics: [
            {
              id: 'topic_1',
              slug: 'first-topic',
              title: 'First topic',
              category: { name: 'Strategy' },
              postCount: 2,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const { buildLandingForumPreview } = await import('./landing-forum-preview.js');

    const box = buildLandingForumPreview();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const row = box.querySelector<HTMLAnchorElement>('.landing-forum-row');
    expect(row?.getAttribute('href')).toBe('/forum/t/topic_1/first-topic');
    expect(row?.textContent).toContain('First topic');
    expect(row?.textContent).toContain('Strategy');
  });
});
