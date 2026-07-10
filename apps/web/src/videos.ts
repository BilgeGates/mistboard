// Curated video library at /videos, lichess.org/video style: a filterable grid
// of verified English-first xiangqi videos. Cards link out to YouTube in a new
// tab instead of embedding: the dev server is cross-origin isolated site-wide
// (COEP credentialless in vite.config.ts), which blocks YouTube iframes (the
// embed document sends no COEP), while no-cors thumbnail <img> loads are
// exactly what credentialless permits. Link-out behaves identically in dev and
// prod; revisit lazy embeds only if the dev header scoping changes.

import './videos.css';

import { t } from './i18n/catalog.js';
import { currentLocale, type Locale } from './i18n/locale.js';
import { buildNav } from './site-shell.js';
import { VIDEO_TAGS, VIDEOS, type VideoEntry, type VideoTag } from './videos-data.js';

const TAG_LABEL_KEYS: Record<VideoTag, `videos.tag.${VideoTag}`> = {
  basics: 'videos.tag.basics',
  openings: 'videos.tag.openings',
  tactics: 'videos.tag.tactics',
  endgames: 'videos.tag.endgames',
  games: 'videos.tag.games',
  culture: 'videos.tag.culture',
};

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

  const controls = document.createElement('div');
  controls.className = 'videos-controls';

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'videos-search';
  search.placeholder = t('videos.searchPlaceholder', {}, locale);
  search.setAttribute('aria-label', t('videos.searchLabel', {}, locale));

  const chips = document.createElement('div');
  chips.className = 'videos-tags';
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', t('videos.filterLabel', {}, locale));

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

  const selectedTags = new Set<VideoTag>();
  let query = '';

  const allChip = buildChip(t('videos.allTag', {}, locale));
  allChip.dataset.tag = 'all';
  allChip.addEventListener('click', () => {
    selectedTags.clear();
    apply();
  });
  chips.append(allChip);

  const tagChips = new Map<VideoTag, HTMLButtonElement>();
  for (const tag of VIDEO_TAGS) {
    const chip = buildChip(t(TAG_LABEL_KEYS[tag], {}, locale));
    chip.dataset.tag = tag;
    chip.addEventListener('click', () => {
      if (selectedTags.has(tag)) selectedTags.delete(tag);
      else selectedTags.add(tag);
      apply();
    });
    tagChips.set(tag, chip);
    chips.append(chip);
  }

  search.addEventListener('input', () => {
    query = search.value;
    apply();
  });

  function apply(): void {
    const matches = filterVideos(VIDEOS, selectedTags, query);
    allChip.setAttribute('aria-pressed', String(selectedTags.size === 0));
    for (const [tag, chip] of tagChips) {
      chip.setAttribute('aria-pressed', String(selectedTags.has(tag)));
    }
    count.textContent =
      matches.length === 1
        ? t('videos.countOne', {}, locale)
        : t('videos.count', { count: matches.length }, locale);
    grid.replaceChildren(...matches.map((video) => buildVideoCard(video, locale)));
    grid.hidden = matches.length === 0;
    empty.hidden = matches.length > 0;
  }

  apply();

  controls.append(search, chips);
  section.append(heading, intro, controls, count, grid, empty, note);
  return section;
}

// Selected tags combine as OR (a video shows if it carries any selected tag):
// most entries carry a single tag, so AND intersection would dead-end fast.
// The text query is a case-insensitive substring match on title + author.
export function filterVideos(
  videos: readonly VideoEntry[],
  selectedTags: ReadonlySet<VideoTag>,
  query: string,
): VideoEntry[] {
  const needle = query.trim().toLowerCase();
  return videos.filter((video) => {
    if (selectedTags.size > 0 && !video.tags.some((tag) => selectedTags.has(tag))) return false;
    if (needle === '') return true;
    return (
      video.title.toLowerCase().includes(needle) || video.author.toLowerCase().includes(needle)
    );
  });
}

function buildChip(label: string): HTMLButtonElement {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'videos-tag-chip';
  chip.textContent = label;
  chip.setAttribute('aria-pressed', 'false');
  return chip;
}

function buildVideoCard(video: VideoEntry, locale: Locale): HTMLElement {
  const item = document.createElement('li');
  item.className = 'videos-card';

  const link = document.createElement('a');
  link.className = 'videos-card-link';
  link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  const thumb = document.createElement('span');
  thumb.className = 'videos-thumb';
  const img = document.createElement('img');
  // no-cors image load: fine under dev's COEP credentialless and in prod
  // (where /videos carries no COEP at all).
  img.src = `https://img.youtube.com/vi/${encodeURIComponent(video.id)}/hqdefault.jpg`;
  img.alt = '';
  img.loading = 'lazy';
  thumb.append(img);

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
