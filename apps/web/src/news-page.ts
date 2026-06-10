// /news: the full announcement history as a dated feed, the landing rail's
// News box "More" target. Mirrors lichess's updates-feed page shape: one
// entry per update with date, headline, and the short body line.
import './news-page.css';
import { announcements } from './announcements.js';
import { formatAnnouncementDate } from './landing-announcements.js';

export function buildNewsPage(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'site-section news-page';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'News';
  section.append(heading);

  const intro = document.createElement('p');
  intro.className = 'news-page-intro';
  intro.textContent = 'Releases, status updates, and announcements from Mistboard.';
  section.append(intro);

  // Pure reverse-chronological: pinning is a rail concern, not a history one.
  const entries = [...announcements()].sort((a, b) => b.date.localeCompare(a.date));
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'news-page-empty';
    empty.textContent = 'Nothing yet.';
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
    date.textContent = formatAnnouncementDate(entry.date, true);

    const body = document.createElement('div');
    body.className = 'news-page-body';

    const headline = document.createElement(entry.href ? 'a' : 'p');
    headline.className = 'news-page-headline';
    headline.textContent = entry.headline;
    if (entry.href && headline instanceof HTMLAnchorElement) {
      headline.href = entry.href;
      if (/^https?:/.test(entry.href)) {
        headline.target = '_blank';
        headline.rel = 'noopener noreferrer';
      }
    }
    body.append(headline);

    if (entry.body) {
      const text = document.createElement('p');
      text.className = 'news-page-text';
      text.textContent = entry.body;
      body.append(text);
    }

    item.append(date, body);
    list.append(item);
  }
  section.append(list);

  return section;
}
