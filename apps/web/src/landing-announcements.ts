import './landing-announcements.css';
import { type Announcement, announcements } from './announcements.js';
import { t } from './i18n/catalog.js';
import { currentLocale, LOCALE_META, type Locale, localizedHref } from './i18n/locale.js';
import { buildUiIcon, uiIconForAnnouncementKind } from './ui-icon.js';
import { rulesHrefPublicSurfaceEnabled } from './variant-public-surfaces.js';

// All announcements render as one dated News feed box (lichess lobby__feed
// grammar); the full history lives at /feed. Row count is sized to fill
// --landing-lower-widget-height without forcing a scroll.
const MAX_FEED_ROWS = 3;
const ANNOUNCEMENT_KIND_META: Record<
  Announcement['kind'],
  { label: string; futureDobutsuSlot: 'announcement-a' | 'announcement-b' | null }
> = {
  release: {
    label: 'Release',
    futureDobutsuSlot: 'announcement-a',
  },
  status: {
    label: 'Status',
    futureDobutsuSlot: 'announcement-b',
  },
  article: {
    label: 'Article',
    futureDobutsuSlot: 'announcement-b',
  },
  update: {
    label: 'Update',
    futureDobutsuSlot: 'announcement-a',
  },
};

export function buildLandingAnnouncements(locale: Locale = currentLocale()): HTMLElement {
  const panel = document.createElement('aside');
  panel.className = 'landing-announcements landing-news-feed';
  panel.setAttribute('aria-label', t('news.heading', {}, locale));

  const entries = announcements();
  if (entries.length === 0) return panel;

  const ordered = entries
    .filter((entry) => rulesHrefPublicSurfaceEnabled(entry.href))
    .sort((a, b) => b.date.localeCompare(a.date));
  const updates = document.createElement('div');
  updates.className = 'landing-news-updates';
  for (const entry of ordered.slice(0, MAX_FEED_ROWS)) {
    updates.append(renderFeedEntry(entry, locale));
  }
  updates.append(renderAllUpdates(locale));
  panel.append(updates);

  return panel;
}

function renderFeedEntry(entry: Announcement, locale: Locale): HTMLElement {
  const kindMeta = ANNOUNCEMENT_KIND_META[entry.kind];
  const row = document.createElement('article');
  row.className = `landing-news-update landing-news-update-${entry.kind}`;
  row.dataset.announcementKind = entry.kind;

  const marker = document.createElement('span');
  marker.className = `landing-news-marker landing-news-marker-${entry.kind} landing-news-marker-dobutsu`;
  marker.dataset.announcementKind = entry.kind;
  marker.dataset.futureDobutsuSlot = kindMeta.futureDobutsuSlot ?? '';
  marker.title = kindMeta.label;
  marker.setAttribute('aria-hidden', 'true');
  marker.append(buildUiIcon(uiIconForAnnouncementKind(entry.kind), 'landing-news-marker-icon'));

  const content = document.createElement('div');
  content.className = 'landing-news-content';

  const date = document.createElement('time');
  date.className = 'landing-news-date';
  date.dateTime = entry.date;
  date.textContent = formatAnnouncementRelativeDate(entry.date, locale);
  date.title = formatAnnouncementDate(entry.date, true, locale);

  const body = document.createElement('p');
  body.className = 'landing-news-body';
  body.append(document.createTextNode(entry.headline));
  if (entry.body) {
    body.append(document.createTextNode(` ${entry.body}`));
  }
  content.append(date, body);
  if (entry.href) {
    const cta = document.createElement('a');
    cta.className = 'landing-news-link';
    cta.href = /^https?:/.test(entry.href) ? entry.href : localizedHref(entry.href, locale);
    if (/^https?:/.test(entry.href)) {
      cta.target = '_blank';
      cta.rel = 'noopener noreferrer';
    }
    cta.textContent = ctaLabel(entry, locale);
    body.append(document.createTextNode(' '), cta, document.createTextNode('.'));
  }

  row.append(marker, content);
  return row;
}

function renderAllUpdates(locale: Locale): HTMLElement {
  const row = document.createElement('article');
  row.className = 'landing-news-update landing-news-update-all';
  const marker = document.createElement('span');
  marker.className = 'landing-news-marker landing-news-marker-all';
  marker.setAttribute('aria-hidden', 'true');
  marker.textContent = '☆';
  const link = document.createElement('a');
  link.className = 'landing-news-date landing-news-all-link';
  link.href = localizedHref('/feed', locale);
  link.textContent = t('news.allUpdates', {}, locale);
  row.append(marker, link);
  return row;
}

function ctaLabel(entry: Announcement, locale: Locale): string {
  switch (entry.cta) {
    case 'Read rules':
      return t('news.readRules', {}, locale);
    case 'Study the rules':
      return t('news.studyRules', {}, locale);
    case 'Send feedback':
      return t('news.sendFeedback', {}, locale);
    case 'Play the engine':
      return t('news.playEngine', {}, locale);
    default:
      return entry.cta ?? t('news.readMore', {}, locale);
  }
}

function formatAnnouncementRelativeDate(iso: string, locale: Locale): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  const then = Date.UTC(year, month - 1, day);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((then - today) / 86_400_000);
  if (days > -7 && days <= 0) {
    return new Intl.RelativeTimeFormat(LOCALE_META[locale].dateLocale, {
      numeric: 'auto',
    }).format(days, 'day');
  }
  return formatAnnouncementDate(iso, false, locale);
}

export function formatAnnouncementDate(
  iso: string,
  withYear = false,
  locale: Locale = currentLocale(),
): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString(LOCALE_META[locale].dateLocale, {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}
