import { promises as fs } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { Color } from '@mistboard/game';
import { GAME_OG_IMAGE_VERSION } from './og-image.js';
import * as persistence from './persistence.js';

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
    description: 'Long-form writing on dark chess: variants, strategy, and engine research.',
    htmlLang: 'en',
  },
  'zh-hans': {
    title: '文章 | Mistboard',
    description: '迷雾国际象棋的变体、策略与引擎工作。',
    htmlLang: 'zh-Hans',
  },
  'zh-hant': {
    title: '文章 | Mistboard',
    description: '迷霧國際象棋的變體、策略與引擎工作。',
    htmlLang: 'zh-Hant',
  },
};

const RULES_INDEX_META: Record<
  'en' | 'zh-hans' | 'zh-hant',
  { title: string; description: string; htmlLang: string }
> = {
  en: {
    title: 'Rules | Mistboard',
    description: 'Reference rules for Mistboard games and Fog of War variants.',
    htmlLang: 'en',
  },
  'zh-hans': {
    title: '规则 | Mistboard',
    description: 'Mistboard 游戏与战争迷雾变体的规则参考。',
    htmlLang: 'zh-Hans',
  },
  'zh-hant': {
    title: '規則 | Mistboard',
    description: 'Mistboard 遊戲與戰爭迷霧變體的規則參考。',
    htmlLang: 'zh-Hant',
  },
};

// Article slug -> page meta. Content source of truth is
// apps/web/src/articles-data.ts; this map duplicates only the share-card
// surface (title + description) plus `kind`, which decides the canonical URL
// space: kind 'rules' lives under /rules/<slug>, everything else under
// /articles/<slug>. Keep in sync when titles/summaries/kind change.
type ArticleKind = 'rules' | 'article';
export const ARTICLE_META: Record<
  string,
  { title: string; description: string; kind: ArticleKind }
> = {
  chess: {
    title: 'Chess Rules',
    kind: 'rules',
    description:
      'Standard chess rules, the primer behind Dark Chess: castling, promotion, en passant, the draw rules, and a famous game to play through.',
  },
  'dark-chess': {
    title: 'Dark Chess Rules',
    kind: 'rules',
    description:
      'Chess under Fog of War: each side sees only the squares its pieces reach, there are no check warnings, and the king falls by capture.',
  },
  'dark-chess-concepts': {
    title: 'Dark Chess Concepts',
    kind: 'article',
    description:
      'Strategy concepts for dark chess: how to read fogged squares, pawn signals, vanished moves, and capture clues after you know the rules.',
  },
  'dark-draft960': {
    title: 'Dark Draft960',
    kind: 'rules',
    description:
      "Dark Chess with a sealed opening draft: each player picks one of three Chess960 back ranks and never sees the other's.",
  },
  xiangqi: {
    title: 'Xiangqi Rules',
    kind: 'rules',
    description:
      'Standard xiangqi rules, the primer behind Dark Xiangqi: palaces, the river, cannon screens, facing generals, and a famous game to play through.',
  },
  'dark-xiangqi': {
    title: 'Dark Xiangqi',
    kind: 'rules',
    description:
      'Xiangqi under Fog of War: each side sees only the points its pieces reach, hidden blockers matter, and the general falls by capture.',
  },
  'mini-xiangqi': {
    title: 'Mini Xiangqi',
    kind: 'rules',
    description:
      'Mini Xiangqi rules, the 7×7 primer behind Dark Mini Xiangqi: no advisors or elephants, no river, sideways soldiers, and checkmate to win.',
  },
  'dark-mini-xiangqi': {
    title: 'Dark Mini Xiangqi',
    kind: 'rules',
    description:
      'Mini Xiangqi under Fog of War: each side sees only the points its pieces reach on the 7×7 board, and the general falls by capture.',
  },
  'engine-belief-state': {
    title: 'Building an engine for hidden-information chess',
    kind: 'article',
    description:
      "Stockfish-class engines don't transfer to dark chess because they assume perfect information. The right technique is belief-state search with particle-filter approximations.",
  },
};

export function canonicalArticleBase(slug: string): 'articles' | 'rules' {
  return ARTICLE_META[slug]?.kind === 'rules' ? 'rules' : 'articles';
}

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
    const title = `${white} vs ${black} · Dark Chess replay | Mistboard`;
    const description = 'Replay this Dark Chess game from both player views on Mistboard.';
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

// Sitemap of public, indexable surfaces: static content routes plus every
// pre-rendered article (discovered from dist/articles/*.html, so the published
// set stays the single source of truth in articles-data -> prerender output).
export async function serveSitemap(params: {
  response: ServerResponse;
  publicHost: string;
  staticDir: string;
}): Promise<void> {
  const staticRoutes = [
    '/',
    '/articles',
    '/rules',
    '/zh-hans/rules',
    '/zh-hant/rules',
    '/about',
    '/learn',
    '/leaderboard',
    '/source',
    '/faq',
  ];
  // Each article is listed once per pre-rendered language variant (dist/articles,
  // dist/zh-hans/articles, dist/zh-hant/articles), so the published+translated set
  // stays single-sourced in the prerender output.
  const readSlugs = (dir: string): Promise<string[]> =>
    fs
      .readdir(resolve(params.staticDir, dir))
      .then((files) =>
        files.filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -'.html'.length)),
      )
      .catch(() => [] as string[]);
  const langDirs: Array<[string, string]> = [
    ['articles', '/articles'],
    ['zh-hans/articles', '/zh-hans/articles'],
    ['zh-hant/articles', '/zh-hant/articles'],
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
  // /rules/<slug>, everything else under /articles/<slug>; a mismatch 301s.
  base: 'articles' | 'rules';
  response: ServerResponse;
  publicHost: string;
  staticDir: string;
  langPrefix?: string;
}): Promise<void> {
  // Resolve any renamed legacy slug, then 301 if the slug was renamed or the URL
  // space doesn't match the article's canonical base (rules vs articles),
  // preserving the language prefix. This single redirect covers /articles/<rules>
  // -> /rules/<rules>, the old *-rules / *-rules-primer slugs, and the reverse
  // /rules/<article> -> /articles/<article>.
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
    url: `${params.publicHost}${langKey === 'en' ? '' : `/${langKey}`}/articles`,
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
