// Homepage event banners (PlayStrategy / lishogi lobby-spotlight grammar): rare,
// timely announcements — a tournament, a broadcast, a stream — rendered as big
// tappable rows at the top of the left rail. This is deliberately NOT the News
// feed (dated release/update rows, /feed): a banner is an event with a start or
// end moment, and the slot is empty almost all of the time. There is no server
// announcement system yet; the list below is the whole publishing mechanism —
// edit it, ship, revert when the event passes.
import './landing-event-banners.css';
import { buildUiIcon, type UiIconName } from './ui-icon.js';

export type EventBanner = {
  id: string;
  // 'tournament' | 'broadcast' pick the icon; keep kinds coarse.
  kind: 'tournament' | 'broadcast';
  title: string;
  // One meta line under the title ("17 players · playing right now",
  // "starts Aug 31, 7:00 AM"). Plain text, composed by the editor.
  subtitle: string;
  href: string;
};

// Production banners. Empty = the widget renders nothing and the viewer moves
// up. Keep this list to at most 2-3 rows; it is a spotlight, not a feed.
const EVENT_BANNERS: EventBanner[] = [];

// Dev-only samples so the slot is visible while working on the homepage layout.
const DEV_SAMPLE_BANNERS: EventBanner[] = [
  {
    id: 'dev-sample-arena',
    kind: 'tournament',
    title: 'Fog Chess Weekly Arena',
    subtitle: '17 players · playing right now',
    href: '/watch',
  },
  {
    id: 'dev-sample-broadcast',
    kind: 'broadcast',
    title: 'Xiangqi Masters broadcast',
    subtitle: 'Round 2 · live commentary',
    href: '/watch',
  },
];

const BANNER_ICON: Record<EventBanner['kind'], UiIconName> = {
  tournament: 'event-tournament',
  broadcast: 'event-broadcast',
};

export function eventBanners(): EventBanner[] {
  if (EVENT_BANNERS.length === 0 && import.meta.env.DEV) return DEV_SAMPLE_BANNERS;
  return EVENT_BANNERS;
}

// The container always mounts (so the layout slot exists for tests and the
// prerendered shell); CSS hides it via :empty when there are no banners.
export function buildLandingEventBanners(banners: EventBanner[] = eventBanners()): HTMLElement {
  const list = document.createElement('nav');
  list.className = 'landing-event-banners';
  list.setAttribute('aria-label', 'Events');
  for (const banner of banners) {
    list.append(eventBannerRow(banner));
  }
  return list;
}

function eventBannerRow(banner: EventBanner): HTMLElement {
  const row = document.createElement('a');
  row.className = `landing-event-banner landing-event-banner-${banner.kind}`;
  row.href = banner.href;
  row.dataset.eventId = banner.id;

  const icon = document.createElement('span');
  icon.className = 'landing-event-banner-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.append(buildUiIcon(BANNER_ICON[banner.kind]));

  const text = document.createElement('span');
  text.className = 'landing-event-banner-text';
  const title = document.createElement('span');
  title.className = 'landing-event-banner-title';
  title.textContent = banner.title;
  const subtitle = document.createElement('span');
  subtitle.className = 'landing-event-banner-subtitle';
  subtitle.textContent = banner.subtitle;
  text.append(title, subtitle);

  row.append(icon, text);
  return row;
}
