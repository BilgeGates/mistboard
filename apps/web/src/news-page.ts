// /news: the full announcement history as a dated feed, the landing rail's
// News box "More" target. Mirrors lichess's updates-feed page shape: one
// entry per update with date, headline, and the short body line.
import './news-page.css';
import { type Announcement, announcements } from './announcements.js';
import { t } from './i18n/catalog.js';
import { currentLocale, type Locale, localizedHref } from './i18n/locale.js';
import { formatAnnouncementDate } from './landing-announcements.js';
import { rulesHrefPublicSurfaceEnabled } from './variant-public-surfaces.js';

export function buildNewsPage(locale: Locale = currentLocale()): HTMLElement {
  const section = document.createElement('section');
  section.className = 'site-section news-page';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = t('news.heading', {}, locale);
  section.append(heading);

  const intro = document.createElement('p');
  intro.className = 'news-page-intro';
  intro.textContent = t('news.intro', {}, locale);
  section.append(intro);

  // Pure reverse-chronological: pinning is a rail concern, not a history one.
  const entries = [...announcements()]
    .filter((entry) => rulesHrefPublicSurfaceEnabled(entry.href))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'news-page-empty';
    empty.textContent = t('news.empty', {}, locale);
    section.append(empty);
    return section;
  }

  const list = document.createElement('ol');
  list.className = 'news-page-list';
  for (const entry of entries) {
    const item = document.createElement('li');
    item.className = 'news-page-entry';

    const date = document.createElement('time');
    date.className = 'news-page-date';
    date.dateTime = entry.date;
    date.textContent = formatAnnouncementDate(entry.date, true, locale);

    const body = document.createElement('div');
    body.className = 'news-page-body';

    const headline = document.createElement('p');
    headline.className = 'news-page-headline';
    headline.textContent = entry.headline;
    body.append(headline);

    if (entry.body || entry.href) {
      const text = document.createElement('p');
      text.className = 'news-page-text';
      if (entry.body) text.append(`${entry.body} `);
      if (entry.href) {
        const isExternal = /^https?:/.test(entry.href);
        const link = document.createElement('a');
        link.className = 'news-page-link';
        link.href = isExternal ? entry.href : localizedHref(entry.href, locale);
        link.textContent = announcementCtaLabel(entry, locale);
        if (isExternal) {
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        }
        text.append(link);
      }
      body.append(text);
    }

    item.append(date, body);
    list.append(item);
  }
  section.append(list);

  return section;
}

function announcementCtaLabel(entry: Announcement, locale: Locale): string {
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
