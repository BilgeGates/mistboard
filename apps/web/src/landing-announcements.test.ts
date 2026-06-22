import { afterEach, describe, expect, it, vi } from 'vitest';
import { announcements } from './announcements.js';
import { buildLandingAnnouncements } from './landing-announcements.js';
import { leaderboardVariants } from './variants.js';

describe('landing announcements', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows current launch announcements without old variant env flags', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_SHOGI_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_CROSSROADS_CHESS_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_CRAZYHOUSE_ENABLED', 'false');
    vi.stubEnv('VITE_KRIEGSPIEL_ENABLED', 'false');

    const panel = buildLandingAnnouncements();
    const hrefs = [...panel.querySelectorAll<HTMLAnchorElement>('a.landing-news-row')].map((row) =>
      row.getAttribute('href'),
    );

    expect(hrefs).toEqual([
      '/rules/drop-mini-xiangqi',
      '/rules/dark-crazyhouse',
      '/rules/dark-crossroads-chess',
      '/rules/dark-shogi',
      '/rules/kriegspiel',
      '/rules/reveal-chess',
    ]);
  });

  it('shows the Drop Mini Xiangqi launch announcement by default', () => {
    vi.stubEnv('DEV', false);

    const panel = buildLandingAnnouncements();
    const row = [...panel.querySelectorAll<HTMLAnchorElement>('a.landing-news-row')].find((r) =>
      r.textContent?.includes('Drop Mini Xiangqi'),
    );

    expect(row).toBeDefined();
    expect(row?.getAttribute('href')).toBe('/rules/drop-mini-xiangqi');
  });

  it('keeps older launch items in the full announcements history', () => {
    const hrefs = new Set(announcements().map((entry) => entry.href));

    expect(hrefs).toContain('/rules/banqi');
    expect(hrefs).toContain('/rules/dark-mini-xiangqi');
    expect(hrefs).toContain('/?play=computer');
  });

  it('links the News box header to /news', () => {
    const top = buildLandingAnnouncements().querySelector<HTMLAnchorElement>('a.site-box-top');
    expect(top?.getAttribute('href')).toBe('/news');
  });

  it('has a rules announcement for every launched leaderboard variant', () => {
    const announcementHrefs = new Set(announcements().map((entry) => entry.href));

    for (const variant of leaderboardVariants) {
      expect(announcementHrefs).toContain(`/rules/${variant.gameSpecId}`);
    }
  });
});
