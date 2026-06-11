// Visual audit of OG share cards. Builds one HTML page with every article
// card plus the default site card and opens it in the browser. Each tile is
// badged from the endpoint's actual behavior, so missing art is loud:
//   custom   — the slug renders its own card (200)
//   GENERIC  — the endpoint 302s to the default og-image.png (no art wired)
//   ERROR    — unreachable / unexpected status
//
// Usage:
//   npm run og:preview                                  # dev server (localhost:3001)
//   npm run og:preview -- --base https://mistboard.com  # audit prod
//
// Slugs come from apps/server/src/article-meta.ts (the same map the og route
// serves from, gated against articles-data by the web sync test), so new
// articles show up here without touching this script.

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const baseFlag = process.argv.indexOf('--base');
const base =
  baseFlag > -1 ? process.argv[baseFlag + 1].replace(/\/$/, '') : 'http://localhost:3001';

// Node strips types natively, so the server's dependency-free meta module
// imports directly.
const metaPath = resolve(here, '..', 'apps', 'server', 'src', 'article-meta.ts');
const { ARTICLE_META } = await import(pathToFileURL(metaPath).href);

const stamp = Date.now();
const cards = await Promise.all(
  Object.entries(ARTICLE_META).map(async ([slug, meta]) => {
    const url = `${base}/og/article/${encodeURIComponent(slug)}.png`;
    let status = 0;
    try {
      status = (await fetch(url, { redirect: 'manual' })).status;
    } catch {
      // leave status 0: unreachable
    }
    const badge = status === 200 ? 'custom' : status === 302 ? 'GENERIC' : `ERROR ${status}`;
    return { slug, title: meta.title, url, badge };
  }),
);

const badgeClass = (badge) => (badge === 'custom' ? 'ok' : badge === 'GENERIC' ? 'warn' : 'err');
const tiles = cards
  .map(
    (card) => `  <figure>
    <img src="${card.url}?t=${stamp}" loading="lazy">
    <figcaption>${card.slug} — ${card.title}<span class="tag ${badgeClass(card.badge)}">${card.badge}</span></figcaption>
  </figure>`,
  )
  .join('\n');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>OG preview — ${base}</title>
<style>
  body { background: #16191f; color: #e5e7eb; font-family: system-ui, sans-serif; margin: 24px; }
  h1 { font-size: 18px; font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 24px; margin-top: 16px; }
  figure { margin: 0; }
  img { width: 100%; border: 1px solid #2a2f38; border-radius: 6px; display: block; aspect-ratio: 1200 / 630; background: #0f1115; }
  figcaption { font-size: 13px; margin-top: 6px; color: #cbd5e1; }
  .tag { display: inline-block; font-size: 11px; padding: 1px 7px; border-radius: 9px; margin-left: 6px; vertical-align: 1px; }
  .ok { background: #14532d; color: #d1fae5; }
  .warn { background: #92400e; color: #fef3c7; }
  .err { background: #7f1d1d; color: #fee2e2; }
</style></head><body>
<h1>OG cards — ${base} (${new Date(stamp).toISOString()})</h1>
<div class="grid">
${tiles}
  <figure>
    <img src="${base}/og-image.png?t=${stamp}" loading="lazy">
    <figcaption>default site card (og-image.png)<span class="tag ok">baked</span></figcaption>
  </figure>
</div>
</body></html>
`;

const outPath = '/tmp/og-preview.html';
writeFileSync(outPath, html);

const generic = cards.filter((card) => card.badge !== 'custom');
console.log(`${cards.length} article cards checked against ${base}`);
if (generic.length > 0) {
  for (const card of generic) console.log(`  ${card.badge.padEnd(9)} ${card.slug}`);
} else {
  console.log('  all custom');
}
console.log(`wrote ${outPath}`);
spawn('open', [outPath], { stdio: 'ignore', detached: true }).unref();
