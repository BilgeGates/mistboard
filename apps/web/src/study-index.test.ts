import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountStudyIndex } from './study-index.js';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  window.history.replaceState({}, '', '/');
});

describe('study index Staff picks', () => {
  it('loads the public curated collection and marks its cards', async () => {
    window.history.replaceState({}, '', '/study?tab=staff');
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(input.toString()).toBe('/api/studies/staff?limit=30');
      return jsonResponse({
        studies: [
          {
            id: 'classic1',
            name: 'Secret in the Tangerine',
            description: 'Archive transcription',
            visibility: 'public',
            chapterCount: 20,
            chapterNames: ['The first game', 'The second game'],
            updatedAt: '2026-07-23T12:00:00.000Z',
            featuredAt: '2026-07-24T12:00:00.000Z',
            owner: { handle: 'mistboard', displayName: 'mistboard' },
            likeCount: 4,
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetcher);
    const root = document.createElement('div');
    document.body.append(root);

    mountStudyIndex(root);

    await vi.waitFor(() =>
      expect(root.querySelector('.study-index__name')?.textContent).toBe('Secret in the Tangerine'),
    );
    expect(root.querySelector('.study-index__rail [aria-current="page"]')?.textContent).toBe(
      'Staff picks',
    );
    expect(root.querySelector('.study-index__staff-intro')?.textContent).toContain(
      'Curated by Mistboard',
    );
    expect(root.querySelector('.study-index__staff-badge')?.textContent).toBe('★ Staff pick');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps Staff picks public when the curated collection is empty', async () => {
    window.history.replaceState({}, '', '/study?tab=staff');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ studies: [] })),
    );
    const root = document.createElement('div');
    document.body.append(root);

    mountStudyIndex(root);

    await vi.waitFor(() =>
      expect(root.querySelector('.study-index__empty')?.textContent).toBe('No staff picks yet.'),
    );
    expect(root.querySelector('.dxq-postgame__error')).toBeNull();
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
