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
      '/rules/jungle',
      '/rules/jungle-flip',
      '/rules/drop-mini-xiangqi',
      '/rules/dark-crazyhouse',
      '/rules/dark-shogi',
      '/rules/dark-xiangqi',
    ]);
  });

  it('keeps parked and gated variant launches out of the homepage News rail', () => {
    vi.stubEnv('DEV', false);

    const panel = buildLandingAnnouncements();
    const hrefs = new Set(
      [...panel.querySelectorAll<HTMLAnchorElement>('a.landing-news-row')].map((row) =>
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

  it('links the News box header to /feed', () => {
    const top = buildLandingAnnouncements().querySelector<HTMLAnchorElement>('a.site-box-top');
    expect(top?.getAttribute('href')).toBe('/feed');
  });

  it('localizes the News rail and feed chrome', () => {
    vi.stubEnv('DEV', false);

    const landing = buildLandingAnnouncements('zh-Hant');
    const top = landing.querySelector<HTMLAnchorElement>('a.site-box-top');
    const firstRow = landing.querySelector<HTMLAnchorElement>('a.landing-news-row');
    const news = buildNewsPage('zh-Hant');

    expect(landing.getAttribute('aria-label')).toBe('新聞');
    expect(top?.querySelector('.site-box-title')?.textContent).toBe('新聞');
    expect(top?.querySelector('.site-box-more')?.textContent).toBe('更多 »');
    expect(firstRow?.getAttribute('href')).toBe('/zh-hant/rules/jungle');
    expect(news.querySelector('.site-section-heading')?.textContent).toBe('Mistboard 更新');
    expect(news.querySelector('.news-page-intro')?.textContent).toBe(
      'Mistboard 的發布、狀態更新和公告。',
    );
    expect(news.querySelector<HTMLAnchorElement>('.news-page-link')?.getAttribute('href')).toBe(
      '/zh-hant/rules/jungle',
    );
    expect(news.querySelector('.news-page-link')?.textContent).toBe('閱讀規則');
  });

  it('has a rules announcement for every launched leaderboard variant', () => {
    const announcementHrefs = new Set(announcements().map((entry) => entry.href));

    for (const variant of leaderboardVariants) {
      expect(announcementHrefs).toContain(`/rules/${variant.gameSpecId}`);
    }
  });
});
