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
    // banqi) now surface. The rail shows the newest MAX_FEED_ROWS entries.
    // Derived from the announcement data rather than pinned to specific posts:
    // this asserts the gating and ordering behaviour, and does not need editing
    // every time a new announcement ships.
    const expected = [...announcements()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((entry) => entry.href)
      .filter((href): href is string => typeof href === 'string')
      .slice(0, hrefs.length);
    expect(hrefs).toEqual(expected);
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
    expect(variantPublicSurfaceEnabled('dark-shogi')).toBe(false);
    expect(variantPublicSurfaceEnabled('kriegspiel')).toBe(false);

    const landing = buildLandingAnnouncements();
    const news = buildNewsPage();

    for (const hidden of [
      'Reveal Chess',
      'Crossroads Chess',
      'Dark Crossroads Chess',
      'Fog Shogi',
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
    expect(hrefs).toContain('/rules/flip-xiangqi');
    expect(hrefs).toContain('/rules/dark-mini-xiangqi');
    expect(hrefs).toContain('/?play=computer');
  });

  it('links the feed header to /feed', () => {
    const panel = buildLandingAnnouncements();
    const top = panel.querySelector<HTMLAnchorElement>('a.site-box-top');
    const more = panel.querySelector<HTMLElement>('.site-box-more');
    expect(top?.getAttribute('href')).toBe('/feed');
    expect(more?.textContent).toBe('All updates »');
  });

  it('marks feed rows by supported post type and renders icon markers', () => {
    const firstRow = buildLandingAnnouncements().querySelector<HTMLElement>('.landing-news-update');
    const marker = firstRow?.querySelector<HTMLElement>('.landing-news-marker');

    // The invariant is that the marker agrees with the row's own kind and
    // renders that kind's icon, whatever the newest announcement happens to be.
    const kind = firstRow?.dataset.announcementKind;
    expect(kind).toBeTruthy();
    expect(marker?.dataset.announcementKind).toBe(kind);
    expect(marker?.querySelector(`svg.ui-icon-announcement-${kind}`)).not.toBeNull();
    // The slot is assigned from the kind, so assert it is present and
    // well-formed rather than pinning whichever kind is currently newest.
    expect(marker?.dataset.futureDobutsuSlot).toMatch(/^announcement-[a-z]$/);
  });

  it('localizes the News rail and feed chrome', () => {
    vi.stubEnv('DEV', false);

    const landing = buildLandingAnnouncements('zh-Hant');
    const firstRow = landing.querySelector<HTMLAnchorElement>('a.landing-news-link');
    const more = landing.querySelector<HTMLElement>('.site-box-more');
    const news = buildNewsPage('zh-Hant');

    const newestHref = [...announcements()].sort((a, b) => b.date.localeCompare(a.date))[0]?.href;
    expect(landing.getAttribute('aria-label')).toBe('新聞');
    expect(firstRow?.getAttribute('href')).toBe(newestHref);
    expect(more?.textContent).toBe('全部更新 »');
    expect(news.querySelector('.site-section-heading')?.textContent).toBe('Mistboard 更新');
    expect(news.querySelector('.news-page-intro')?.textContent).toBe(
      'Mistboard 的發布、狀態更新和公告。',
    );
    expect(news.querySelector<HTMLAnchorElement>('.news-page-link')?.getAttribute('href')).toBe(
      newestHref,
    );
    // Custom CTA labels fall through untranslated (only the shared CTA strings
    // have catalog entries).
    const newestCta = [...announcements()].sort((a, b) => b.date.localeCompare(a.date))[0]?.cta;
    expect(news.querySelector('.news-page-link')?.textContent).toBe(newestCta);
  });

  it('has a rules announcement for every launched leaderboard variant', () => {
    const announcementHrefs = new Set(announcements().map((entry) => entry.href));
    const readerFacingRuleSlugs: Record<string, string> = {
      banqi: 'flip-xiangqi',
      'dark-chess': 'fog-chess',
      'dark-xiangqi': 'fog-xiangqi',
      jieqi: 'reveal-xiangqi',
    };

    for (const variant of leaderboardVariants) {
      const slug = readerFacingRuleSlugs[variant.gameSpecId] ?? variant.gameSpecId;
      expect(announcementHrefs).toContain(`/rules/${slug}`);
    }
  });
});
