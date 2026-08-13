import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountStudyIndex } from './study-index.js';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  window.history.replaceState({}, '', '/');
});

describe('study index Staff picks', () => {
  it('loads the public curated collection without repeating badges on its cards', async () => {
    window.history.replaceState({}, '', '/study?tab=staff');
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(input.toString()).toBe('/api/studies/staff?limit=30');
      return jsonResponse({
        studies: [
          {
            id: 'Dfi3NpRE',
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
    expect(root.querySelector('.study-index__staff-badge')).toBeNull();
    expect(
      root.querySelector<HTMLImageElement>('.study-index__thumbnail img')?.getAttribute('src'),
    ).toBe('/study-thumbnails/tangerine-vol-1.webp');
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

// Chapter names on a card are authored text with a per-locale overlay, exactly
// like the study title. The list endpoint used to send bare names, so a Chinese
// reader got the English chapter list under a translated title.
describe('study index chapter previews', () => {
  it('localizes chapter names from the preview overlay, per chapter', async () => {
    window.history.replaceState({}, '', '/zh-hant/study?tab=staff');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          studies: [
            {
              id: 'Dfi3NpRE',
              name: 'Secret in the Tangerine',
              description: 'Archive transcription',
              i18n: { 'zh-Hant': { name: '橘中秘' } },
              visibility: 'public',
              chapterCount: 3,
              chapterPreview: [
                {
                  name: 'Rank chariot vs file chariot',
                  i18n: { 'zh-Hant': { name: '順砲橫車破直車棄馬局' } },
                },
                { name: 'An untranslated chapter', i18n: {} },
              ],
              chapterNames: ['Rank chariot vs file chariot', 'An untranslated chapter'],
              updatedAt: '2026-07-23T12:00:00.000Z',
              owner: { handle: 'mistboard', displayName: 'mistboard' },
              likeCount: 4,
            },
          ],
        }),
      ),
    );
    const root = document.createElement('div');
    document.body.append(root);

    mountStudyIndex(root);

    await vi.waitFor(() =>
      expect(root.querySelector('.study-index__name')?.textContent).toBe('橘中秘'),
    );
    const chapters = [...root.querySelectorAll('.study-index__chapter')].map(
      (row) => row.textContent,
    );
    // The translated chapter reads in the viewer's locale; the untranslated one
    // falls back to its base name rather than blanking.
    expect(chapters[0]).toBe('順砲橫車破直車棄馬局');
    expect(chapters[1]).toBe('An untranslated chapter');
  });

  it('still renders names from a server that predates the preview overlay', async () => {
    window.history.replaceState({}, '', '/study?tab=staff');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          studies: [
            {
              id: 'Dfi3NpRE',
              name: 'Secret in the Tangerine',
              description: 'Archive transcription',
              visibility: 'public',
              chapterCount: 3,
              chapterNames: ['The first game', 'The second game'],
              updatedAt: '2026-07-23T12:00:00.000Z',
              owner: { handle: 'mistboard', displayName: 'mistboard' },
              likeCount: 4,
            },
          ],
        }),
      ),
    );
    const root = document.createElement('div');
    document.body.append(root);

    mountStudyIndex(root);

    await vi.waitFor(() =>
      expect(root.querySelector('.study-index__chapter')?.textContent).toBe('The first game'),
    );
    expect(root.querySelector('.study-index__chapter--more')?.textContent).toBe('+1 more');
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
