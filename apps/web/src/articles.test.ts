import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildArticlePage, buildHomeArticleCards, buildRulesIndex } from './articles.js';

describe('article public listing gates', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllEnvs();
  });

  it('keeps Dark Mini Xiangqi off public article surfaces during soft launch', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');

    expect(buildHomeArticleCards(50)?.textContent).not.toContain('Dark Mini Xiangqi');
    expect(buildRulesIndex().textContent).not.toContain('Dark Mini Xiangqi');
    expect(buildRulesIndex().textContent).not.toContain('Mini Xiangqi');
    expect(buildArticlePage('dark-mini-xiangqi').textContent).toContain('Dark Mini Xiangqi');
    expect(buildArticlePage('mini-xiangqi').textContent).toContain('Mini Xiangqi');
  });

  it('lists Dark Mini Xiangqi rules when the public-entry flag is enabled', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');

    expect(buildHomeArticleCards(50)?.textContent).toContain('Dark Mini Xiangqi');
    expect(buildRulesIndex().textContent).toContain('Dark Mini Xiangqi');
    expect(buildRulesIndex().textContent).toContain('Mini Xiangqi');
  });

  it('describes Dark Mini Xiangqi as playable alpha with play CTAs', () => {
    const page = buildArticlePage('dark-mini-xiangqi');
    const links = [...page.querySelectorAll<HTMLAnchorElement>('a')].map((link) => ({
      href: link.getAttribute('href'),
      text: link.textContent,
    }));

    expect(page.textContent).toContain('Dark Mini Xiangqi is open for alpha play');
    expect(page.textContent).not.toContain('not yet a public game mode');
    expect(links).toContainEqual({
      href: '/?play=computer&gameSpecId=dark-mini-xiangqi',
      text: 'Play Misty',
    });
    expect(links).toContainEqual({
      href: '/?play=friend&gameSpecId=dark-mini-xiangqi',
      text: 'Create invite',
    });
  });

  it('links the Dark Chess rules CTA to engine play', () => {
    const page = buildArticlePage('dark-chess');
    const links = [...page.querySelectorAll<HTMLAnchorElement>('a')].map((link) => ({
      href: link.getAttribute('href'),
      text: link.textContent,
    }));

    expect(links).toContainEqual({
      href: '/?play=computer',
      text: 'Play Misty',
    });
    expect(links).not.toContainEqual({
      href: '/?play=lobby',
      text: 'Play dark chess',
    });
  });
});

describe('rules variant sidebar', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllEnvs();
  });

  it('lists variants on rules pages with the current one highlighted', () => {
    const page = buildArticlePage('dark-chess');
    const sidebar = page.querySelector('.article-variant-sidebar');
    expect(sidebar).not.toBeNull();

    const current = sidebar?.querySelector('a[aria-current="page"]');
    expect(current?.getAttribute('href')).toBe('/rules/dark-chess');
    expect(current?.querySelector('.article-variant-label')?.textContent).toBe(
      'Dark Chess (Fog of War)',
    );
    expect(sidebar?.querySelector('a[href="/rules/chess"]')).not.toBeNull();
  });

  it('keeps prelaunch variants out of the sidebar unless they are the current page', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');

    const darkChess = buildArticlePage('dark-chess');
    expect(darkChess.querySelector('.article-variant-sidebar')?.textContent).not.toContain(
      'Mini Xiangqi',
    );

    const miniXiangqi = buildArticlePage('mini-xiangqi');
    const sidebar = miniXiangqi.querySelector('.article-variant-sidebar');
    expect(
      sidebar?.querySelector('a[aria-current="page"] .article-variant-label')?.textContent,
    ).toBe('Mini Xiangqi');
    expect(sidebar?.textContent).not.toContain('Dark Mini Xiangqi');
  });

  it('omits the variant sidebar on non-rules articles', () => {
    const page = buildArticlePage('dark-chess-concepts');
    expect(page.querySelector('.article-variant-sidebar')).toBeNull();
  });

  it('groups the rail into playable and not-yet-playable games', () => {
    const page = buildArticlePage('dark-chess');
    const sidebar = page.querySelector('.article-variant-sidebar');
    const titles = [...(sidebar?.querySelectorAll('.article-toc-title') ?? [])].map(
      (title) => title.textContent,
    );
    expect(titles).toEqual(['On Mistboard', 'Not yet on Mistboard']);

    const navs = sidebar?.querySelectorAll('.article-toc-nav');
    expect(navs?.[0]?.querySelector('a[href="/rules/dark-chess"]')).not.toBeNull();
    expect(navs?.[0]?.querySelector('a[href="/rules/chess"]')).toBeNull();
    // Draft960 is a pregame option that has not shipped as a playable mode.
    expect(navs?.[0]?.querySelector('a[href="/rules/dark-draft960"]')).toBeNull();
    expect(navs?.[1]?.querySelector('a[href="/rules/chess"]')).not.toBeNull();
  });

  it('lists Dark Mini Xiangqi as playable once the public-entry flag is on', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');

    const page = buildArticlePage('dark-chess');
    const navs = page.querySelectorAll('.article-variant-sidebar .article-toc-nav');
    expect(navs[0]?.querySelector('a[href="/rules/dark-mini-xiangqi"]')).not.toBeNull();
    expect(navs[1]?.querySelector('a[href="/rules/mini-xiangqi"]')).not.toBeNull();
  });

  it('renders the rules landing with the rail and a tile grid picker', () => {
    const landing = buildRulesIndex();
    expect(landing.querySelector('.article-variant-sidebar')).not.toBeNull();
    expect(landing.querySelector('.rules-landing-paragraph')).not.toBeNull();
    const tile = landing.querySelector<HTMLAnchorElement>(
      '.rules-landing-tile[href="/rules/dark-chess"]',
    );
    expect(tile?.querySelector('.rules-landing-tile-label')?.textContent).toBe(
      'Dark Chess (Fog of War)',
    );
  });

  it('groups the tile grid like the rail: playable first, reference after', () => {
    const landing = buildRulesIndex();
    const titles = [...landing.querySelectorAll('.rules-landing-group-title')].map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(['On Mistboard', 'Not yet on Mistboard']);
    const grids = landing.querySelectorAll('.rules-landing-grid');
    expect(grids[0]?.querySelector('a[href="/rules/dark-chess"]')).not.toBeNull();
    expect(grids[0]?.querySelector('a[href="/rules/chess"]')).toBeNull();
    expect(grids[1]?.querySelector('a[href="/rules/chess"]')).not.toBeNull();
  });
});
