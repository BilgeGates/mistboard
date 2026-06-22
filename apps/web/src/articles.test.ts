import { XIANGQI_GLYPH_PATHS } from '@mistboard/board-render';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BANQI_ENGINE_THUMBNAIL,
  BANQI_RIGHT_HALF_W,
  BANQI_RULES_THUMBNAIL,
} from './articles/diagrams.js';
import {
  buildArticlePage,
  buildArticlesIndex,
  buildHomeArticleCards,
  buildRulesIndex,
} from './articles.js';
import { boardAppearanceChangedEvent } from './theme.js';

describe('article public listing gates', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllEnvs();
  });

  it('keeps Dark Mini Xiangqi off public article surfaces during soft launch', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');

    const rules = buildRulesIndex();
    expect(buildHomeArticleCards(50)?.textContent).not.toContain('Dark Mini Xiangqi');
    expect(rules.textContent).not.toContain('Dark Mini Xiangqi');
    expect(rules.querySelector('a[href="/rules/mini-xiangqi"]')).toBeNull();
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

  it('orders the articles page by publish date newest first', () => {
    vi.stubEnv('DEV', true);

    const hrefs = [
      ...buildArticlesIndex().querySelectorAll<HTMLAnchorElement>('.articles-index-card'),
    ].map((link) => link.getAttribute('href'));

    expect(hrefs).toEqual([
      '/articles/misty',
      '/articles/mistybanqi',
      '/articles/server-enforced-fog',
      '/articles/dark-chess-concepts',
    ]);
  });

  it('limits the homepage article widget to curated article cards ordered by publish date', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');

    const hrefs = [
      ...(buildHomeArticleCards(50)?.querySelectorAll<HTMLAnchorElement>(
        '.landing-article-card[data-card-kind="article"]',
      ) ?? []),
    ].map((link) => link.getAttribute('href'));

    expect(hrefs).toEqual([
      '/rules/drop-mini-xiangqi',
      '/rules/dark-shogi',
      '/articles/mistybanqi',
      '/rules/reveal-chess',
      '/rules/jieqi',
      '/rules/banqi',
      '/rules/crossroads-chess',
      '/articles/server-enforced-fog',
      '/rules/dark-mini-xiangqi',
      '/rules/dark-xiangqi',
      '/rules/dark-chess',
    ]);
  });

  it('keeps still-gated release announcements out of the homepage article widget by default', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_KRIEGSPIEL_ENABLED', 'true');

    const cards = buildHomeArticleCards(50);

    expect(cards?.textContent).not.toContain('Reveal Chess is open for alpha play.');
    expect(cards?.textContent).not.toContain('Kriegspiel is open for alpha play.');
  });

  it('shows the Drop Mini Xiangqi launch announcement in the homepage article widget by default', () => {
    vi.stubEnv('DEV', false);

    const cards = buildHomeArticleCards(50);
    const announcement = cards?.querySelector<HTMLAnchorElement>(
      '.landing-announcement-card[href="/rules/drop-mini-xiangqi"]',
    );

    expect(announcement).not.toBeNull();
    expect(announcement?.textContent).toContain('Drop Mini Xiangqi has launched.');
  });

  it('does not show the Banqi alpha announcement in the homepage article widget', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_BANQI_ENABLED', 'true');

    const cards = buildHomeArticleCards(50);

    expect(cards?.querySelector('.landing-announcement-card[href="/rules/banqi"]')).toBeNull();
    expect(cards?.textContent).not.toContain('Banqi (半棋) is open for alpha play.');
  });

  it('keeps Banqi rules surfaces on the variant marker while the MistyBanqi thumbnail crops the right half', () => {
    const rules = buildRulesIndex();
    expect(
      rules.querySelector('.rules-landing-tile[href="/rules/banqi"] svg[data-mini-id="banqi"]'),
    ).not.toBeNull();
    expect(BANQI_RULES_THUMBNAIL()).not.toContain('data-banqi-thumbnail-crop');

    const thumbnail = BANQI_ENGINE_THUMBNAIL();
    expect(thumbnail).toContain('data-banqi-thumbnail-crop="right-half"');
    expect(thumbnail).toContain(`--xq-svg-width: ${BANQI_RIGHT_HALF_W + 8}px`);

    const articles = buildArticlesIndex();
    const card = articles.querySelector<HTMLAnchorElement>(
      '.articles-index-card[href="/articles/mistybanqi"]',
    );
    expect(card?.querySelector('svg g[data-banqi-thumbnail-crop="right-half"]')).not.toBeNull();

    const home = buildHomeArticleCards(50);
    expect(
      home?.querySelector('.landing-article-card[href="/rules/banqi"] svg[data-mini-id="banqi"]'),
    ).not.toBeNull();
    expect(
      home?.querySelector(
        '.landing-article-card[href="/articles/mistybanqi"] svg g[data-banqi-thumbnail-crop="right-half"]',
      ),
    ).not.toBeNull();
  });

  it('describes Kriegspiel as playable with a friend-room CTA', () => {
    const page = buildArticlePage('kriegspiel');
    const links = [...page.querySelectorAll<HTMLAnchorElement>('a')].map((link) => ({
      href: link.getAttribute('href'),
      text: link.textContent,
    }));

    expect(page.textContent).toContain('Kriegspiel is playable on Mistboard');
    expect(page.textContent).not.toContain("Kriegspiel isn't playable");
    expect(links).toContainEqual({
      href: '/?play=friend&gameSpecId=kriegspiel',
      text: 'Challenge a friend',
    });
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
      text: 'Play Misty DMX',
    });
    expect(links).toContainEqual({
      href: '/?play=friend&gameSpecId=dark-mini-xiangqi',
      text: 'Create invite',
    });
  });

  it('publishes Dark Crossroads Chess as a playable invite rules page', () => {
    vi.stubEnv('DEV', false);

    const page = buildArticlePage('dark-crossroads-chess');
    const landing = buildRulesIndex();
    const grids = landing.querySelectorAll('.rules-landing-grid');
    const links = [...page.querySelectorAll<HTMLAnchorElement>('a')].map((link) => ({
      href: link.getAttribute('href'),
      text: link.textContent,
    }));

    expect(page.textContent).toContain('Dark Crossroads Chess Rules');
    expect(page.textContent).toContain('available for invite games');
    expect(page.textContent).not.toContain('not playable yet');
    expect(page.querySelectorAll('.dark-crossroads-figure > svg.crossroads-live-svg')).toHaveLength(
      4,
    );
    expect(links).toContainEqual({
      href: '/?play=friend&gameSpecId=dark-crossroads-chess',
      text: 'Create invite',
    });
    expect(landing.textContent).toContain('Dark Crossroads Chess');
    expect(grids[0]?.querySelector('a[href="/rules/dark-crossroads-chess"]')).not.toBeNull();
    expect(
      grids[0]?.querySelector(
        'a[href="/rules/dark-crossroads-chess"] svg[data-mini-id="dark-crossroads"]',
      ),
    ).not.toBeNull();
    expect(grids[1]?.querySelector('a[href="/rules/dark-crossroads-chess"]')).toBeNull();
    expect(
      page.querySelector(
        '.article-variant-sidebar a[aria-current="page"] svg[data-mini-id="dark-crossroads"]',
      ),
    ).not.toBeNull();
  });

  it('publishes Dark Crazyhouse as a playable invite rules page with the variant marker', () => {
    vi.stubEnv('DEV', false);

    const page = buildArticlePage('dark-crazyhouse');
    const landing = buildRulesIndex();
    const grids = landing.querySelectorAll('.rules-landing-grid');
    const links = [...page.querySelectorAll<HTMLAnchorElement>('a')].map((link) => ({
      href: link.getAttribute('href'),
      text: link.textContent,
    }));

    expect(page.textContent).toContain('Dark Crazyhouse Rules');
    expect(page.textContent).toContain('available for invite games');
    expect(page.textContent).not.toContain('not playable yet');
    expect(links).toContainEqual({
      href: '/?play=friend&gameSpecId=dark-crazyhouse',
      text: 'Create invite',
    });
    expect(grids[0]?.querySelector('a[href="/rules/dark-crazyhouse"]')).not.toBeNull();
    expect(
      grids[0]?.querySelector(
        'a[href="/rules/dark-crazyhouse"] svg[data-mini-id="dark-crazyhouse"]',
      ),
    ).not.toBeNull();
    expect(grids[1]?.querySelector('a[href="/rules/dark-crazyhouse"]')).toBeNull();
    expect(
      page.querySelector(
        '.article-variant-sidebar a[aria-current="page"] svg[data-mini-id="dark-crazyhouse"]',
      ),
    ).not.toBeNull();
  });

  it('publishes Drop Mini Xiangqi as a playable rules page with the variant marker', () => {
    const page = buildArticlePage('drop-mini-xiangqi');
    const landing = buildRulesIndex();
    const grids = landing.querySelectorAll('.rules-landing-grid');
    const links = [...page.querySelectorAll<HTMLAnchorElement>('a')].map((link) => ({
      href: link.getAttribute('href'),
      text: link.textContent,
    }));

    expect(page.textContent).toContain('Drop Mini Xiangqi Rules');
    expect(page.textContent).toContain('open for alpha play');
    expect(page.textContent).toContain('A sample game');
    expect(page.querySelector('[data-pending-widget="drop-mini-xiangqi-replay"]')).not.toBeNull();
    expect(links).toContainEqual({
      href: '/?play=friend&gameSpecId=drop-mini-xiangqi',
      text: 'Create invite',
    });
    expect(links).toContainEqual({
      href: '/?play=lobby&gameSpecId=drop-mini-xiangqi',
      text: 'Find opponent',
    });
    expect(grids[0]?.querySelector('a[href="/rules/drop-mini-xiangqi"]')).not.toBeNull();
    expect(
      grids[0]?.querySelector(
        'a[href="/rules/drop-mini-xiangqi"] svg[data-mini-id="drop-mini-xiangqi"]',
      ),
    ).not.toBeNull();
    expect(grids[1]?.querySelector('a[href="/rules/drop-mini-xiangqi"]')).toBeNull();
    expect(
      page.querySelector(
        '.article-variant-sidebar a[aria-current="page"] svg[data-mini-id="drop-mini-xiangqi"]',
      ),
    ).not.toBeNull();
  });

  it('rerenders Dark Crossroads diagrams from the piece settings', () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() });
    const page = buildArticlePage('dark-crossroads-chess');
    document.body.append(page);

    expect(page.innerHTML).toContain(XIANGQI_GLYPH_PATHS.車);
    expect(page.innerHTML).not.toContain('/pieces/letter/wK.svg');

    window.localStorage.setItem('mistboard.pieceSet', 'letter');
    window.localStorage.setItem('mistboard.xiangqiPieceSet', 'western');
    window.dispatchEvent(new Event(boardAppearanceChangedEvent));

    expect(page.innerHTML).toContain('/pieces/letter/wK.svg');
    expect(page.innerHTML).toContain('>R</text>');
    expect(page.innerHTML).not.toContain(XIANGQI_GLYPH_PATHS.車);
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

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

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
    expect(
      darkChess.querySelector('.article-variant-sidebar a[href="/rules/mini-xiangqi"]'),
    ).toBeNull();
    expect(
      darkChess.querySelector('.article-variant-sidebar a[href="/rules/dark-mini-xiangqi"]'),
    ).toBeNull();

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
    expect(titles).toEqual(['On Mistboard', 'References']);

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

  it('uses shared Shogi mini markers on rule article surfaces', () => {
    const landing = buildRulesIndex();
    expect(
      landing.querySelector('.rules-landing-tile[href="/rules/shogi"] svg[data-mini-id="shogi"]'),
    ).not.toBeNull();
    expect(
      landing.querySelector(
        '.rules-landing-tile[href="/rules/dark-shogi"] svg[data-mini-id="dark-shogi"]',
      ),
    ).not.toBeNull();

    const shogi = buildArticlePage('shogi');
    expect(
      shogi.querySelector(
        '.article-variant-sidebar a[aria-current="page"] svg[data-mini-id="shogi"]',
      ),
    ).not.toBeNull();

    const darkShogi = buildArticlePage('dark-shogi');
    expect(
      darkShogi.querySelector(
        '.article-variant-sidebar a[aria-current="page"] svg[data-mini-id="dark-shogi"]',
      ),
    ).not.toBeNull();
  });

  it('groups the tile grid like the rail: playable first, reference after', () => {
    const landing = buildRulesIndex();
    const titles = [...landing.querySelectorAll('.rules-landing-group-title')].map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(['On Mistboard', 'References']);
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
    expect(pageText).toContain('40 plies (single moves) with no flip or capture');
    expect(pageText).toContain('threefold repetition');
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
    expect(banqiSvgs.length).toBeGreaterThanOrEqual(3);
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
  });

  it('keeps fogged xiangqi blockers as question-mark pieces', () => {
    const page = buildArticlePage('dark-xiangqi');
    const figureText = [...page.querySelectorAll('.article-figure')]
      .map((figure) => figure.textContent)
      .join('');

    expect(figureText).toContain('?');
  });
});
