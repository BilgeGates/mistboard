#!/usr/bin/env node
// mobile-loop.mjs — agent-driven mobile iteration loop.
//
// Walks the golden path at iPhone 14 viewport using Playwright + WebKit and
// writes one screenshot per route to tmp/mobile-shots/. The agent reads the
// screenshots directly to decide if a fix is needed; the phone is the final
// validator, not the inner loop.
//
// Usage:
//   node scripts/mobile-loop.mjs                 # default: localhost:3000
//   DEV_URL=http://10.0.0.153:3000 node scripts/mobile-loop.mjs
//   node scripts/mobile-loop.mjs --only landing,articles
//
// Requires the dev server to be running.

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices, webkit } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const SHOTS_DIR = join(REPO_ROOT, 'tmp', 'mobile-shots');
const BASELINE_DIR = join(REPO_ROOT, 'tmp', 'mobile-baseline');
const DEV_URL = process.env.DEV_URL ?? 'http://localhost:3000';

// --save-baseline: copy the current shots into a sibling dir that the normal
// run never clears, so before/after survives a full sweep.
const SAVE_BASELINE = process.argv.includes('--save-baseline');

const ONLY = (() => {
  const idx = process.argv.indexOf('--only');
  if (idx < 0) return null;
  const list = process.argv[idx + 1];
  if (!list) return null;
  return new Set(list.split(',').map((s) => s.trim()));
})();

// Each scene = a route + an optional setup interaction. Keep this list close
// to the golden path. Click-driven scenes (open setup dialog, open settings
// panel) can be added once the route sweep is solid.
const scenes = [
  { name: 'landing', path: '/' },
  { name: 'landing-fullpage', path: '/', fullPage: true },
  { name: 'about', path: '/about', fullPage: true },
  { name: 'faq', path: '/faq', fullPage: true },
  { name: 'articles-index', path: '/articles', fullPage: true },
  { name: 'article-fog-rules', path: '/articles/fog-of-war-rules', fullPage: true },
  { name: 'article-draft960', path: '/articles/draft960', fullPage: true },
  { name: 'leaderboard', path: '/leaderboard', fullPage: true },
  { name: 'account', path: '/account' },
  { name: 'contact', path: '/contact' },
  { name: 'learn', path: '/learn' },
  { name: 'terms', path: '/terms', fullPage: true },
];

async function main() {
  if (!ONLY) {
    await rm(SHOTS_DIR, { recursive: true, force: true });
  }
  await mkdir(SHOTS_DIR, { recursive: true });

  const browser = await webkit.launch();
  const context = await browser.newContext({
    ...devices['iPhone 14'],
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push({ scene: '?', error: err.message }));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push({ scene: '?', error: msg.text() });
  });

  const results = [];

  for (const scene of scenes) {
    if (ONLY && !ONLY.has(scene.name)) continue;
    const sceneErrors = [];
    const errHandler = (err) => sceneErrors.push(err.message);
    const consoleHandler = (msg) => {
      if (msg.type() === 'error') sceneErrors.push(msg.text());
    };
    page.on('pageerror', errHandler);
    page.on('console', consoleHandler);

    const url = `${DEV_URL}${scene.path}`;
    const t0 = Date.now();
    let _status = 'ok';
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      // small settle for late layout shifts (board sizing, font swap)
      await page.waitForTimeout(400);
      const out = join(SHOTS_DIR, `${scene.name}.png`);
      await page.screenshot({ path: out, fullPage: scene.fullPage ?? false });
      results.push({
        scene: scene.name,
        path: scene.path,
        file: out,
        ms: Date.now() - t0,
        errors: sceneErrors.slice(),
      });
      console.log(`✓ ${scene.name.padEnd(28)} ${scene.path.padEnd(36)} ${Date.now() - t0}ms`);
    } catch (err) {
      _status = 'fail';
      results.push({
        scene: scene.name,
        path: scene.path,
        ms: Date.now() - t0,
        error: err.message,
        errors: sceneErrors.slice(),
      });
      console.log(`✗ ${scene.name.padEnd(28)} ${scene.path.padEnd(36)} ${err.message}`);
    } finally {
      page.off('pageerror', errHandler);
      page.off('console', consoleHandler);
    }
  }

  await browser.close();

  const summary = {
    devUrl: DEV_URL,
    viewport: devices['iPhone 14'].viewport,
    userAgent: devices['iPhone 14'].userAgent,
    runAt: new Date().toISOString(),
    scenes: results,
  };
  await writeFile(join(SHOTS_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

  if (SAVE_BASELINE) {
    await rm(BASELINE_DIR, { recursive: true, force: true });
    await cp(SHOTS_DIR, BASELINE_DIR, { recursive: true });
    console.log(`baseline saved → ${BASELINE_DIR}`);
  }

  const totalErrors = results.reduce((n, r) => n + (r.errors?.length ?? 0), 0);
  console.log(`\n${results.length} scenes, ${totalErrors} console errors`);
  console.log(`shots → ${SHOTS_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
