import { describe, expect, it } from 'vitest';
import {
  buildHomeVideoCards,
  buildVideoCard,
  buildVideosPage,
  filterVideos,
  mountVideos,
  sortVideos,
  type VideoFilters,
  videoThumbUrl,
  videoWatchUrl,
} from './videos.js';
import {
  VIDEO_LEVELS,
  VIDEO_TAGS,
  VIDEOS,
  type VideoEntry,
  type VideoLevel,
  type VideoTag,
  type VideoVariant,
  videoKey,
} from './videos-data.js';

function mount(): HTMLElement {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  mountVideos(root);
  return root;
}

function visibleTitles(root: HTMLElement): string[] {
  return [...root.querySelectorAll('.videos-card-title')].map((el) => el.textContent ?? '');
}

function facetRow(root: HTMLElement, label: string): HTMLElement {
  const row = [...root.querySelectorAll<HTMLElement>('.videos-facet')].find(
    (el) => el.querySelector('.videos-facet-label')?.textContent === label,
  );
  if (!row) throw new Error(`missing facet row: ${label}`);
  return row;
}

function chip(root: HTMLElement, facetLabel: string, value: string): HTMLButtonElement {
  const el = facetRow(root, facetLabel).querySelector<HTMLButtonElement>(
    `.videos-tag-chip[data-value="${value}"]`,
  );
  if (!el) throw new Error(`missing chip ${facetLabel}/${value}`);
  return el;
}

function noFilter(query = ''): VideoFilters {
  return {
    tags: new Set(),
    levels: new Set(),
    variants: new Set(),
    sources: new Set(),
    query,
  };
}

const MISTBOARD_FIXTURE: VideoEntry = {
  source: 'mistboard',
  slug: 'first-fog-game',
  url: '/video/first-fog-game',
  thumbnailUrl: '/img/videos/first-fog-game.jpg',
  title: 'Your first Fog of War game',
  author: 'Mistboard',
  tags: ['basics'],
  level: 'intro',
  variant: 'fog',
  language: 'en',
  addedAt: '2026-07-21',
};

describe('videos data', () => {
  it('holds verified, well-formed entries', () => {
    expect(VIDEOS.length).toBeGreaterThanOrEqual(12);
    for (const video of VIDEOS) {
      expect(video.title.trim()).not.toBe('');
      expect(video.author.trim()).not.toBe('');
      expect(video.language).toBe('en');
      expect(video.tags.length).toBeGreaterThan(0);
      for (const tag of video.tags) expect(VIDEO_TAGS).toContain(tag);
      expect(VIDEO_LEVELS).toContain(video.level);
      expect(['xiangqi', 'fog']).toContain(video.variant);
      if (video.source === 'youtube') expect(video.id).toMatch(/^[A-Za-z0-9_-]{11}$/);
      else {
        expect(video.slug.trim()).not.toBe('');
        expect(video.url.trim()).not.toBe('');
        expect(video.thumbnailUrl.trim()).not.toBe('');
      }
    }
    // Keys are unique across sources.
    expect(new Set(VIDEOS.map(videoKey)).size).toBe(VIDEOS.length);
  });

  it('covers every topic tag and difficulty level with at least one entry', () => {
    for (const tag of VIDEO_TAGS) {
      expect(VIDEOS.some((video) => video.tags.includes(tag))).toBe(true);
    }
    for (const level of VIDEO_LEVELS) {
      expect(VIDEOS.some((video) => video.level === level)).toBe(true);
    }
  });
});

describe('source-dispatched watch + thumbnail', () => {
  it('derives YouTube URLs from the id', () => {
    const yt = VIDEOS.find((v) => v.source === 'youtube');
    if (!yt || yt.source !== 'youtube') throw new Error('expected a youtube video');
    expect(videoWatchUrl(yt)).toBe(`https://www.youtube.com/watch?v=${yt.id}`);
    expect(videoThumbUrl(yt)).toBe(`https://img.youtube.com/vi/${yt.id}/hqdefault.jpg`);
  });

  it('uses the explicit URL + thumbnail for first-party videos', () => {
    expect(videoWatchUrl(MISTBOARD_FIXTURE)).toBe('/video/first-fog-game');
    expect(videoThumbUrl(MISTBOARD_FIXTURE)).toBe('/img/videos/first-fog-game.jpg');
  });
});

describe('video card', () => {
  it('renders a YouTube card as an outbound new-tab link', () => {
    const yt = VIDEOS.find((v) => v.source === 'youtube');
    if (!yt || yt.source !== 'youtube') throw new Error('expected a youtube video');
    const card = buildVideoCard(yt, 'en');
    const link = card.querySelector<HTMLAnchorElement>('.videos-card-link');
    expect(link?.getAttribute('href')).toBe(`https://www.youtube.com/watch?v=${yt.id}`);
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toBe('noopener noreferrer');
    expect(card.querySelector('.videos-source-badge')).toBeNull();
  });

  it('renders a first-party card as an internal link with a Mistboard badge', () => {
    const card = buildVideoCard(MISTBOARD_FIXTURE, 'en');
    const link = card.querySelector<HTMLAnchorElement>('.videos-card-link');
    expect(link?.getAttribute('href')).toBe('/video/first-fog-game');
    expect(link?.target).toBe('');
    expect(link?.getAttribute('rel')).toBeNull();
    expect(card.querySelector('.videos-source-badge')?.textContent).toBe('Mistboard');
    expect(card.querySelector('img')?.getAttribute('src')).toBe('/img/videos/first-fog-game.jpg');
  });

  it('leads the badge row with the difficulty level', () => {
    const yt = VIDEOS.find((v) => v.source === 'youtube');
    if (!yt) throw new Error('expected a video');
    const card = buildVideoCard(yt, 'en');
    expect(card.querySelector('.videos-card-tags .videos-card-tag')?.classList).toContain(
      'videos-card-level',
    );
  });
});

describe('videos page', () => {
  it('renders every curated entry, newest first by default', () => {
    const root = mount();
    const cards = root.querySelectorAll<HTMLAnchorElement>('.videos-card-link');
    expect(cards.length).toBe(VIDEOS.length);
    expect(root.querySelector('.videos-count')?.textContent).toBe(`${VIDEOS.length} videos`);
    expect(visibleTitles(root)).toEqual(sortVideos(VIDEOS, 'newest').map((v) => v.title));
    expect(root.querySelector('.videos-empty')?.hasAttribute('hidden')).toBe(true);
  });

  it('renders a level facet but no dead variant/source facets for homogeneous data', () => {
    const root = mount();
    // All current videos are xiangqi YouTube videos, so those facets stay hidden.
    expect(() => facetRow(root, 'Level')).not.toThrow();
    const labels = [...root.querySelectorAll('.videos-facet-label')].map((el) => el.textContent);
    expect(labels).toContain('Topic');
    expect(labels).toContain('Level');
    expect(labels).not.toContain('Game');
    expect(labels).not.toContain('Source');
    // Level facet exposes All + the three ordered levels.
    const levelChips = facetRow(root, 'Level').querySelectorAll('.videos-tag-chip');
    expect(levelChips.length).toBe(VIDEO_LEVELS.length + 1);
  });

  it('narrows by a toggled topic tag and restores on untoggle', () => {
    const root = mount();
    const openings = chip(root, 'Topic', 'openings');
    openings.click();
    const expected = VIDEOS.filter((v) => v.tags.includes('openings'));
    expect(root.querySelectorAll('.videos-card-link').length).toBe(expected.length);
    expect(openings.getAttribute('aria-pressed')).toBe('true');
    openings.click();
    expect(root.querySelectorAll('.videos-card-link').length).toBe(VIDEOS.length);
    expect(openings.getAttribute('aria-pressed')).toBe('false');
  });

  it('intersects across axes (topic AND level)', () => {
    const root = mount();
    chip(root, 'Topic', 'games').click();
    chip(root, 'Level', 'advanced').click();
    const expected = VIDEOS.filter((v) => v.tags.includes('games') && v.level === 'advanced');
    expect(expected.length).toBeGreaterThan(0);
    expect(root.querySelectorAll('.videos-card-link').length).toBe(expected.length);
  });

  it('resets a facet via its All chip', () => {
    const root = mount();
    chip(root, 'Level', 'intro').click();
    expect(root.querySelectorAll('.videos-card-link').length).toBeLessThan(VIDEOS.length);
    chip(root, 'Level', 'all').click();
    expect(root.querySelectorAll('.videos-card-link').length).toBe(VIDEOS.length);
  });

  it('narrows by text across title and author, case-insensitively', () => {
    const root = mount();
    const search = root.querySelector<HTMLInputElement>('.videos-search');
    if (!search) throw new Error('missing search input');
    search.value = 'CHECKMATE';
    search.dispatchEvent(new Event('input'));
    const expected = VIDEOS.filter((v) => v.title.toLowerCase().includes('checkmate'));
    expect(expected.length).toBeGreaterThan(0);
    expect(new Set(visibleTitles(root))).toEqual(new Set(expected.map((v) => v.title)));
  });

  it('reorders by the sort control', () => {
    const root = mount();
    const select = root.querySelector<HTMLSelectElement>('.videos-sort-select');
    if (!select) throw new Error('missing sort select');
    select.value = 'shortest';
    select.dispatchEvent(new Event('change'));
    expect(visibleTitles(root)).toEqual(sortVideos(VIDEOS, 'shortest').map((v) => v.title));
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
    const levelRow = [...page.querySelectorAll<HTMLElement>('.videos-facet')].find(
      (el) => el.querySelector('.videos-facet-label')?.textContent === '難度',
    );
    expect(levelRow).toBeDefined();
    expect(page.querySelector('.videos-sort-select option')?.textContent).toBe('最新');
  });
});

describe('buildHomeVideoCards', () => {
  it('builds a curated carousel of external video cards that open on YouTube', () => {
    const row = buildHomeVideoCards(8, 'en');
    expect(row).not.toBeNull();
    const cards = [...row!.querySelectorAll<HTMLAnchorElement>('.landing-video-card')];
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(8);
    // Reuses the blog carousel scaffold so initLandingCarousel drives it.
    expect(row!.querySelector('.landing-carousel-track')).not.toBeNull();
    expect(row!.querySelector('.landing-carousel-nav-prev')).not.toBeNull();
    for (const card of cards) {
      expect(card.dataset.cardKind).toBe('video');
      expect(card.href).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=/);
      expect(card.target).toBe('_blank');
      expect(card.rel).toBe('noopener noreferrer');
      // Every card carries a play affordance + a title.
      expect(card.querySelector('.landing-video-card-play')).not.toBeNull();
      expect(card.querySelector('.landing-video-card-title')?.textContent).toBeTruthy();
    }
  });

  it('honors the limit', () => {
    const row = buildHomeVideoCards(3, 'en');
    expect(row!.querySelectorAll('.landing-video-card').length).toBe(3);
  });

  it('only surfaces curated keys that resolve against the catalog', () => {
    const row = buildHomeVideoCards(8, 'en');
    const known = new Set(VIDEOS.map((video) => videoKey(video)));
    const hrefs = [...row!.querySelectorAll<HTMLAnchorElement>('.landing-video-card')].map(
      (card) => card.href,
    );
    // Each rendered card's watch URL corresponds to a real catalog video.
    for (const href of hrefs) {
      const id = new URL(href).searchParams.get('v');
      expect(known.has(`yt:${id}`)).toBe(true);
    }
  });
});

describe('filterVideos', () => {
  it('treats selected topics as OR and trims the query', () => {
    const filters: VideoFilters = {
      ...noFilter('  '),
      tags: new Set<VideoTag>(['openings', 'endgames']),
    };
    const matches = filterVideos(VIDEOS, filters);
    const expected = VIDEOS.filter((v) =>
      v.tags.some((tag) => tag === 'openings' || tag === 'endgames'),
    );
    expect(matches).toEqual(expected);
  });

  it('intersects tag, level, variant, and source selections', () => {
    const pool: readonly VideoEntry[] = [...VIDEOS, MISTBOARD_FIXTURE];
    const filters: VideoFilters = {
      tags: new Set<VideoTag>(['basics']),
      levels: new Set<VideoLevel>(['intro']),
      variants: new Set<VideoVariant>(['fog']),
      sources: new Set(['mistboard']),
      query: '',
    };
    expect(filterVideos(pool, filters)).toEqual([MISTBOARD_FIXTURE]);
  });
});
