import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLandingAnnouncements } from './landing-announcements.js';

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
    vi.stubEnv('VITE_DARK_SHOGI_ENABLED', 'false');

    expect(buildLandingAnnouncements().textContent).not.toContain('Dark Shogi');
  });

  it('shows the Dark Shogi launch announcement when the dark shogi flag is enabled', () => {
    vi.stubEnv('VITE_DARK_SHOGI_ENABLED', 'true');

    const panel = buildLandingAnnouncements();
    const row = [...panel.querySelectorAll<HTMLAnchorElement>('a.landing-news-row')].find((r) =>
      r.textContent?.includes('Dark Shogi'),
    );

    expect(row).toBeDefined();
    expect(row?.getAttribute('href')).toBe('/rules/dark-shogi');
  });

  it('hides the Banqi announcement until the banqi flag is enabled', () => {
    vi.stubEnv('DEV', false);
    expect(buildLandingAnnouncements().textContent).not.toContain('Banqi');
  });

  it('shows the Banqi announcement when the banqi flag is enabled', () => {
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
});
