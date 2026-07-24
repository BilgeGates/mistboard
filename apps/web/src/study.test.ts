import { afterEach, describe, expect, it, vi } from 'vitest';
import { chapterIdFromStudyPath, mountStudy, studyChapterPath } from './study.js';
import { studyDraftKey } from './study-autosave.js';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  window.history.replaceState({}, '', '/');
});

describe('study creator workspace', () => {
  it('renders navigation-first owner controls and an under-board authoring dock', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url === '/api/studies/study1') {
          return jsonResponse({
            study: {
              id: 'study1',
              name: 'Cannon manual',
              description: 'Attacking patterns on the central file.',
              visibility: 'private',
              isOwner: true,
              likeCount: 0,
              likedByViewer: false,
            },
            chapters: [
              {
                id: 'chapter1',
                name: 'Central cannon',
                variant: 'xiangqi',
                orientation: 'red',
                root: { version: 1, root: { children: [] } },
                version: 1,
                gamebook: false,
              },
            ],
          });
        }
        if (url === '/api/chat/study/study1') return jsonResponse({ lines: [] });
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const root = document.createElement('div');
    document.body.append(root);

    mountStudy(root, 'study1');
    await vi.waitFor(() => expect(root.querySelector('.review-shell--study')).not.toBeNull());

    expect(root.querySelector('.study-chapters__head')?.textContent).toContain('1 Chapter');
    expect(root.querySelector('.study-chapters__settings')).not.toBeNull();
    expect(root.querySelector('.study-chapters__chapter-settings')).not.toBeNull();
    expect(root.querySelector('.study-chapters__add')).not.toBeNull();
    expect(root.querySelector('.study-actions__name')).toBeNull();
    expect(root.querySelector('.review-rail-main .annotation-editor')).toBeNull();

    const tabs = [...root.querySelectorAll<HTMLButtonElement>('.review-underboard-tab')];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'About',
      'Comment',
      'Glyphs',
      'Lesson',
      'Share & export',
    ]);

    root.querySelector<HTMLButtonElement>('.study-chapters__settings')?.click();
    const studyDialog = document.querySelector<HTMLDialogElement>(
      'dialog[data-study-dialog="study-settings"]',
    );
    expect(studyDialog).not.toBeNull();
    expect(studyDialog?.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe(
      'Cannon manual',
    );
    expect(studyDialog?.querySelector('textarea')?.value).toBe(
      'Attacking patterns on the central file.',
    );
    studyDialog?.close();

    root.querySelector<HTMLButtonElement>('.study-chapters__chapter-settings')?.click();
    const chapterDialog = document.querySelector<HTMLDialogElement>(
      'dialog[data-study-dialog="chapter-settings"]',
    );
    expect(chapterDialog).not.toBeNull();
    expect(chapterDialog?.textContent).toContain('Duplicate chapter');
    expect(chapterDialog?.textContent).not.toContain('Delete chapter');
  });

  it('lets an admin add a public study to Staff picks without owner controls', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/studies/study1') {
        return jsonResponse({
          study: {
            id: 'study1',
            name: 'Archive study',
            description: '',
            visibility: 'public',
            isOwner: false,
            featuredAt: null,
            canFeature: true,
            likeCount: 0,
            likedByViewer: false,
          },
          chapters: [
            {
              id: 'chapter1',
              name: 'First',
              variant: 'xiangqi',
              orientation: 'red',
              root: { version: 1, root: { children: [] } },
              version: 1,
              gamebook: false,
            },
          ],
        });
      }
      if (url === '/api/chat/study/study1') return jsonResponse({ lines: [] });
      if (url === '/api/admin/studies/study1/featured' && init?.method === 'PUT') {
        expect(JSON.parse(String(init.body))).toEqual({ featured: true });
        return jsonResponse({ featuredAt: '2026-07-24T04:00:00.000Z' });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const root = document.createElement('div');
    document.body.append(root);

    mountStudy(root, 'study1');
    await vi.waitFor(() => expect(root.querySelector('.review-shell--study')).not.toBeNull());

    expect(root.querySelector('.study-chapters__settings')).toBeNull();
    const feature = root.querySelector<HTMLButtonElement>('.study-chapters__featured');
    expect(feature?.getAttribute('aria-label')).toBe('Feature in Staff picks');
    feature?.click();

    await vi.waitFor(() => expect(feature?.getAttribute('aria-pressed')).toBe('true'));
    expect(feature?.getAttribute('aria-label')).toBe('Remove from Staff picks');
    expect(root.querySelector('.study-chapters__status')?.textContent).toBe('Featured');
  });
});

describe('study chapter permalinks', () => {
  it('preserves locale prefixes and rejects another study chapter path', () => {
    expect(studyChapterPath('study1', 'chapter2', '/zh-hans/study/study1')).toBe(
      '/zh-hans/study/study1/chapter2',
    );
    expect(studyChapterPath('study1', 'chapter2', '/study/study1')).toBe('/study/study1/chapter2');
    expect(chapterIdFromStudyPath('/study/study1/chapter2', 'study1')).toBe('chapter2');
    expect(chapterIdFromStudyPath('/study/other/chapter2', 'study1')).toBeNull();
  });

  it('opens a linked chapter and updates history when switching chapters', async () => {
    window.history.replaceState({}, '', '/study/study1/chapter2');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url === '/api/studies/study1') {
          return jsonResponse({
            study: {
              id: 'study1',
              name: 'Cannon manual',
              description: '',
              visibility: 'public',
              isOwner: false,
              likeCount: 0,
              likedByViewer: false,
            },
            chapters: [
              {
                id: 'chapter1',
                name: 'First',
                variant: 'xiangqi',
                orientation: 'red',
                root: { version: 1, root: { children: [] } },
                version: 1,
                gamebook: false,
              },
              {
                id: 'chapter2',
                name: 'Second',
                variant: 'xiangqi',
                orientation: 'red',
                root: { version: 1, root: { children: [] } },
                version: 1,
                gamebook: false,
              },
            ],
          });
        }
        if (url === '/api/chat/study/study1') return jsonResponse({ lines: [] });
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const root = document.createElement('div');
    document.body.append(root);

    mountStudy(root, 'study1', 'chapter2');
    await vi.waitFor(() =>
      expect(root.querySelector('.study-chapters__row.is-active')?.textContent).toContain('Second'),
    );
    root.querySelectorAll<HTMLAnchorElement>('.study-chapters__link')[0]?.click();
    await vi.waitFor(() => expect(window.location.pathname).toBe('/study/study1/chapter1'));
    await vi.waitFor(() =>
      expect(root.querySelector('.study-chapters__row.is-active')?.textContent).toContain('First'),
    );
  });

  it('flushes a recovered local draft before switching chapters or closing', async () => {
    const storage = memoryStorage();
    const pendingSave = deferred<Response>();
    storage.setItem(
      studyDraftKey('study1', 'chapter1'),
      JSON.stringify({
        schemaVersion: 1,
        baseVersion: 1,
        tree: {
          version: 1,
          root: { children: [{ uci: 'h2e2', children: [] }] },
        },
        updatedAt: 123,
      }),
    );
    vi.stubGlobal('localStorage', storage);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/studies/study1' && !init?.method) {
        return jsonResponse({
          study: {
            id: 'study1',
            name: 'Cannon manual',
            description: '',
            visibility: 'private',
            isOwner: true,
            likeCount: 0,
            likedByViewer: false,
          },
          chapters: [
            {
              id: 'chapter1',
              name: 'First',
              variant: 'xiangqi',
              orientation: 'red',
              root: { version: 1, root: { children: [] } },
              version: 1,
              gamebook: false,
            },
            {
              id: 'chapter2',
              name: 'Second',
              variant: 'xiangqi',
              orientation: 'red',
              root: { version: 1, root: { children: [] } },
              version: 1,
              gamebook: false,
            },
          ],
        });
      }
      if (url === '/api/chat/study/study1') return jsonResponse({ lines: [] });
      if (url === '/api/studies/study1/chapters/chapter1' && init?.method === 'PATCH') {
        return pendingSave.promise;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const root = document.createElement('div');
    document.body.append(root);

    mountStudy(root, 'study1', 'chapter1');
    await vi.waitFor(() => expect(root.querySelector('.review-shell--study')).not.toBeNull());
    expect(root.querySelector('.study-actions__status')?.textContent).toBe('Recovered local draft');

    root.querySelectorAll<HTMLAnchorElement>('.study-chapters__link')[1]?.click();
    await vi.waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        '/api/studies/study1/chapters/chapter1',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    expect(window.location.pathname).toBe('/study/study1/chapter1');
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    pendingSave.resolve(jsonResponse({ chapter: { version: 2 } }));
    await vi.waitFor(() => expect(window.location.pathname).toBe('/study/study1/chapter2'));
    expect(storage.getItem(studyDraftKey('study1', 'chapter1'))).toBeNull();
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
