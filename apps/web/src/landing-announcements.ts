import './landing-announcements.css';
import { type Announcement, announcements } from './announcements.js';
import { t } from './i18n/catalog.js';
import { currentLocale, LOCALE_META, type Locale, localizedHref } from './i18n/locale.js';
import { buildSiteBox } from './site-box.js';
import { rulesHrefPublicSurfaceEnabled } from './variant-public-surfaces.js';

// All announcements render as one dated News feed box (lichess lobby__feed
// grammar); the full history lives at /news.
const MAX_FEED_ROWS = 6;

export function buildLandingAnnouncements(locale: Locale = currentLocale()): HTMLElement {
  const panel = document.createElement('aside');
  panel.className = 'landing-announcements';
  panel.setAttribute('aria-label', t('news.heading', {}, locale));

  const entries = announcements();
  if (entries.length === 0) return panel;

  const news = buildSiteBox({
    title: t('news.heading', {}, locale),
    href: localizedHref('/news', locale),
    moreLabel: t('site.more', {}, locale),
    className: 'landing-news',
  });
  const ordered = entries
    .filter((entry) => rulesHrefPublicSurfaceEnabled(entry.href))
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const entry of ordered.slice(0, MAX_FEED_ROWS)) {
    news.body.append(renderFeedRow(entry, locale));
  }
  panel.append(news.box);

  return panel;
}

function renderFeedRow(entry: Announcement, locale: Locale): HTMLElement {
  const row = document.createElement(entry.href ? 'a' : 'div');
  row.className = 'site-box-row landing-news-row';
  if (entry.href && row instanceof HTMLAnchorElement) {
    row.href = /^https?:/.test(entry.href) ? entry.href : localizedHref(entry.href, locale);
    if (/^https?:/.test(entry.href)) {
      row.target = '_blank';
      row.rel = 'noopener noreferrer';
    }
  }

  const date = document.createElement('time');
  date.className = 'site-box-row-meta';
  date.dateTime = entry.date;
  date.textContent = formatAnnouncementDate(entry.date, false, locale);

  const label = document.createElement('span');
  label.className = 'site-box-row-label';
  label.textContent = entry.headline;
  label.title = entry.headline;

  row.append(date, label);
  return row;
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
