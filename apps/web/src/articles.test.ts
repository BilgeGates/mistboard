import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildArticlePage, buildHomeArticleCards, buildRulesIndex } from './articles.js';

describe('article public listing gates', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllEnvs();
  });

  it('keeps Dark Mini Xiangqi off public article surfaces during soft launch', () => {
    vi.stubEnv('DEV', false);
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

  it('limits the homepage article widget to the curated cards', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');

    const hrefs = [
      ...(buildHomeArticleCards(50)?.querySelectorAll<HTMLAnchorElement>('.landing-article-card') ??
        []),
    ].map((link) => link.getAttribute('href'));

    expect(hrefs).toEqual([
      '/articles/server-enforced-fog',
      '/rules/crossroads-chess',
      '/rules/dark-mini-xiangqi',
      '/rules/dark-chess',
    ]);
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
    vi.stubEnv('DEV', false);
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

  it('renders Jieqi visual diagrams instead of placeholder notes', () => {
    const page = buildArticlePage('jieqi');
    const pageText = page.textContent ?? '';

    expect(pageText).not.toContain('[VISUAL:');
    expect(pageText).not.toMatch(/\bsquares?\b/i);
    expect(pageText).toContain('starting point it occupies');
    expect(pageText).toContain('Repetition follows xiangqi long-beat rules');
    const jieqiSvgs = [...page.querySelectorAll('.article-figure .xq-article-svg')];
    expect(jieqiSvgs.length).toBeGreaterThanOrEqual(4);
    expect(jieqiSvgs.every((svg) => svg.getAttribute('data-xq-layout') === 'pair')).toBe(true);
    const figureText = [...page.querySelectorAll('.article-figure')]
      .map((figure) => figure.textContent)
      .join('');
    expect(figureText).not.toContain('?');
    expect(page.querySelector('.xq-piece-back-mark')).not.toBeNull();
    expect(page.innerHTML).toContain('fill="#2f7d62"');
    expect(page.innerHTML).toContain('fill="#a95f4a"');
    expect(page.innerHTML).toContain('stroke="#6f342c"');
    expect(page.innerHTML).not.toContain('fill="#286d55"');
    expect(page.innerHTML).not.toContain('stroke="#c8ead2"');
    expect(page.innerHTML).not.toContain('C40 39 60 39 66 50');
    const captions = [...page.querySelectorAll('.article-figure-caption')].map(
      (caption) => caption.textContent,
    );
    expect(captions).toEqual([]);
    expect(pageText).toContain('BEFORE: HORSE POINT');
    expect(pageText).toContain('CAPTURED PIECE KNOWLEDGE');
    expect(pageText).toContain('RED KNOWS');
    expect(pageText).toContain('BLACK KNOWS');
  });

  it('renders Banqi diagrams and keeps the Taiwanese cannon rule clear', () => {
    const page = buildArticlePage('banqi');
    const pageText = page.textContent ?? '';

    expect(pageText).not.toContain('[VISUAL:');
    expect(pageText).toContain('General > Advisor > Elephant > Chariot > Horse > Soldier');
    expect(pageText).toContain('The cannon sits outside this rank ladder');
    expect(pageText).toContain('40 plies (40 individual turns) with no flip and no capture');
    expect(pageText).toContain('threefold repetition');
    expect(pageText).toContain('How positions work');
    expect(pageText).toContain('Taiwanese rules (this page)');
    expect(pageText).toContain('Hong Kong rules');
    expect(pageText).toContain('Mainland rules');
    expect(pageText).toContain('House variants');
    expect(pageText).toContain('For a capture only');
    expect(pageText).toContain('A non-capturing cannon move is still just one square');
    expect(pageText).toContain('an adjacent cannon can be taken by a general');
    expect(pageText).not.toContain('any revealed enemy piece except a soldier can capture it');
    expect(pageText).not.toContain('It slides any distance');
    expect(pageText).not.toContain('horse, cannon, soldier');
    const banqiSvgs = [...page.querySelectorAll('.article-figure .xq-article-svg')];
    expect(banqiSvgs.length).toBeGreaterThanOrEqual(4);
    expect(
      banqiSvgs.every((svg) => {
        const [, , width, height] = svg.getAttribute('viewBox')?.split(/\s+/).map(Number) ?? [];
        return width > height;
      }),
    ).toBe(true);
    expect(page.querySelector('.xq-piece-back-mark')).not.toBeNull();
    expect(page.innerHTML).toContain('aria-label="red advisor"');
    expect(page.innerHTML).toContain('aria-label="black advisor"');
    expect(page.querySelectorAll('.xq-diagram-title').length).toBeGreaterThanOrEqual(3);
    expect(page.innerHTML).not.toContain('fill="#5f4a2c"');
    const figureText = [...page.querySelectorAll('.article-figure')]
      .map((figure) => figure.textContent)
      .join('');
    expect(figureText).not.toContain('?');
    expect(figureText).toContain('FIRST FLIP ASSIGNS COLOR');
    expect(figureText).toContain('TAIWAN RANK LADDER');
    expect(figureText).toContain('CANNON SCREEN CAPTURE');
    expect(figureText).toContain('FACE-DOWN PIECES SHAPE THE BOARD');
  });

  it('keeps fogged xiangqi blockers as question-mark pieces', () => {
    const page = buildArticlePage('dark-xiangqi');
    const figureText = [...page.querySelectorAll('.article-figure')]
      .map((figure) => figure.textContent)
      .join('');

    expect(figureText).toContain('?');
  });
});
