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
  'HTMLLIElement', 'HTMLUListElement', 'Element', 'Node', 'SVGElement',
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

  const shell = await fs.readFile(resolve(distDir, 'index.html'), 'utf-8');
  if (!shell.includes('<div id="app"></div>')) {
    throw new Error('shell index.html missing empty <div id="app"></div> mount point');
  }

  const published = articles.filter((a) => a.status === 'published');
  await fs.mkdir(resolve(distDir, 'articles'), { recursive: true });

  for (const article of published) {
    const main = buildArticlePage(article.slug);
    const url = `${host}/articles/${encodeURIComponent(article.slug)}`;
    const imageUrl = `${host}/og/article/${encodeURIComponent(article.slug)}.png`;
    let html = shell.replace('<div id="app"></div>', `<div id="app">${main.outerHTML}</div>`);
    html = injectPageMeta(html, {
      title: `${article.title} | Mistboard`,
      description: article.summary,
      url,
      imageUrl,
    });
    // schema.org Article: makes the page eligible for rich results and gives
    // crawlers/LLMs an explicit, machine-readable summary of the canonical content.
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description: article.summary,
      image: imageUrl,
      author: { '@type': 'Organization', name: 'Mistboard' },
      publisher: { '@type': 'Organization', name: 'Mistboard' },
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
      ...(article.updatedAt ? { dateModified: article.updatedAt } : {}),
    };
    const ldScript = `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`;
    html = html.replace('</head>', `${ldScript}</head>`);
    const outPath = resolve(distDir, 'articles', `${article.slug}.html`);
    await fs.writeFile(outPath, html, 'utf-8');
    console.log(`prerendered /articles/${article.slug} (${html.length} bytes, body+${main.outerHTML.length})`);
  }
  console.log(`done: ${published.length} article(s)`);
} catch (err) {
  console.error('prerender failed:', err);
  process.exitCode = 1;
} finally {
  await server.close();
}
