import { describe, expect, it } from 'vitest';
import { buildVideosPage, filterVideos, mountVideos } from './videos.js';
import { VIDEO_TAGS, VIDEOS, type VideoTag } from './videos-data.js';

function mount(): HTMLElement {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  mountVideos(root);
  return root;
}

function visibleTitles(root: HTMLElement): string[] {
  return [...root.querySelectorAll('.videos-card-title')].map((el) => el.textContent ?? '');
}

describe('videos data', () => {
  it('holds verified, well-formed entries', () => {
    expect(VIDEOS.length).toBeGreaterThanOrEqual(12);
    for (const video of VIDEOS) {
      expect(video.id).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(video.title.trim()).not.toBe('');
      expect(video.author.trim()).not.toBe('');
      expect(video.language).toBe('en');
      expect(video.tags.length).toBeGreaterThan(0);
      for (const tag of video.tags) expect(VIDEO_TAGS).toContain(tag);
    }
    expect(new Set(VIDEOS.map((video) => video.id)).size).toBe(VIDEOS.length);
  });

  it('covers every tag with at least one entry', () => {
    for (const tag of VIDEO_TAGS) {
      expect(VIDEOS.some((video) => video.tags.includes(tag))).toBe(true);
    }
  });
});

describe('videos page', () => {
  it('renders every curated entry as an outbound YouTube card', () => {
    const root = mount();

    const cards = root.querySelectorAll<HTMLAnchorElement>('.videos-card-link');
    expect(cards.length).toBe(VIDEOS.length);
    expect(root.querySelector('.videos-count')?.textContent).toBe(`${VIDEOS.length} videos`);

    const first = cards[0];
    if (!first) throw new Error('missing video card');
    expect(first.href).toBe(`https://www.youtube.com/watch?v=${VIDEOS[0]?.id}`);
    expect(first.target).toBe('_blank');
    expect(first.rel).toBe('noopener noreferrer');
    expect(first.querySelector('img')?.src).toBe(
      `https://img.youtube.com/vi/${VIDEOS[0]?.id}/hqdefault.jpg`,
    );
    expect(root.querySelector('.videos-empty')?.hasAttribute('hidden')).toBe(true);
  });

  it('narrows to entries carrying a toggled tag and restores on untoggle', () => {
    const root = mount();
    const chip = root.querySelector<HTMLButtonElement>('.videos-tag-chip[data-tag="openings"]');
    if (!chip) throw new Error('missing openings chip');

    chip.click();

    const expected = VIDEOS.filter((video) => video.tags.includes('openings'));
    expect(root.querySelectorAll('.videos-card-link').length).toBe(expected.length);
    expect(visibleTitles(root)).toEqual(expected.map((video) => video.title));
    expect(chip.getAttribute('aria-pressed')).toBe('true');

    chip.click();

    expect(root.querySelectorAll('.videos-card-link').length).toBe(VIDEOS.length);
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  it('resets tag filters via the All chip', () => {
    const root = mount();
    root.querySelector<HTMLButtonElement>('.videos-tag-chip[data-tag="endgames"]')?.click();
    expect(root.querySelectorAll('.videos-card-link').length).toBeLessThan(VIDEOS.length);

    root.querySelector<HTMLButtonElement>('.videos-tag-chip[data-tag="all"]')?.click();

    expect(root.querySelectorAll('.videos-card-link').length).toBe(VIDEOS.length);
  });

  it('narrows by text across title and author, case-insensitively', () => {
    const root = mount();
    const search = root.querySelector<HTMLInputElement>('.videos-search');
    if (!search) throw new Error('missing search input');

    search.value = 'CHECKMATE';
    search.dispatchEvent(new Event('input'));

    const expected = VIDEOS.filter((video) => video.title.toLowerCase().includes('checkmate'));
    expect(expected.length).toBeGreaterThan(0);
    expect(visibleTitles(root)).toEqual(expected.map((video) => video.title));

    search.value = 'learning chinese chess';
    search.dispatchEvent(new Event('input'));

    const byAuthor = VIDEOS.filter((video) =>
      `${video.title} ${video.author}`.toLowerCase().includes('learning chinese chess'),
    );
    expect(root.querySelectorAll('.videos-card-link').length).toBe(byAuthor.length);
  });

  it('shows the empty state when no entry matches', () => {
    const root = mount();
    const search = root.querySelector<HTMLInputElement>('.videos-search');
    if (!search) throw new Error('missing search input');

    search.value = 'zzzz-no-match';
    search.dispatchEvent(new Event('input'));

    expect(root.querySelectorAll('.videos-card-link').length).toBe(0);
    expect(root.querySelector('.videos-count')?.textContent).toBe('0 videos');
    expect(root.querySelector('.videos-empty')?.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('.videos-empty')?.textContent).toBe('No videos match your filters.');
  });

  it('localizes page chrome for zh-Hant', () => {
    const page = buildVideosPage('zh-Hant');

    expect(page.querySelector('.site-section-heading')?.textContent).toBe('影片庫');
    expect(page.querySelector('.videos-empty')?.textContent).toBe('沒有符合篩選條件的影片。');
    expect(page.querySelector('.videos-tag-chip[data-tag="all"]')?.textContent).toBe('全部');
  });
});

describe('filterVideos', () => {
  it('treats selected tags as OR and trims the query', () => {
    const selected: ReadonlySet<VideoTag> = new Set(['openings', 'endgames']);
    const matches = filterVideos(VIDEOS, selected, '  ');
    const expected = VIDEOS.filter((video) =>
      video.tags.some((tag) => tag === 'openings' || tag === 'endgames'),
    );
    expect(matches).toEqual(expected);
  });
});
