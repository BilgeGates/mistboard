import { afterEach, describe, expect, it, vi } from 'vitest';
import { announcements } from './announcements.js';
import { buildLandingAnnouncements } from './landing-announcements.js';
import { buildNewsPage } from './news-page.js';
import { variantPublicSurfaceEnabled } from './variant-public-surfaces.js';
import { leaderboardVariants } from './variants.js';

describe('landing announcements', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows current launch announcements without old variant env flags', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_SHOGI_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_CROSSROADS_CHESS_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_CRAZYHOUSE_ENABLED', 'false');
    vi.stubEnv('VITE_KRIEGSPIEL_ENABLED', 'false');

    const panel = buildLandingAnnouncements();
    const hrefs = [...panel.querySelectorAll<HTMLAnchorElement>('a.landing-news-link')].map((row) =>
      row.getAttribute('href'),
    );

    // Xiangqi pivot: the News rail is gated by variantPublicSurfaceEnabled. The
    // mini xiangqi trio (incl. drop-mini) and dark-crazyhouse are retired from
    // public surfaces; the elevated Chinese-chess-family launches (dark-xiangqi,
    // banqi) now surface.
    expect(hrefs).toEqual(['/rules/xiangqi', '/forum', '/rules/fortress-xiangqi', '/rules/jungle']);
  });

  it('keeps parked and gated variant launches out of the homepage News rail', () => {
    vi.stubEnv('DEV', false);

    const panel = buildLandingAnnouncements();
    const hrefs = new Set(
      [...panel.querySelectorAll<HTMLAnchorElement>('a.landing-news-link')].map((row) =>
        row.getAttribute('href'),
      ),
    );

    expect(hrefs).not.toContain('/rules/reveal-chess');
    expect(hrefs).not.toContain('/rules/crossroads-chess');
    expect(hrefs).not.toContain('/rules/dark-crossroads-chess');
    expect(hrefs).not.toContain('/rules/kriegspiel');
  });

  it('uses the same variant flag for the homepage News rail and /feed archive', () => {
    vi.stubEnv('DEV', false);

    expect(variantPublicSurfaceEnabled('reveal-chess')).toBe(false);
    expect(variantPublicSurfaceEnabled('crossroads-chess')).toBe(false);
    expect(variantPublicSurfaceEnabled('dark-crossroads-chess')).toBe(false);
    expect(variantPublicSurfaceEnabled('kriegspiel')).toBe(false);

    const landing = buildLandingAnnouncements();
    const news = buildNewsPage();

    for (const hidden of [
      'Reveal Chess',
      'Crossroads Chess',
      'Dark Crossroads Chess',
      'Kriegspiel',
    ]) {
      expect(landing.textContent).not.toContain(hidden);
      expect(news.textContent).not.toContain(hidden);
    }
  });

  it('retires the Drop Mini Xiangqi launch announcement from the homepage News rail', () => {
    // Xiangqi pivot: drop-mini's public surface is off (variantPublicSurfaceEnabled
    // = false), so its launch row no longer shows on the homepage News rail (the
    // /rules/drop-mini-xiangqi page stays reachable by direct URL).
    vi.stubEnv('DEV', false);

    const panel = buildLandingAnnouncements();
    const row = [...panel.querySelectorAll<HTMLAnchorElement>('a.landing-news-link')].find((r) =>
      r.textContent?.includes('Drop Mini Xiangqi'),
    );

    expect(row).toBeUndefined();
  });

  it('keeps older launch items in the full announcements history', () => {
    const hrefs = new Set(announcements().map((entry) => entry.href));

    expect(hrefs).toContain('/forum');
    expect(hrefs).toContain('/rules/banqi');
    expect(hrefs).toContain('/rules/dark-mini-xiangqi');
    expect(hrefs).toContain('/?play=computer');
  });

  it('links the feed tail to /feed', () => {
    const more =
      buildLandingAnnouncements().querySelector<HTMLAnchorElement>('a.landing-news-all-link');
    expect(more?.getAttribute('href')).toBe('/feed');
  });

  it('localizes the News rail and feed chrome', () => {
    vi.stubEnv('DEV', false);

    const landing = buildLandingAnnouncements('zh-Hant');
    const firstRow = landing.querySelector<HTMLAnchorElement>('a.landing-news-link');
    const more = landing.querySelector<HTMLAnchorElement>('a.landing-news-all-link');
    const news = buildNewsPage('zh-Hant');

    expect(landing.getAttribute('aria-label')).toBe('新聞');
    expect(firstRow?.getAttribute('href')).toBe('/zh-hant/rules/xiangqi');
    expect(more?.textContent).toBe('更多 »');
    expect(news.querySelector('.site-section-heading')?.textContent).toBe('Mistboard 更新');
    expect(news.querySelector('.news-page-intro')?.textContent).toBe(
      'Mistboard 的發布、狀態更新和公告。',
    );
    expect(news.querySelector<HTMLAnchorElement>('.news-page-link')?.getAttribute('href')).toBe(
      '/zh-hant/rules/xiangqi',
    );
    expect(news.querySelector('.news-page-link')?.textContent).toBe('研究規則');
  });

  it('has a rules announcement for every launched leaderboard variant', () => {
    const announcementHrefs = new Set(announcements().map((entry) => entry.href));

    for (const variant of leaderboardVariants) {
      expect(announcementHrefs).toContain(`/rules/${variant.gameSpecId}`);
    }
  });
});
