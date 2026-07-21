import { describe, expect, it } from 'vitest';
import { buildLandingEventBanners, type EventBanner } from './landing-event-banners.js';

const BANNERS: EventBanner[] = [
  {
    id: 'arena-1',
    kind: 'tournament',
    title: 'Fog Chess Weekly Arena',
    subtitle: '17 players · playing right now',
    href: '/watch',
  },
  {
    id: 'cast-1',
    kind: 'broadcast',
    title: 'Xiangqi Masters broadcast',
    subtitle: 'Round 2 · live commentary',
    href: '/watch',
  },
];

describe('landing event banners', () => {
  it('renders one linked row per banner with title, meta line, and kind icon', () => {
    const el = buildLandingEventBanners(BANNERS);

    const rows = el.querySelectorAll<HTMLAnchorElement>('a.landing-event-banner');
    expect(rows.length).toBe(2);
    expect(rows[0]?.classList.contains('landing-event-banner-tournament')).toBe(true);
    expect(rows[0]?.getAttribute('href')).toBe('/watch');
    expect(rows[0]?.querySelector('.landing-event-banner-title')?.textContent).toBe(
      'Fog Chess Weekly Arena',
    );
    expect(rows[0]?.querySelector('.landing-event-banner-subtitle')?.textContent).toBe(
      '17 players · playing right now',
    );
    expect(rows[0]?.querySelector('.landing-event-banner-icon svg')).not.toBeNull();
    expect(rows[1]?.classList.contains('landing-event-banner-broadcast')).toBe(true);
  });

  it('mounts an empty container when no event is on (CSS collapses it via :empty)', () => {
    const el = buildLandingEventBanners([]);

    expect(el.classList.contains('landing-event-banners')).toBe(true);
    expect(el.childElementCount).toBe(0);
  });
});
