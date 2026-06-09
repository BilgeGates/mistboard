import './landing-announcements.css';
import { type Announcement, announcements } from './announcements.js';
import { renderArticleThumbnail } from './articles.js';
import { findArticle } from './articles-data.js';

export function buildLandingAnnouncements(): HTMLElement {
  const panel = document.createElement('aside');
  panel.className = 'landing-announcements';
  panel.setAttribute('aria-label', 'Announcements');

  const heading = document.createElement('h2');
  heading.className = 'landing-announcements-heading';
  heading.textContent = 'Announcements';
  panel.append(heading);

  const entries = announcements();
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'landing-announcements-empty';
    empty.textContent = 'Nothing new yet.';
    panel.append(empty);
    return panel;
  }

  const list = document.createElement('ol');
  list.className = 'landing-announcements-list';

  const ordered = [...entries].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (b.pinned && !a.pinned) return 1;
    return b.date.localeCompare(a.date);
  });

  const MAX_VISIBLE = 3;
  const visible = ordered.slice(0, MAX_VISIBLE);
  const overflow = ordered.length - visible.length;

  for (const entry of visible) {
    list.append(renderAnnouncementCard(entry));
  }

  panel.append(list);

  if (overflow > 0) {
    const more = document.createElement('a');
    more.className = 'landing-announcements-more';
    more.href = '/articles';
    const label = document.createElement('span');
    label.textContent = 'View all announcements';
    const arrow = document.createElement('span');
    arrow.className = 'landing-announcements-more-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    more.append(label, arrow);
    panel.append(more);
  }

  return panel;
}

function renderAnnouncementCard(entry: Announcement): HTMLElement {
  const item = document.createElement('li');
  item.className = 'landing-announcement-card';
  item.classList.add(`is-${entry.kind}`);
  if (entry.pinned) item.classList.add('is-pinned');

  const isExternal = !!entry.href && /^https?:/.test(entry.href);

  const container = document.createElement(entry.href ? 'a' : 'div');
  container.className = 'landing-announcement-card-inner';
  if (entry.href && container instanceof HTMLAnchorElement) {
    container.href = entry.href;
    if (isExternal) {
      container.target = '_blank';
      container.rel = 'noopener noreferrer';
    }
    item.classList.add('is-clickable');
  }

  let thumbEl: HTMLElement | null = null;
  if (entry.kind === 'article' && entry.href) {
    const match = entry.href.match(/^\/articles\/([^/?#]+)/);
    const article = match ? findArticle(match[1]!) : undefined;
    if (article?.thumbnail) {
      thumbEl = renderArticleThumbnail(article.thumbnail);
      thumbEl.classList.add('landing-announcement-thumb');
      container.classList.add('has-thumb');
    }
  }

  const header = document.createElement('div');
  header.className = 'landing-announcement-meta';

  const kind = document.createElement('span');
  kind.className = `landing-announcement-kind kind-${entry.kind}`;
  kind.textContent = announcementKindLabel(entry.kind);
  header.append(kind);

  if (entry.date) {
    const sep = document.createElement('span');
    sep.className = 'landing-announcement-meta-sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = '·';
    header.append(sep);

    const date = document.createElement('time');
    date.className = 'landing-announcement-date';
    date.dateTime = entry.date;
    date.textContent = formatAnnouncementDate(entry.date);
    header.append(date);
  }

  const headline = document.createElement('p');
  headline.className = 'landing-announcement-headline';
  headline.textContent = entry.headline;

  if (thumbEl) {
    const top = document.createElement('div');
    top.className = 'landing-announcement-top';
    const topText = document.createElement('div');
    topText.className = 'landing-announcement-top-text';
    topText.append(header, headline);
    top.append(thumbEl, topText);
    container.append(top);
  } else {
    container.append(header, headline);
  }

  if (entry.body) {
    const body = document.createElement('p');
    body.className = 'landing-announcement-body';
    body.textContent = entry.body;
    container.append(body);
  }

  if (entry.href) {
    const cta = document.createElement('span');
    cta.className = 'landing-announcement-cta';
    const label = document.createElement('span');
    label.className = 'landing-announcement-cta-label';
    label.textContent = entry.cta ?? announcementCtaLabel(entry.kind);
    const arrow = document.createElement('span');
    arrow.className = 'landing-announcement-cta-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = isExternal ? '↗' : '→';
    cta.append(label, arrow);
    container.append(cta);
  }

  item.append(container);
  return item;
}

function announcementKindLabel(kind: Announcement['kind']): string {
  switch (kind) {
    case 'status':
      return 'Status';
    case 'article':
      return 'Article';
    case 'release':
      return 'Release';
    case 'update':
      return 'Update';
  }
}

function announcementCtaLabel(kind: Announcement['kind']): string {
  switch (kind) {
    case 'status':
      return 'Learn more';
    case 'article':
      return 'Read article';
    case 'release':
      return 'See what shipped';
    case 'update':
      return 'Read update';
  }
}

function formatAnnouncementDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
