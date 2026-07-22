// Curated video library at /videos, lichess.org/video style: a filterable grid
// of verified English-first xiangqi videos. External (YouTube) cards link out in
// a new tab instead of embedding: the dev server is cross-origin isolated
// site-wide (COEP credentialless in vite.config.ts), which blocks YouTube
// iframes (the embed document sends no COEP), while no-cors thumbnail <img> loads
// are exactly what credentialless permits. Link-out behaves identically in dev
// and prod; revisit lazy embeds only if the dev header scoping changes.
//
// The catalog filters on three axes (topic / level / game) plus a source filter,
// and sorts by recency or length. Watch URL and thumbnail are derived per
// `source` so first-party Mistboard videos render alongside YouTube ones.

import './videos.css';

import { t } from './i18n/catalog.js';
import { currentLocale, type Locale } from './i18n/locale.js';
import { buildNav } from './site-shell.js';
import {
  VIDEO_LEVELS,
  VIDEO_TAGS,
  VIDEOS,
  type VideoEntry,
  type VideoLevel,
  type VideoSource,
  type VideoTag,
  type VideoVariant,
  videoKey,
} from './videos-data.js';

const TAG_LABEL_KEYS: Record<VideoTag, `videos.tag.${VideoTag}`> = {
  basics: 'videos.tag.basics',
  openings: 'videos.tag.openings',
  tactics: 'videos.tag.tactics',
  endgames: 'videos.tag.endgames',
  strategy: 'videos.tag.strategy',
  games: 'videos.tag.games',
  culture: 'videos.tag.culture',
};

const LEVEL_LABEL_KEYS: Record<VideoLevel, `videos.level.${VideoLevel}`> = {
  intro: 'videos.level.intro',
  intermediate: 'videos.level.intermediate',
  advanced: 'videos.level.advanced',
};

const VARIANT_LABEL_KEYS: Record<VideoVariant, `videos.variant.${VideoVariant}`> = {
  xiangqi: 'videos.variant.xiangqi',
  fog: 'videos.variant.fog',
};

export type VideoSort = 'newest' | 'longest' | 'shortest';

const SORT_OPTIONS: readonly VideoSort[] = ['newest', 'longest', 'shortest'];

const SORT_LABEL_KEYS: Record<VideoSort, `videos.sort.${VideoSort}`> = {
  newest: 'videos.sort.newest',
  longest: 'videos.sort.longest',
  shortest: 'videos.sort.shortest',
};

export interface VideoFilters {
  tags: ReadonlySet<VideoTag>;
  levels: ReadonlySet<VideoLevel>;
  variants: ReadonlySet<VideoVariant>;
  sources: ReadonlySet<VideoSource>;
  query: string;
}

// The card links out (YouTube) or in (first-party). Both URL and thumbnail are
// derived per source; the exhaustive switch has no default, so adding a source
// to the union is a compile error here until it is handled (fail-closed).
export function videoWatchUrl(video: VideoEntry): string {
  switch (video.source) {
    case 'youtube':
      return `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;
    case 'mistboard':
      return video.url;
  }
}

export function videoThumbUrl(video: VideoEntry): string {
  switch (video.source) {
    case 'youtube':
      // no-cors image load: fine under dev's COEP credentialless and in prod
      // (where /videos carries no COEP at all). hqdefault ships 4:3 letterboxed.
      return `https://img.youtube.com/vi/${encodeURIComponent(video.id)}/hqdefault.jpg`;
    case 'mistboard':
      return video.thumbnailUrl;
  }
}

export function mountVideos(root: HTMLElement): void {
  const locale = currentLocale();
  document.title = `${t('videos.heading', {}, locale)} · Mistboard`;
  root.replaceChildren();
  root.classList.add('landing-page', 'videos-route');
  root.append(buildNav(locale), buildVideosPage(locale));
}

export function buildVideosPage(locale: Locale = currentLocale()): HTMLElement {
  const section = document.createElement('section');
  section.className = 'site-section videos-page';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = t('videos.heading', {}, locale);

  const intro = document.createElement('p');
  intro.className = 'videos-intro';
  intro.textContent = t('videos.intro', {}, locale);

  // Which facet options actually exist in the data. Level always spans its full
  // ordered set; variant and source facets render only when they discriminate
  // (more than one variant present / any first-party video present), so the page
  // never shows a dead single-option facet.
  const presentVariants = presentVideoVariants();
  const presentSources = presentVideoSources();

  const controls = document.createElement('div');
  controls.className = 'videos-controls';

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'videos-search';
  search.placeholder = t('videos.searchPlaceholder', {}, locale);
  search.setAttribute('aria-label', t('videos.searchLabel', {}, locale));

  const sortWrap = document.createElement('label');
  sortWrap.className = 'videos-sort';
  const sortText = document.createElement('span');
  sortText.className = 'videos-sort-label';
  sortText.textContent = t('videos.sortLabel', {}, locale);
  const sortSelect = document.createElement('select');
  sortSelect.className = 'videos-sort-select';
  for (const option of SORT_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = option;
    opt.textContent = t(SORT_LABEL_KEYS[option], {}, locale);
    sortSelect.append(opt);
  }
  sortWrap.append(sortText, sortSelect);
  controls.append(search, sortWrap);

  const facets = document.createElement('div');
  facets.className = 'videos-facets';

  const state: {
    tags: Set<VideoTag>;
    levels: Set<VideoLevel>;
    variants: Set<VideoVariant>;
    sources: Set<VideoSource>;
    query: string;
    sort: VideoSort;
  } = {
    tags: new Set(),
    levels: new Set(),
    variants: new Set(),
    sources: new Set(),
    query: '',
    sort: 'newest',
  };

  const groups: Array<() => void> = [];

  const topicGroup = buildChipGroup({
    labelText: t('videos.topicLabel', {}, locale),
    allLabel: t('videos.allTag', {}, locale),
    values: VIDEO_TAGS,
    optionLabel: (tag) => t(TAG_LABEL_KEYS[tag], {}, locale),
    selected: state.tags,
    onChange: apply,
  });
  facets.append(topicGroup.row);
  groups.push(topicGroup.sync);

  const levelGroup = buildChipGroup({
    labelText: t('videos.levelLabel', {}, locale),
    allLabel: t('videos.allTag', {}, locale),
    values: VIDEO_LEVELS,
    optionLabel: (level) => t(LEVEL_LABEL_KEYS[level], {}, locale),
    selected: state.levels,
    onChange: apply,
  });
  facets.append(levelGroup.row);
  groups.push(levelGroup.sync);

  if (presentVariants.length > 1) {
    const variantGroup = buildChipGroup({
      labelText: t('videos.variantLabel', {}, locale),
      allLabel: t('videos.allTag', {}, locale),
      values: presentVariants,
      optionLabel: (variant) => t(VARIANT_LABEL_KEYS[variant], {}, locale),
      selected: state.variants,
      onChange: apply,
    });
    facets.append(variantGroup.row);
    groups.push(variantGroup.sync);
  }

  if (presentSources.includes('mistboard')) {
    const sourceGroup = buildChipGroup({
      labelText: t('videos.sourceLabel', {}, locale),
      allLabel: t('videos.allTag', {}, locale),
      values: ['mistboard'],
      optionLabel: () => t('videos.source.mistboard', {}, locale),
      selected: state.sources,
      onChange: apply,
    });
    facets.append(sourceGroup.row);
    groups.push(sourceGroup.sync);
  }

  const count = document.createElement('p');
  count.className = 'videos-count';
  count.setAttribute('aria-live', 'polite');

  const grid = document.createElement('ul');
  grid.className = 'videos-grid';

  const empty = document.createElement('p');
  empty.className = 'videos-empty';
  empty.textContent = t('videos.empty', {}, locale);
  empty.hidden = true;

  const note = document.createElement('p');
  note.className = 'videos-note';
  note.textContent = t('videos.opensOnYoutube', {}, locale);

  search.addEventListener('input', () => {
    state.query = search.value;
    apply();
  });
  sortSelect.addEventListener('change', () => {
    state.sort = (sortSelect.value as VideoSort) ?? 'newest';
    apply();
  });

  function apply(): void {
    const matches = sortVideos(
      filterVideos(VIDEOS, {
        tags: state.tags,
        levels: state.levels,
        variants: state.variants,
        sources: state.sources,
        query: state.query,
      }),
      state.sort,
    );
    for (const sync of groups) sync();
    count.textContent =
      matches.length === 1
        ? t('videos.countOne', {}, locale)
        : t('videos.count', { count: matches.length }, locale);
    grid.replaceChildren(...matches.map((video) => buildVideoCard(video, locale)));
    grid.hidden = matches.length === 0;
    empty.hidden = matches.length > 0;
  }

  apply();

  section.append(heading, intro, controls, facets, count, grid, empty, note);
  return section;
}

// Cross-axis AND, within-axis OR: a video shows if it matches at least one
// selected value in every axis that has a selection. The text query is a
// case-insensitive substring match on title + author.
export function filterVideos(videos: readonly VideoEntry[], filters: VideoFilters): VideoEntry[] {
  const needle = filters.query.trim().toLowerCase();
  return videos.filter((video) => {
    if (filters.tags.size > 0 && !video.tags.some((tag) => filters.tags.has(tag))) return false;
    if (filters.levels.size > 0 && !filters.levels.has(video.level)) return false;
    if (filters.variants.size > 0 && !filters.variants.has(video.variant)) return false;
    if (filters.sources.size > 0 && !filters.sources.has(video.source)) return false;
    if (needle === '') return true;
    return (
      video.title.toLowerCase().includes(needle) || video.author.toLowerCase().includes(needle)
    );
  });
}

// Newest first by default; length sorts push unknown-duration videos to the end.
// V8's stable sort preserves the editorial array order within a tie (same date).
export function sortVideos(videos: readonly VideoEntry[], sort: VideoSort): VideoEntry[] {
  const list = [...videos];
  switch (sort) {
    case 'newest':
      return list.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    case 'longest':
      return list.sort((a, b) => (b.durationMinutes ?? -1) - (a.durationMinutes ?? -1));
    case 'shortest':
      return list.sort((a, b) => (a.durationMinutes ?? Infinity) - (b.durationMinutes ?? Infinity));
  }
}

function presentVideoVariants(): VideoVariant[] {
  const seen = new Set<VideoVariant>();
  for (const video of VIDEOS) seen.add(video.variant);
  // Stable, meaningful order rather than insertion order.
  return (['xiangqi', 'fog'] as const).filter((variant) => seen.has(variant));
}

function presentVideoSources(): VideoSource[] {
  const seen = new Set<VideoSource>();
  for (const video of VIDEOS) seen.add(video.source);
  return (['youtube', 'mistboard'] as const).filter((source) => seen.has(source));
}

interface ChipGroupOptions<T extends string> {
  labelText: string;
  allLabel: string;
  values: readonly T[];
  optionLabel: (value: T) => string;
  selected: Set<T>;
  onChange: () => void;
}

// A labelled facet row: an "All" chip that clears the selection plus one toggle
// chip per value. Returns the row element and a `sync` that reflects the current
// selection into aria-pressed after any change.
function buildChipGroup<T extends string>(
  options: ChipGroupOptions<T>,
): {
  row: HTMLElement;
  sync: () => void;
} {
  const row = document.createElement('div');
  row.className = 'videos-facet';

  const label = document.createElement('span');
  label.className = 'videos-facet-label';
  label.textContent = options.labelText;

  const chips = document.createElement('div');
  chips.className = 'videos-tags';
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', options.labelText);

  const allChip = buildChip(options.allLabel);
  allChip.dataset.value = 'all';
  allChip.addEventListener('click', () => {
    options.selected.clear();
    options.onChange();
  });
  chips.append(allChip);

  const chipByValue = new Map<T, HTMLButtonElement>();
  for (const value of options.values) {
    const chip = buildChip(options.optionLabel(value));
    chip.dataset.value = value;
    chip.addEventListener('click', () => {
      if (options.selected.has(value)) options.selected.delete(value);
      else options.selected.add(value);
      options.onChange();
    });
    chipByValue.set(value, chip);
    chips.append(chip);
  }

  row.append(label, chips);

  function sync(): void {
    allChip.setAttribute('aria-pressed', String(options.selected.size === 0));
    for (const [value, chip] of chipByValue) {
      chip.setAttribute('aria-pressed', String(options.selected.has(value)));
    }
  }

  return { row, sync };
}

function buildChip(label: string): HTMLButtonElement {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'videos-tag-chip';
  chip.textContent = label;
  chip.setAttribute('aria-pressed', 'false');
  return chip;
}

export function buildVideoCard(video: VideoEntry, locale: Locale = currentLocale()): HTMLElement {
  const item = document.createElement('li');
  item.className = 'videos-card';

  const link = document.createElement('a');
  link.className = 'videos-card-link';
  link.href = videoWatchUrl(video);
  if (video.source === 'youtube') {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }

  const thumb = document.createElement('span');
  thumb.className = 'videos-thumb';
  const img = document.createElement('img');
  img.src = videoThumbUrl(video);
  img.alt = '';
  img.loading = 'lazy';
  thumb.append(img);

  if (video.source === 'mistboard') {
    const badge = document.createElement('span');
    badge.className = 'videos-source-badge';
    badge.textContent = t('videos.badge.mistboard', {}, locale);
    thumb.append(badge);
  }

  const title = document.createElement('span');
  title.className = 'videos-card-title';
  title.textContent = video.title;

  const meta = document.createElement('span');
  meta.className = 'videos-card-meta';
  meta.textContent =
    video.durationMinutes === undefined
      ? video.author
      : `${video.author} · ${t('videos.duration', { count: video.durationMinutes }, locale)}`;

  const tags = document.createElement('span');
  tags.className = 'videos-card-tags';

  const levelBadge = document.createElement('span');
  levelBadge.className = 'videos-card-tag videos-card-level';
  levelBadge.textContent = t(LEVEL_LABEL_KEYS[video.level], {}, locale);
  tags.append(levelBadge);

  for (const tag of video.tags) {
    const badge = document.createElement('span');
    badge.className = 'videos-card-tag';
    badge.textContent = t(TAG_LABEL_KEYS[tag], {}, locale);
    tags.append(badge);
  }

  link.append(thumb, title, meta, tags);
  item.append(link);
  return item;
}

// ── Homepage video strip (band 3, beneath the blog row) ─────────────────────
// A curated front-door set, hand-picked like articles' HOME_ARTICLE_SLUGS. Order
// IS the editorial arc, and the carousel reveals it three cards at a time:
// 60-second hook -> full rules primer -> chess-player framing -> tactics ->
// openings -> endgames -> a title game -> culture. One slot per role: the earlier
// draft spent five of eight slots on near-duplicate "how to play" videos, which
// read as one repeated promise and hid the depth of the catalog behind it.
//
// Newest-first is deliberately NOT used here (it skews to dense game commentary).
// Keys are videoKey() values; an unknown key is dropped so a removed video never
// breaks the row. First-party Mistboard videos, once they exist, can be pinned
// here to lead the strip. Every id below was re-verified live against YouTube's
// oembed endpoint on 2026-07-22 (200 + exact title/author match).
const HOME_VIDEO_KEYS: readonly string[] = [
  'yt:qbbFuWyx0XI', // 60-second hook — Sam Copeland (a name chess players know)
  'yt:kSL7JErRMx8', // Full rules primer — AncientChess
  'yt:vklqOLf6mtU', // A Chess Player's Guide to Xiangqi — the conversion framing
  'yt:950nyyjOirU', // Basic checkmate strategies — the first step past the rules
  'yt:MyLXgkL4C5A', // The Most Popular Openings in Xiangqi
  'yt:dmSDt1VQNfs', // Endgame compositions — ties to the classical PD study corpus
  'yt:uF3-KrlXprE', // 2023 World Championship final — the aspirational ceiling
  'yt:gkD29aQW3Vw', // The Four Types of Chinese Chess Players — culture
];

// Builds the homepage video carousel: the same `.landing-carousel` structure the
// blog strip uses (so initLandingCarousel drives it), filled with compact video
// cards. Returns null when none of the curated keys resolve (row is omitted).
export function buildHomeVideoCards(
  limit = 8,
  locale: Locale = currentLocale(),
): HTMLElement | null {
  const byKey = new Map(VIDEOS.map((video) => [videoKey(video), video]));
  const picks = HOME_VIDEO_KEYS.flatMap((key) => {
    const video = byKey.get(key);
    return video ? [video] : [];
  }).slice(0, limit);
  if (picks.length === 0) return null;

  const section = document.createElement('section');
  section.className = 'landing-videos';
  section.setAttribute('aria-label', t('videos.heading', {}, locale));

  const carousel = document.createElement('div');
  carousel.className = 'landing-carousel';

  const track = document.createElement('div');
  track.className = 'landing-carousel-track';
  for (const video of picks) track.append(landingVideoCard(video, locale));

  const prev = homeVideoNavButton('prev', '‹', locale);
  const next = homeVideoNavButton('next', '›', locale);

  carousel.append(prev, track, next);
  section.append(carousel);
  return section;
}

function homeVideoNavButton(
  dir: 'prev' | 'next',
  glyph: string,
  locale: Locale,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `landing-carousel-nav landing-carousel-nav-${dir}`;
  button.setAttribute(
    'aria-label',
    t(dir === 'prev' ? 'videos.previousVideos' : 'videos.moreVideos', {}, locale),
  );
  button.textContent = glyph;
  return button;
}

// Compact home card: reuses the blog card's base classes (border/hover/title
// clamp) so the two strips stay in visual lockstep, and adds a 16:9 photographic
// thumbnail with a play glyph + duration/source pills — the cues that read
// "video" at a glance next to the blog strip's board-diagram thumbnails.
function landingVideoCard(video: VideoEntry, locale: Locale): HTMLElement {
  const link = document.createElement('a');
  link.className = 'landing-article-card landing-video-card';
  link.dataset.cardKind = 'video';
  link.href = videoWatchUrl(video);
  if (video.source === 'youtube') {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }

  const thumb = document.createElement('div');
  thumb.className = 'landing-article-card-thumb landing-video-card-thumb';

  const img = document.createElement('img');
  img.className = 'landing-video-card-img';
  img.src = videoThumbUrl(video);
  img.alt = '';
  img.loading = 'lazy';
  thumb.append(img);

  const play = document.createElement('span');
  play.className = 'landing-video-card-play';
  play.setAttribute('aria-hidden', 'true');
  play.textContent = '▶';
  thumb.append(play);

  if (video.durationMinutes !== undefined) {
    const duration = document.createElement('span');
    duration.className = 'landing-video-card-duration';
    duration.textContent = t('videos.duration', { count: video.durationMinutes }, locale);
    thumb.append(duration);
  }

  if (video.source === 'mistboard') {
    const badge = document.createElement('span');
    badge.className = 'landing-video-card-badge';
    badge.textContent = t('videos.badge.mistboard', {}, locale);
    thumb.append(badge);
  }

  const title = document.createElement('strong');
  title.className = 'landing-article-card-title landing-video-card-title';
  title.textContent = video.title;

  const meta = document.createElement('span');
  meta.className = 'landing-video-card-meta';
  meta.textContent = video.author;

  link.append(thumb, title, meta);
  return link;
}
