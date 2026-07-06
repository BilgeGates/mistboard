import { XIANGQI_GLYPH_PATHS } from '@mistboard/board-render';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BANQI_ENGINE_THUMB_W,
  BANQI_ENGINE_THUMBNAIL,
  BANQI_RULES_THUMBNAIL,
} from './articles/diagrams.js';
import {
  buildArticlePage,
  buildArticlesIndex,
  buildHomeArticleCards,
  buildRulesIndex,
  mountPendingWidgets,
} from './articles.js';
import { boardAppearanceChangedEvent } from './theme.js';

describe('article public listing gates', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllEnvs();
  });

  it('de-lists the mini xiangqi trio from public rules surfaces but keeps the pages reachable', () => {
    // Xiangqi pivot: the mini xiangqi trio is hidden from public rules surfaces
    // (variantPublicSurfaceEnabled=false) but the rules pages stay reachable by
    // direct URL — they were de-listed, not deleted.
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'false');

    const rules = buildRulesIndex();
    expect(rules.querySelector('a[href="/rules/mini-xiangqi"]')).toBeNull();
    expect(rules.querySelector('a[href="/rules/dark-mini-xiangqi"]')).toBeNull();
    expect(rules.querySelector('a[href="/rules/drop-mini-xiangqi"]')).toBeNull();
    expect(buildArticlePage('dark-mini-xiangqi').textContent).toContain('Dark Mini Xiangqi');
    expect(buildArticlePage('mini-xiangqi').textContent).toContain('Mini Xiangqi');
  });

  it('keeps the mini xiangqi trio de-listed from the rules index regardless of env flags', () => {
    vi.stubEnv('DEV', false);

    const rules = buildRulesIndex();
    expect(rules.querySelector('a[href="/rules/dark-mini-xiangqi"]')).toBeNull();
    expect(rules.querySelector('a[href="/rules/mini-xiangqi"]')).toBeNull();
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

  it('localizes the zh-Hans articles index cards', () => {
    vi.stubEnv('DEV', false);

    const index = buildArticlesIndex('zh-Hans');
    const text = index.textContent ?? '';

    expect(index.querySelector('a[href="/zh-hans/articles/misty"]')).not.toBeNull();
    expect(text).toContain('Misty 是怎么下棋的');
    expect(text).toContain('用服务器端真实局面实现迷雾国际象棋');
    expect(text).not.toContain('How Misty Plays');
    expect(text).not.toContain('Programming Dark Chess with Server-Side Truth');
  });

  it('localizes Traditional Chinese article chrome and content links', () => {
    vi.stubEnv('DEV', false);

    const home = buildHomeArticleCards(50, 'zh-Hant');
    const firstArticleCard = home?.querySelector<HTMLAnchorElement>(
      '.landing-article-card[data-card-kind="article"]',
    );

    expect(home?.getAttribute('aria-label')).toBe('文章');
    expect(home?.querySelector('.landing-carousel-nav-prev')?.getAttribute('aria-label')).toBe(
      '上一篇文章',
    );
    expect(home?.querySelector('.landing-carousel-nav-next')?.getAttribute('aria-label')).toBe(
      '更多文章',
    );
    expect(firstArticleCard?.getAttribute('href')).toMatch(/^\/zh-hant\/(articles|rules)\//);

    const page = buildArticlePage('banqi', 'zh-Hant');
    expect(page.querySelector('.article-breadcrumb a')?.textContent).toBe('← 全部規則');
    expect(page.querySelector('.article-breadcrumb a')?.getAttribute('href')).toBe(
      '/zh-hant/rules',
    );
    expect(page.querySelector('.article-chip')?.textContent).toBe('規則');
    expect(page.querySelector('.article-meta-dates')?.textContent).toContain('發布於');
    expect(page.querySelector('.article-variant-sidebar')?.getAttribute('aria-label')).toBe(
      '規則導覽',
    );
    expect(page.querySelector('.article-toc-sidebar .article-toc-title')?.textContent).toBe(
      '本頁內容',
    );
    expect(
      page.querySelector('.article-toc-sidebar .article-toc-nav')?.getAttribute('aria-label'),
    ).toBe('目錄');
    expect(
      page.querySelector('.article-variant-sidebar a[href="/zh-hant/rules/banqi"]'),
    ).not.toBeNull();
  });

  it('localizes Japanese article shell while linking to canonical content pages', () => {
    vi.stubEnv('DEV', false);

    const home = buildHomeArticleCards(50, 'ja');

    expect(home?.getAttribute('aria-label')).toBe('記事');
    expect(
      home
        ?.querySelector<HTMLAnchorElement>('.landing-article-card[data-card-kind="article"]')
        ?.getAttribute('href'),
    ).toMatch(/^\/(articles|rules)\//);
  });

  it('limits the homepage article widget to editorial article cards ordered by publish date', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');

    const hrefs = [
      ...(buildHomeArticleCards(50)?.querySelectorAll<HTMLAnchorElement>(
        '.landing-article-card[data-card-kind="article"]',
      ) ?? []),
    ].map((link) => link.getAttribute('href'));

    // Rules reference pages are excluded from this row; only editorial
    // (blog/concept) articles appear, newest first.
    expect(hrefs).toEqual([
      '/articles/misty',
      '/articles/mistybanqi',
      '/articles/server-enforced-fog',
    ]);
  });

  it('keeps parked chess variant rules out of the homepage widget and rules rail', () => {
    vi.stubEnv('DEV', false);

    const home = buildHomeArticleCards(50);
    const landing = buildRulesIndex();
    const darkChess = buildArticlePage('dark-chess');
    const darkCrossroads = buildArticlePage('dark-crossroads-chess');
    const parkedHrefs = [
      '/rules/reveal-chess',
      '/rules/crossroads-chess',
      '/rules/dark-crossroads-chess',
    ];

    for (const href of parkedHrefs) {
      expect(home?.querySelector(`.landing-article-card[href="${href}"]`)).toBeNull();
      expect(landing.querySelector(`.rules-landing-tile[href="${href}"]`)).toBeNull();
      expect(darkChess.querySelector(`.article-variant-sidebar a[href="${href}"]`)).toBeNull();
    }
    expect(darkCrossroads.textContent).toContain('Dark Crossroads Chess Rules');
    expect(
      darkCrossroads.querySelector('.article-variant-sidebar a[aria-current="page"]'),
    ).toBeNull();
  });

  it('keeps still-gated release announcements out of the homepage article widget by default', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_KRIEGSPIEL_ENABLED', 'true');

    const cards = buildHomeArticleCards(50);

    expect(cards?.textContent).not.toContain('Reveal Chess is open for alpha play.');
    expect(cards?.textContent).not.toContain('Kriegspiel is open for alpha play.');
  });

  it('does not show the Drop Mini Xiangqi launch announcement in the homepage article widget', () => {
    vi.stubEnv('DEV', false);

    const cards = buildHomeArticleCards(50);
    const announcement = cards?.querySelector<HTMLAnchorElement>(
      '.landing-announcement-card[href="/rules/drop-mini-xiangqi"]',
    );

    expect(announcement).toBeNull();
    expect(cards?.textContent).not.toContain('Drop Mini Xiangqi has launched.');
  });

  it('does not show the Banqi alpha announcement in the homepage article widget', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_BANQI_ENABLED', 'true');

    const cards = buildHomeArticleCards(50);

    expect(cards?.querySelector('.landing-announcement-card[href="/rules/banqi"]')).toBeNull();
    expect(cards?.textContent).not.toContain('Banqi (半棋) is open for alpha play.');
  });

  it('keeps Banqi rules surfaces on the variant marker while the MistyBanqi thumbnail crops an 8:5 window', () => {
    const rules = buildRulesIndex();
    expect(
      rules.querySelector('.rules-landing-tile[href="/rules/banqi"] svg[data-mini-id="banqi"]'),
    ).not.toBeNull();
    expect(BANQI_RULES_THUMBNAIL()).not.toContain('data-banqi-thumbnail-crop');

    const thumbnail = BANQI_ENGINE_THUMBNAIL();
    expect(thumbnail).toContain('data-banqi-thumbnail-crop="engine-wide"');
    expect(thumbnail).toContain(`--xq-svg-width: ${BANQI_ENGINE_THUMB_W + 8}px`);

    const articles = buildArticlesIndex();
    const card = articles.querySelector<HTMLAnchorElement>(
      '.articles-index-card[href="/articles/mistybanqi"]',
    );
    expect(card?.querySelector('svg g[data-banqi-thumbnail-crop="engine-wide"]')).not.toBeNull();

    // The Banqi rules page carries the shared variant marker on the /rules
    // index (it no longer rides the homepage editorial row)...
    const rulesIndex = buildRulesIndex();
    expect(
      rulesIndex.querySelector('a[href="/rules/banqi"] svg[data-mini-id="banqi"]'),
    ).not.toBeNull();

    // ...while the MistyBanqi editorial card keeps its 8:5 board crop in the
    // homepage row.
    const home = buildHomeArticleCards(50);
    expect(
      home?.querySelector(
        '.landing-article-card[href="/articles/mistybanqi"] svg g[data-banqi-thumbnail-crop="engine-wide"]',
      ),
    ).not.toBeNull();
  });

  it('describes Kriegspiel as playable with a friend-room CTA', () => {
    vi.stubEnv('DEV', false);

    const page = buildArticlePage('kriegspiel');
    const landing = buildRulesIndex();
    const darkChess = buildArticlePage('dark-chess');
    const links = [...page.querySelectorAll<HTMLAnchorElement>('a')].map((link) => ({
      href: link.getAttribute('href'),
      text: link.textContent,
    }));

    expect(landing.querySelector('a[href="/rules/kriegspiel"]')).toBeNull();
    expect(
      darkChess.querySelector('.article-variant-sidebar a[href="/rules/kriegspiel"]'),
    ).toBeNull();
    expect(page.querySelector('.article-variant-sidebar a[href="/rules/kriegspiel"]')).toBeNull();
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

  it('points the Mini Xiangqi rules CTA directly at the bot', () => {
    const page = buildArticlePage('mini-xiangqi');
    const ctaLinks = [...page.querySelectorAll<HTMLAnchorElement>('.article-cta')].map((link) => ({
      href: link.getAttribute('href'),
      text: link.textContent,
    }));

    expect(page.textContent).toContain('Ready to try the Mistboard version?');
    expect(page.innerHTML).toContain('xq-diagram-palace-band');
    expect(ctaLinks).toEqual([
      {
        href: '/?play=computer&gameSpecId=dark-mini-xiangqi',
        text: 'Play Misty DMX',
      },
    ]);
  });

  it('keeps the Dark Crossroads Chess rules page directly reachable while unlisted', () => {
    vi.stubEnv('DEV', false);

    const page = buildArticlePage('dark-crossroads-chess');
    const landing = buildRulesIndex();
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
    expect(landing.textContent).not.toContain('Dark Crossroads Chess');
    expect(landing.querySelector('a[href="/rules/dark-crossroads-chess"]')).toBeNull();
    expect(
      landing.querySelector(
        'a[href="/rules/dark-crossroads-chess"] svg[data-mini-id="dark-crossroads"]',
      ),
    ).toBeNull();
    expect(
      page.querySelector(
        '.article-variant-sidebar a[aria-current="page"] svg[data-mini-id="dark-crossroads"]',
      ),
    ).toBeNull();
  });

  it('keeps the Dark Crazyhouse rules page directly reachable while unlisted', () => {
    // Xiangqi pivot: Dark Crazyhouse is de-listed from public rules surfaces
    // (variantPublicSurfaceEnabled=false) but the page stays reachable by direct
    // URL and still offers invite play — de-listed, not deleted.
    vi.stubEnv('DEV', false);

    const page = buildArticlePage('dark-crazyhouse');
    const landing = buildRulesIndex();
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
    expect(landing.querySelector('a[href="/rules/dark-crazyhouse"]')).toBeNull();
    expect(
      landing.querySelector('a[href="/rules/dark-crazyhouse"] svg[data-mini-id="dark-crazyhouse"]'),
    ).toBeNull();
    expect(
      page.querySelector(
        '.article-variant-sidebar a[aria-current="page"] svg[data-mini-id="dark-crazyhouse"]',
      ),
    ).toBeNull();
  });

  it('keeps the Drop Mini Xiangqi rules page directly reachable while unlisted', () => {
    // Xiangqi pivot: Drop Mini Xiangqi is de-listed from public rules surfaces
    // (variantPublicSurfaceEnabled=false) but the page stays reachable by direct
    // URL with its full play CTAs and sample-game widget — de-listed, not deleted.
    const page = buildArticlePage('drop-mini-xiangqi');
    const landing = buildRulesIndex();
    const links = [...page.querySelectorAll<HTMLAnchorElement>('a')].map((link) => ({
      href: link.getAttribute('href'),
      text: link.textContent,
    }));

    expect(page.textContent).toContain('Drop Mini Xiangqi Rules');
    expect(page.textContent).toContain('open for alpha play');
    expect(page.textContent).toContain('A sample game');
    expect(page.querySelector('[data-pending-widget="drop-mini-xiangqi-replay"]')).not.toBeNull();
    expect(links).toContainEqual({
      href: '/?play=computer&gameSpecId=drop-mini-xiangqi',
      text: 'Play the bot',
    });
    expect(links).toContainEqual({
      href: '/?play=friend&gameSpecId=drop-mini-xiangqi',
      text: 'Create invite',
    });
    expect(links).toContainEqual({
      href: '/?play=lobby&gameSpecId=drop-mini-xiangqi',
      text: 'Find opponent',
    });
    // De-listed from the rules index (no grid or sidebar entry).
    expect(landing.querySelector('a[href="/rules/drop-mini-xiangqi"]')).toBeNull();
    expect(
      page.querySelector(
        '.article-variant-sidebar a[aria-current="page"] svg[data-mini-id="drop-mini-xiangqi"]',
      ),
    ).toBeNull();
  });

  it('rerenders Dark Crossroads diagrams from the piece settings', () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() });
    // Pin the glyph set so the baseline CJK-disk assertion is stable; the test
    // then proves a switch to western re-renders the diagrams. Stamp the
    // piece-set rollout version so the one-time Dobutsu reset doesn't override
    // this explicit choice (simulates a post-rollout user).
    window.localStorage.setItem('mistboard.xiangqiPieceSetVersion', '2');
    window.localStorage.setItem('mistboard.xiangqiPieceSet', 'traditional');
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
    expect(current?.querySelector('.article-variant-label')?.textContent).toBe('Fog Chess');
    // Xiangqi pivot: the chess reference article is de-listed (showInIndex=false),
    // so the rail no longer links it (still reachable at /rules/chess directly).
    expect(sidebar?.querySelector('a[href="/rules/chess"]')).toBeNull();
  });

  it('de-lists the mini xiangqi trio from the rules sidebar but keeps pages reachable', () => {
    // Xiangqi pivot: the mini xiangqi trio is de-listed from the rules rail; the
    // pages stay reachable by direct URL (their own sidebar no longer links them).
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'false');

    const darkChess = buildArticlePage('dark-chess');
    expect(
      darkChess.querySelector('.article-variant-sidebar a[href="/rules/mini-xiangqi"]'),
    ).toBeNull();
    expect(
      darkChess.querySelector('.article-variant-sidebar a[href="/rules/dark-mini-xiangqi"]'),
    ).toBeNull();

    const miniXiangqi = buildArticlePage('mini-xiangqi');
    expect(miniXiangqi.textContent).toContain('Mini Xiangqi');
    expect(
      miniXiangqi.querySelector('.article-variant-sidebar a[href="/rules/mini-xiangqi"]'),
    ).toBeNull();
  });

  it('omits the variant sidebar on non-rules articles', () => {
    const page = buildArticlePage('dark-chess-concepts');
    expect(page.querySelector('.article-variant-sidebar')).toBeNull();
  });

  it('lists the rail as one flat variant list in canonical order', () => {
    const page = buildArticlePage('dark-chess');
    const sidebar = page.querySelector('.article-variant-sidebar');
    const titles = [...(sidebar?.querySelectorAll('.article-toc-title') ?? [])].map(
      (title) => title.textContent,
    );
    expect(titles).toEqual([]);

    const navs = sidebar?.querySelectorAll('.article-toc-nav');
    expect(navs).toHaveLength(1);
    const nav = navs?.[0];
    const hrefs = [...(nav?.querySelectorAll('a') ?? [])].map((link) => link.getAttribute('href'));
    // The mini xiangqi trio is de-listed; the rail uses the global canonical
    // order, including the animal-rank cluster: Flip Jungle, Banqi, Jungle.
    expect(nav?.querySelector('a[href="/rules/mini-xiangqi"]')).toBeNull();
    expect(nav?.querySelector('a[href="/rules/dark-mini-xiangqi"]')).toBeNull();
    expect(nav?.querySelector('a[href="/rules/dark-xiangqi"]')).not.toBeNull();
    expect(nav?.querySelector('a[href="/rules/jieqi"]')).not.toBeNull();
    expect(nav?.querySelector('a[href="/rules/jungle"]')).not.toBeNull();
    expect(nav?.querySelector('a[href="/rules/jungle-flip"]')).not.toBeNull();
    expect(nav?.querySelector('a[href="/rules/banqi"]')).not.toBeNull();
    expect(nav?.querySelector('a[href="/rules/dark-chess"]')).not.toBeNull();
    // Xiangqi pivot: the chess reference article is de-listed from the rail.
    expect(nav?.querySelector('a[href="/rules/chess"]')).toBeNull();
    // Draft960 is a pregame option that has not shipped as a playable mode.
    expect(nav?.querySelector('a[href="/rules/dark-draft960"]')).toBeNull();
    expect(nav?.querySelector('a[href="/rules/shogi"]')).not.toBeNull();
    expect(nav?.querySelector('a[href="/rules/dark-shogi"]')).not.toBeNull();
    expect(hrefs.indexOf('/rules/xiangqi')).toBeLessThan(hrefs.indexOf('/rules/fortress-xiangqi'));
    expect(hrefs.indexOf('/rules/jieqi')).toBeLessThan(hrefs.indexOf('/rules/jungle-flip'));
    expect(hrefs.indexOf('/rules/jungle-flip')).toBeLessThan(hrefs.indexOf('/rules/banqi'));
    expect(hrefs.indexOf('/rules/banqi')).toBeLessThan(hrefs.indexOf('/rules/jungle'));
    expect(hrefs.indexOf('/rules/jungle')).toBeLessThan(hrefs.indexOf('/rules/dark-chess'));
    expect(hrefs.indexOf('/rules/dark-chess')).toBeLessThan(hrefs.indexOf('/rules/shogi'));
  });

  it('lists the elevated xiangqi variants (not the hidden mini trio) by default', () => {
    // Xiangqi pivot: the mini trio is de-listed; the rail leads with standard
    // Xiangqi as the open-info anchor.
    const page = buildArticlePage('dark-chess');
    const links = [...page.querySelectorAll('.article-variant-sidebar a')];
    expect(links[0]?.getAttribute('href')).toBe('/rules/xiangqi');
    expect(
      page.querySelector('.article-variant-sidebar a[href="/rules/dark-mini-xiangqi"]'),
    ).toBeNull();
    expect(page.querySelector('.article-variant-sidebar a[href="/rules/mini-xiangqi"]')).toBeNull();
    expect(
      page.querySelector('.article-variant-sidebar a[href="/rules/dark-xiangqi"]'),
    ).not.toBeNull();
  });

  it('renders the rules landing with the rail and a tile grid picker', () => {
    const landing = buildRulesIndex();
    expect(landing.querySelector('.article-variant-sidebar')).not.toBeNull();
    expect(landing.querySelector('.rules-landing-paragraph')).not.toBeNull();
    const tile = landing.querySelector<HTMLAnchorElement>(
      '.rules-landing-tile[href="/rules/dark-chess"]',
    );
    expect(tile?.querySelector('.rules-landing-tile-label')?.textContent).toBe('Fog Chess');
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

  it('groups the tile grid: xiangqi, jungle, chess, then shogi', () => {
    const landing = buildRulesIndex();
    const titles = [...landing.querySelectorAll('.rules-landing-group-title')].map(
      (el) => el.textContent,
    );
    expect(titles).toEqual([
      'Xiangqi variants',
      'Animal chess',
      'Chess variants',
      'Shogi variants',
    ]);
    const grids = landing.querySelectorAll('.rules-landing-grid');
    expect(grids[0]?.querySelector('a[href="/rules/xiangqi"]')).not.toBeNull();
    // Xiangqi pivot: the mini xiangqi trio is de-listed from the tile grid
    // (still reachable by direct URL).
    expect(grids[0]?.querySelector('a[href="/rules/drop-mini-xiangqi"]')).toBeNull();
    expect(grids[0]?.querySelector('a[href="/rules/dark-xiangqi"]')).not.toBeNull();
    expect(grids[1]?.querySelector('a[href="/rules/jungle"]')).not.toBeNull();
    expect(grids[1]?.querySelector('a[href="/rules/jungle-flip"]')).not.toBeNull();
    expect(grids[2]?.querySelector('a[href="/rules/dark-chess"]')).not.toBeNull();
    // The chess reference article is de-listed from the tile grid.
    expect(grids[2]?.querySelector('a[href="/rules/chess"]')).toBeNull();
    expect(grids[3]?.querySelector('a[href="/rules/shogi"]')).not.toBeNull();
    expect(grids[3]?.querySelector('a[href="/rules/dark-shogi"]')).not.toBeNull();
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
    // The shuffled-start board is the section hero (a single enlarged board,
    // matching the Xiangqi page); the movement diagrams are paired boards.
    const jieqiHero = jieqiSvgs.filter((svg) => svg.classList.contains('xq-article-svg--hero'));
    expect(jieqiHero).toHaveLength(1);
    expect(jieqiHero[0]!.getAttribute('data-xq-layout')).toBe('single');
    expect(
      jieqiSvgs
        .filter((svg) => !svg.classList.contains('xq-article-svg--hero'))
        .every((svg) => svg.getAttribute('data-xq-layout') === 'pair'),
    ).toBe(true);
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

  it('localizes zh-Hans Banqi SVG labels and replay chrome', () => {
    const page = buildArticlePage('banqi', 'zh-Hans');
    document.body.append(page);

    const textBeforeMount = page.textContent ?? '';
    expect(textBeforeMount).toContain('首次翻子决定颜色');
    expect(textBeforeMount).toContain('台湾等级序列');
    expect(textBeforeMount).toContain('炮隔子吃');
    expect(textBeforeMount).toContain('炮进攻时隔一子跳吃，不看等级。');
    expect(textBeforeMount).not.toContain('FIRST FLIP ASSIGNS COLOR');
    expect(textBeforeMount).not.toContain('TAIWAN RANK LADDER');
    expect(textBeforeMount).not.toContain('CANNON SCREEN CAPTURE');

    const controllers = mountPendingWidgets(page);
    try {
      const textAfterMount = page.textContent ?? '';
      expect(textAfterMount).toContain('MistyBanqi · 最强（先手） vs 人类（后手）');
      expect(textAfterMount).toContain('人类对引擎');
      expect(textAfterMount).toContain('MistyBanqi（红方）因对手认输获胜 · 49 回合');
      expect(textAfterMount).toContain('逐步回放这盘棋。红方先走');
      expect(textAfterMount).not.toContain('Human vs engine');
      expect(textAfterMount).not.toContain('(first)');
      expect(textAfterMount).not.toContain('49 moves');
    } finally {
      for (const controller of controllers) controller.destroy();
    }
  });

  it('keeps fogged xiangqi blockers as question-mark pieces', () => {
    const page = buildArticlePage('dark-xiangqi');
    const figureText = [...page.querySelectorAll('.article-figure')]
      .map((figure) => figure.textContent)
      .join('');

    expect(figureText).toContain('?');
  });
});
