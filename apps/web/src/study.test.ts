import { afterEach, describe, expect, it, vi } from 'vitest';
import { chapterIdFromStudyPath, mountStudy, studyChapterPath } from './study.js';

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
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
