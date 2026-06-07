// Build-time pre-render for published articles.
//
// Runs AFTER `vite build`, against the hashed `dist/index.html` shell. For each
// published article it renders the real client renderer (buildArticlePage) under
// happy-dom, bakes the resulting <main> into #app, injects per-route meta from
// articles-data (single source of truth), and writes dist/articles/<slug>.html.
//
// The server serves these files for /articles/<slug>; the client SPA still boots
// and replaceChildren()s #app on takeover, mounting the deferred board widgets.
// So crawlers/LLMs and first paint get real prose; humans get the full app.
import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');
const host = process.env.MISTBOARD_HOST ?? 'https://mistboard.com';

// --- happy-dom globals (Node 26: some globals are read-only getters) ---------
const win = new Window({ url: host });
const define = (key, value) => {
  try {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  } catch {
    /* read-only getter we can't override; leave Node's own */
  }
};
define('window', win);
define('document', win.document);
define('navigator', win.navigator);
for (const key of [
  'HTMLElement', 'HTMLHeadingElement', 'HTMLParagraphElement', 'HTMLAnchorElement',
  'HTMLLIElement', 'HTMLUListElement', 'Element', 'Node', 'SVGElement', 'SVGSVGElement',
  'SVGGElement', 'SVGPathElement', 'SVGRectElement', 'SVGCircleElement',
  'SVGTextElement', 'SVGUseElement', 'SVGLineElement', 'SVGImageElement',
  'CustomEvent', 'Event', 'DOMParser', 'customElements',
  'IntersectionObserver', 'MutationObserver', 'ResizeObserver',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
]) {
  if (win[key] !== undefined && globalThis[key] === undefined) define(key, win[key]);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Mirror of the server's injectPageMeta so pre-rendered pages carry the same
// share-card surface. Source of truth is the article record, not a duplicated map.
function injectPageMeta(html, meta) {
  let out = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${escapeHtml(meta.description)}$2`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, `$1${escapeHtml(meta.title)}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${escapeHtml(meta.description)}$2`)
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/, `$1${escapeHtml(meta.url)}$2`)
    .replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/, `$1${escapeHtml(meta.title)}$2`)
    .replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/, `$1${escapeHtml(meta.description)}$2`);
  if (meta.imageUrl) {
    out = out
      .replace(/(<meta\s+property="og:image"\s+content=")[^"]*(")/, `$1${escapeHtml(meta.imageUrl)}$2`)
      .replace(/(<meta\s+name="twitter:image"\s+content=")[^"]*(")/, `$1${escapeHtml(meta.imageUrl)}$2`);
  }
  return out;
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const { buildArticlePage } = await server.ssrLoadModule('/src/articles.ts');
  const { articles } = await server.ssrLoadModule('/src/articles-data.ts');
  const { translateArticle } = await server.ssrLoadModule('/src/article-i18n.ts');

  // en + the two zh scripts. urlPrefix feeds canonical/hreflang URLs; htmlLang
  // sets <html lang> and JSON-LD inLanguage; langDir is the output-path segment.
  // The base segment (articles vs rules) is chosen per-article from its kind.
  const variants = [
    { lang: null, urlPrefix: '', htmlLang: 'en', langDir: null },
    { lang: 'zh-Hans', urlPrefix: '/zh-hans', htmlLang: 'zh-Hans', langDir: 'zh-hans' },
    { lang: 'zh-Hant', urlPrefix: '/zh-hant', htmlLang: 'zh-Hant', langDir: 'zh-hant' },
  ];

  const shell = await fs.readFile(resolve(distDir, 'index.html'), 'utf-8');
  if (!shell.includes('<div id="app"></div>')) {
    throw new Error('shell index.html missing empty <div id="app"></div> mount point');
  }

  const published = articles.filter((a) => a.status === 'published');
  let count = 0;

  for (const article of published) {
    const slug = encodeURIComponent(article.slug);
    // Rules docs are canonical under /rules/<slug>, everything else /articles/<slug>.
    const base = article.kind === 'rules' ? 'rules' : 'articles';
    // OG card stays English for all variants for now (the card renderer has no
    // CJK font; baking zh titles would render tofu). hreflang is identical on
    // every variant: all three point at each other + x-default → English.
    const imageUrl = `${host}/og/article/${slug}.png`;
    const hreflang = [
      `<link rel="alternate" hreflang="en" href="${host}/${base}/${slug}" />`,
      `<link rel="alternate" hreflang="zh-Hans" href="${host}/zh-hans/${base}/${slug}" />`,
      `<link rel="alternate" hreflang="zh-Hant" href="${host}/zh-hant/${base}/${slug}" />`,
      `<link rel="alternate" hreflang="x-default" href="${host}/${base}/${slug}" />`,
    ].join('');

    for (const v of variants) {
      const localized = v.lang ? translateArticle(article, v.lang) : article;
      const main = buildArticlePage(article.slug, v.lang ?? undefined);
      const url = `${host}${v.urlPrefix}/${base}/${slug}`;
      let html = shell
        .replace('<html lang="en">', `<html lang="${v.htmlLang}">`)
        .replace('<div id="app"></div>', `<div id="app">${main.outerHTML}</div>`);
      html = injectPageMeta(html, {
        title: `${localized.title} | Mistboard`,
        description: localized.summary,
        url,
        imageUrl,
      });
      const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        inLanguage: v.htmlLang,
        headline: localized.title,
        description: localized.summary,
        image: imageUrl,
        author: { '@type': 'Organization', name: 'Mistboard' },
        publisher: { '@type': 'Organization', name: 'Mistboard' },
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
        ...(article.updatedAt ? { dateModified: article.updatedAt } : {}),
      };
      const ldScript = `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`;
      // Self-referencing canonical: each language variant declares its OWN clean
      // URL as canonical (not all three → English). hreflang expresses the
      // language relationship; the canonical consolidates query-param, SPA-shell,
      // and trailing-slash variants of THIS url into a single indexed page.
      const canonical = `<link rel="canonical" href="${url}" />`;
      html = html.replace('</head>', `${canonical}${hreflang}${ldScript}</head>`);

      const dir = resolve(distDir, ...(v.langDir ? [v.langDir, base] : [base]));
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(resolve(dir, `${article.slug}.html`), html, 'utf-8');
      count += 1;
      console.log(`prerendered ${v.urlPrefix}/${base}/${article.slug} (lang=${v.htmlLang})`);
    }
  }
  console.log(`done: ${count} page(s) across ${published.length} article(s) × ${variants.length} langs`);

  // Homepage: bake the static landing shell so crawlers, no-JS clients, and
  // first paint get real content (heading, play panel, article links, footer)
  // instead of the empty SPA shell. index.html already carries the homepage meta;
  // we add a self-referencing canonical and write a separate home.html (the bare
  // index.html stays the empty shell that every other client route falls back to).
  const { renderLandingShellForPrerender } = await server.ssrLoadModule('/src/landing.ts');
  const landingInner = renderLandingShellForPrerender();
  let homeHtml = shell.replace('<div id="app"></div>', `<div id="app">${landingInner}</div>`);
  homeHtml = homeHtml.replace('</head>', `<link rel="canonical" href="${host}/" /></head>`);
  await fs.writeFile(resolve(distDir, 'home.html'), homeHtml, 'utf-8');
  console.log('prerendered / (home.html)');
} catch (err) {
  console.error('prerender failed:', err);
  process.exitCode = 1;
} finally {
  await server.close();
}
