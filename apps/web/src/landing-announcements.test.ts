import { afterEach, describe, expect, it, vi } from 'vitest';
import { announcements } from './announcements.js';
import { buildLandingAnnouncements } from './landing-announcements.js';
import { leaderboardVariants } from './variants.js';

describe('landing announcements', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hides the Dark Mini Xiangqi announcement until public entry is enabled', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');

    expect(buildLandingAnnouncements().textContent).not.toContain('Dark Mini Xiangqi');
  });

  it('shows the Dark Mini Xiangqi announcement when public entry is enabled', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');

    const panel = buildLandingAnnouncements();
    const row = [...panel.querySelectorAll<HTMLAnchorElement>('a.landing-news-row')].find((r) =>
      r.textContent?.includes('Dark Mini Xiangqi'),
    );

    expect(row).toBeDefined();
    expect(row?.getAttribute('href')).toBe('/rules/dark-mini-xiangqi');
  });

  it('hides the Dark Shogi announcement until the dark shogi flag is enabled', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_SHOGI_ENABLED', 'false');

    expect(buildLandingAnnouncements().textContent).not.toContain('Dark Shogi');
  });

  it('shows the Dark Shogi launch announcement when the dark shogi flag is enabled', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_SHOGI_ENABLED', 'true');

    const panel = buildLandingAnnouncements();
    const row = [...panel.querySelectorAll<HTMLAnchorElement>('a.landing-news-row')].find((r) =>
      r.textContent?.includes('Dark Shogi'),
    );

    expect(row).toBeDefined();
    expect(row?.getAttribute('href')).toBe('/rules/dark-shogi');
  });

  it('hides the Dark Crossroads announcement until the dark crossroads flag is enabled', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_CROSSROADS_CHESS_ENABLED', 'false');

    expect(buildLandingAnnouncements().textContent).not.toContain('Dark Crossroads Chess');
  });

  it('shows the Dark Crossroads launch announcement when the flag is enabled', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_CROSSROADS_CHESS_ENABLED', 'true');

    const panel = buildLandingAnnouncements();
    const row = [...panel.querySelectorAll<HTMLAnchorElement>('a.landing-news-row')].find((r) =>
      r.textContent?.includes('Dark Crossroads Chess'),
    );

    expect(row).toBeDefined();
    expect(row?.getAttribute('href')).toBe('/rules/dark-crossroads-chess');
  });

  it('hides the Dark Crazyhouse announcement until the dark crazyhouse flag is enabled', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_CRAZYHOUSE_ENABLED', 'false');

    expect(buildLandingAnnouncements().textContent).not.toContain('Dark Crazyhouse');
  });

  it('shows the Dark Crazyhouse launch announcement when the flag is enabled', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_CRAZYHOUSE_ENABLED', 'true');

    const panel = buildLandingAnnouncements();
    const row = [...panel.querySelectorAll<HTMLAnchorElement>('a.landing-news-row')].find((r) =>
      r.textContent?.includes('Dark Crazyhouse'),
    );

    expect(row).toBeDefined();
    expect(row?.getAttribute('href')).toBe('/rules/dark-crazyhouse');
  });

  it('hides the Banqi announcement until the banqi flag is enabled', () => {
    vi.stubEnv('DEV', false);
    expect(buildLandingAnnouncements().textContent).not.toContain('Banqi');
  });

  it('shows the Banqi announcement when the banqi flag is enabled', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_BANQI_ENABLED', 'true');

    const panel = buildLandingAnnouncements();
    const row = [...panel.querySelectorAll<HTMLAnchorElement>('a.landing-news-row')].find((r) =>
      r.textContent?.includes('Banqi'),
    );

    expect(row).toBeDefined();
    expect(row?.getAttribute('href')).toBe('/rules/banqi');
  });

  it('hides the Kriegspiel announcement until the Kriegspiel flag is enabled', () => {
    vi.stubEnv('DEV', false);
    expect(buildLandingAnnouncements().textContent).not.toContain('Kriegspiel');
  });

  it('shows the Kriegspiel announcement when the Kriegspiel flag is enabled', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_KRIEGSPIEL_ENABLED', 'true');

    const panel = buildLandingAnnouncements();
    const row = [...panel.querySelectorAll<HTMLAnchorElement>('a.landing-news-row')].find((r) =>
      r.textContent?.includes('Kriegspiel'),
    );

    expect(row).toBeDefined();
    expect(row?.getAttribute('href')).toBe('/rules/kriegspiel');
  });

  it('links the Misty announcement to the engine play flow', () => {
    vi.stubEnv('DEV', false);

    const panel = buildLandingAnnouncements();
    const row = [...panel.querySelectorAll<HTMLAnchorElement>('a.landing-news-row')].find((r) =>
      r.textContent?.includes('Misty 1.0'),
    );

    expect(row).toBeDefined();
    expect(row?.getAttribute('href')).toBe('/?play=computer');
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
