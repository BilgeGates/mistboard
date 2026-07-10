import { promises as fs } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { Color } from '@mistboard/game';
import { ARTICLE_META, canonicalArticleBase } from './article-meta.js';
import { GAME_OG_IMAGE_VERSION } from './og-image.js';
import * as persistence from './persistence.js';

export { ARTICLE_META, canonicalArticleBase };

export type PageMeta = {
  title: string;
  description: string;
  url: string;
  imageUrl?: string; // omit to keep the default OG image from index.html
};

const ARTICLES_INDEX_META: Record<
  'en' | 'zh-hans' | 'zh-hant',
  { title: string; description: string; htmlLang: string }
> = {
  en: {
    title: 'Articles | Mistboard',
    description: 'Long-form writing on original strategy games, rules, and engine research.',
    htmlLang: 'en',
  },
  'zh-hans': {
    title: '文章 | Mistboard',
    description: '原创策略游戏的文章、规则说明与引擎工作。',
    htmlLang: 'zh-Hans',
  },
  'zh-hant': {
    title: '文章 | Mistboard',
    description: '原創策略遊戲的文章、規則說明與引擎工作。',
    htmlLang: 'zh-Hant',
  },
};

const RULES_INDEX_META: Record<
  'en' | 'zh-hans' | 'zh-hant',
  { title: string; description: string; htmlLang: string }
> = {
  en: {
    title: 'Rules | Mistboard',
    description: 'Reference rules for Mistboard games, classic bases, and Fog of War variants.',
    htmlLang: 'en',
  },
  'zh-hans': {
    title: '规则 | Mistboard',
    description: 'Mistboard 游戏、经典基础规则与战争迷雾变体的规则参考。',
    htmlLang: 'zh-Hans',
  },
  'zh-hant': {
    title: '規則 | Mistboard',
    description: 'Mistboard 遊戲、經典基礎規則與戰爭迷霧變體的規則參考。',
    htmlLang: 'zh-Hant',
  },
};

// Articles renamed for cleaner URLs (old slug -> new clean slug). serveArticlePage
// 301s these to the new slug's canonical base so previously-published links and
// crawler-cached URLs don't 404. The rules docs also moved from /articles/<slug>
// to /rules/<slug>, so every legacy rules slug redirects here too.
const RENAMED_ARTICLE_SLUGS: Record<string, string> = {
  'chess-rules-primer': 'chess',
  'xiangqi-rules-primer': 'xiangqi',
  'chess-rules': 'chess',
  'dark-chess-rules': 'dark-chess',
  'xiangqi-rules': 'xiangqi',
  'dark-xiangqi-rules': 'dark-xiangqi',
  'mini-xiangqi-rules': 'mini-xiangqi',
  'dark-mini-xiangqi-rules': 'dark-mini-xiangqi',
  draft960: 'dark-draft960',
};

export function injectPageMeta(html: string, meta: PageMeta): string {
  let out = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`)
    .replace(
      /(<meta\s+name="description"\s+content=")[^"]*(")/,
      `$1${escapeHtml(meta.description)}$2`,
    )
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, `$1${escapeHtml(meta.title)}$2`)
    .replace(
      /(<meta\s+property="og:description"\s+content=")[^"]*(")/,
      `$1${escapeHtml(meta.description)}$2`,
    )
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/, `$1${escapeHtml(meta.url)}$2`)
    .replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/, `$1${escapeHtml(meta.title)}$2`)
    .replace(
      /(<meta\s+name="twitter:description"\s+content=")[^"]*(")/,
      `$1${escapeHtml(meta.description)}$2`,
    );
  if (meta.imageUrl) {
    out = out
      .replace(
        /(<meta\s+property="og:image"\s+content=")[^"]*(")/,
        `$1${escapeHtml(meta.imageUrl)}$2`,
      )
      .replace(
        /(<meta\s+name="twitter:image"\s+content=")[^"]*(")/,
        `$1${escapeHtml(meta.imageUrl)}$2`,
      );
  }
  return out;
}

export async function serveGamePage(params: {
  roomId: string;
  response: ServerResponse;
  publicHost: string;
  staticDir: string;
}): Promise<void> {
  const game = await persistence.getGameSummary(params.roomId);
  const indexPath = resolve(params.staticDir, 'index.html');
  let html = await fs.readFile(indexPath, 'utf-8');

  if (game) {
    const white = gamePageParticipantName(game, 'white');
    const black = gamePageParticipantName(game, 'black');
    const title = `${white} vs ${black} · Fog Chess replay | Mistboard`;
    const description = 'Replay this Fog Chess game from both player views on Mistboard.';
    const url = `${params.publicHost}/game/${encodeURIComponent(params.roomId)}`;
    const imageUrl = `${params.publicHost}/og/game/${encodeURIComponent(params.roomId)}.png?v=${GAME_OG_IMAGE_VERSION}`;
    html = injectPageMeta(html, { title, description, url, imageUrl });
  }

  params.response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  params.response.end(html);
}

function gamePageParticipantName(game: persistence.GameRecord, color: Color): string {
  return (
    game.participants.find((participant) => participant.color === color)?.displayName ??
    (color === 'white' ? game.whiteName : game.blackName) ??
    (color === 'white' ? 'White' : 'Black')
  );
}

// Serves a prerendered page file from dist (home.html for `/`,
// player.html for `/player`), so crawlers, no-JS clients, and first
// paint get real content instead of the empty SPA shell. Throws when the file
// is absent (e.g. an older build) so the caller can fall back to serving
// index.html (the bare shell).
export async function servePrerenderedPage(params: {
  response: ServerResponse;
  staticDir: string;
  file: 'home.html' | 'leaderboard.html' | 'player.html';
}): Promise<void> {
  const html = await fs.readFile(resolve(params.staticDir, params.file), 'utf-8');
  params.response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  params.response.end(html);
}

// Sitemap of public, indexable surfaces: static content routes plus every
// pre-rendered article (discovered from dist/blog/*.html, so the published
// set stays the single source of truth in articles-data -> prerender output).
export async function serveSitemap(params: {
  response: ServerResponse;
  publicHost: string;
  staticDir: string;
}): Promise<void> {
  const staticRoutes = [
    '/',
    '/blog',
    '/rules',
    '/zh-hans/rules',
    '/zh-hant/rules',
    '/about',
    '/learn',
    '/puzzles',
    '/videos',
    '/player',
    '/player/rating-stats',
    '/coach',
    '/forum',
    '/source',
    '/faq',
    '/patron',
  ];
  // Each article is listed once per pre-rendered language variant (dist/blog,
  // dist/zh-hans/blog, dist/zh-hant/blog), so the published+translated set
  // stays single-sourced in the prerender output.
  const readSlugs = (dir: string): Promise<string[]> =>
    fs
      .readdir(resolve(params.staticDir, dir))
      .then((files) =>
        files.filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -'.html'.length)),
      )
      .catch(() => [] as string[]);
  const langDirs: Array<[string, string]> = [
    ['blog', '/blog'],
    ['zh-hans/blog', '/zh-hans/blog'],
    ['zh-hant/blog', '/zh-hant/blog'],
    ['rules', '/rules'],
    ['zh-hans/rules', '/zh-hans/rules'],
    ['zh-hant/rules', '/zh-hant/rules'],
  ];
  const articleUrls: string[] = [];
  for (const [dir, urlBase] of langDirs) {
    for (const slug of await readSlugs(dir)) {
      articleUrls.push(`${urlBase}/${encodeURIComponent(slug)}`);
    }
  }
  const urls = [...staticRoutes, ...articleUrls];
  const body = urls.map((path) => `  <url><loc>${params.publicHost}${path}</loc></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  params.response.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' });
  params.response.end(xml);
}

export async function serveArticlePage(params: {
  slug: string;
  // Which URL space the request arrived on. Rules docs are canonical under
  // /rules/<slug>, everything else under /blog/<slug>; a mismatch 301s. The
  // legacy 'articles' base is never canonical, so a request on /articles/<slug>
  // always 301s to its /blog (or /rules) home.
  base: 'blog' | 'rules' | 'articles';
  response: ServerResponse;
  publicHost: string;
  staticDir: string;
  langPrefix?: string;
}): Promise<void> {
  // Resolve any renamed legacy slug, then 301 if the slug was renamed or the URL
  // space doesn't match the article's canonical base (rules vs blog), preserving
  // the language prefix. This single redirect covers legacy /articles/<slug> ->
  // /blog (or /rules), the old *-rules / *-rules-primer slugs, and the reverse
  // /rules/<article> -> /blog/<article>.
  const resolved = RENAMED_ARTICLE_SLUGS[params.slug] ?? params.slug;
  const canonicalBase = canonicalArticleBase(resolved);
  const prefix = params.langPrefix ? `/${params.langPrefix}` : '';
  if (resolved !== params.slug || params.base !== canonicalBase) {
    params.response.writeHead(301, { location: `${prefix}/${canonicalBase}/${resolved}` });
    params.response.end();
    return;
  }

  // Published articles are pre-rendered at build time (apps/web/scripts/
  // prerender-articles.mjs): prose + meta baked into the document so crawlers
  // and LLMs see real content, not an empty #app. Translated variants live under
  // dist/<lang>/<base>/<slug>.html. Serve the file when present; the client SPA
  // still boots and rebuilds #app on takeover. Slug + lang are charset-validated
  // so a decoded path can't escape the dist root.
  if (
    /^[a-z0-9-]+$/.test(params.slug) &&
    (params.langPrefix === undefined || /^zh-han[st]$/.test(params.langPrefix))
  ) {
    const segments = params.langPrefix
      ? [params.staticDir, params.langPrefix, canonicalBase, `${params.slug}.html`]
      : [params.staticDir, canonicalBase, `${params.slug}.html`];
    const prerendered = await fs.readFile(resolve(...segments), 'utf-8').catch(() => null);
    if (prerendered !== null) {
      params.response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      params.response.end(prerendered);
      return;
    }
  }

  // Fallback for draft/outline articles (not pre-rendered): shell + meta only.
  // Language-prefixed routes only ever serve pre-rendered files; a missing zh
  // file falls through here to the English shell rather than 404, which is fine.
  const indexPath = resolve(params.staticDir, 'index.html');
  let html = await fs.readFile(indexPath, 'utf-8');
  const article = ARTICLE_META[params.slug];
  if (article) {
    const url = `${params.publicHost}/${canonicalBase}/${encodeURIComponent(params.slug)}`;
    html = injectPageMeta(html, {
      title: `${article.title} | Mistboard`,
      description: article.description,
      url,
      imageUrl: `${params.publicHost}/og/article/${encodeURIComponent(params.slug)}.png`,
    });
  }
  params.response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  params.response.end(html);
}

export async function serveArticlesIndexPage(params: {
  response: ServerResponse;
  publicHost: string;
  staticDir: string;
  langPrefix?: string;
}): Promise<void> {
  const indexPath = resolve(params.staticDir, 'index.html');
  let html = await fs.readFile(indexPath, 'utf-8');
  const langKey =
    params.langPrefix === 'zh-hans' || params.langPrefix === 'zh-hant' ? params.langPrefix : 'en';
  const meta = ARTICLES_INDEX_META[langKey];
  if (langKey !== 'en') {
    html = html.replace('<html lang="en">', `<html lang="${meta.htmlLang}">`);
  }
  html = injectPageMeta(html, {
    title: meta.title,
    description: meta.description,
    url: `${params.publicHost}${langKey === 'en' ? '' : `/${langKey}`}/blog`,
  });
  params.response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  params.response.end(html);
}

export async function serveRulesIndexPage(params: {
  response: ServerResponse;
  publicHost: string;
  staticDir: string;
  langPrefix?: string;
}): Promise<void> {
  const indexPath = resolve(params.staticDir, 'index.html');
  let html = await fs.readFile(indexPath, 'utf-8');
  const langKey =
    params.langPrefix === 'zh-hans' || params.langPrefix === 'zh-hant' ? params.langPrefix : 'en';
  const meta = RULES_INDEX_META[langKey];
  if (langKey !== 'en') {
    html = html.replace('<html lang="en">', `<html lang="${meta.htmlLang}">`);
  }
  html = injectPageMeta(html, {
    title: meta.title,
    description: meta.description,
    url: `${params.publicHost}${langKey === 'en' ? '' : `/${langKey}`}/rules`,
  });
  params.response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  params.response.end(html);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
