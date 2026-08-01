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
//
// Route names are checked against isClientRoute / isReviewShellRoute in
// apps/server/src/server-policy.ts. A path in neither list serves the branded
// 404 in prod, so a stale scene screenshots a 404 and still reads as "passing" —
// which is what the /articles scenes did after the 2026-07-10 rename to /blog.
// Re-check this list against server-policy.ts whenever routes move.
//
// MISTBOARD_MOBILE_GAME_ID points the review scene at a finished game; without
// it that scene is skipped rather than shooting an error state. Grab an id from
// `curl -s localhost:3001/api/games/recent`.
const reviewGameId = process.env.MISTBOARD_MOBILE_GAME_ID ?? null;

const scenes = [
  { name: 'landing', path: '/' },
  { name: 'landing-fullpage', path: '/', fullPage: true },
  // Board surfaces first: these are the ones whose phone stack can go wrong,
  // with board, rails and move table competing for a single column.
  { name: 'play', path: '/play' },
  { name: 'puzzles', path: '/puzzles' },
  { name: 'analysis-xiangqi', path: '/analysis/xiangqi' },
  ...(reviewGameId ? [{ name: 'game-review', path: `/game/${reviewGameId}`, fullPage: true }] : []),
  { name: 'watch', path: '/watch', fullPage: true },
  { name: 'broadcast-xiangqi', path: '/broadcast/xiangqi', fullPage: true },
  // Learn / read. The legacy /learn hub is deliberately absent: it is gated off
  // in the web build, so /learn/xiangqi is the only real course route.
  { name: 'learn-xiangqi', path: '/learn/xiangqi' },
  { name: 'rules-xiangqi', path: '/rules/xiangqi', fullPage: true },
  { name: 'blog-index', path: '/blog', fullPage: true },
  { name: 'blog-fog-rules', path: '/blog/fog-of-war-rules', fullPage: true },
  // Account + static.
  { name: 'leaderboard', path: '/leaderboard', fullPage: true },
  { name: 'account', path: '/account' },
  { name: 'contact', path: '/contact' },
  { name: 'about', path: '/about', fullPage: true },
  { name: 'faq', path: '/faq', fullPage: true },
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
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      // small settle for late layout shifts (board sizing, font swap)
      await page.waitForTimeout(400);
      // A dead route serves the branded 404 SHELL with a 200, so an HTTP check
      // alone will not catch it — a stale scene otherwise screenshots a 404 and
      // reports ✓. Flag both, loudly, and let the run continue.
      const notFound = await page.evaluate(() => {
        const text = document.body?.innerText ?? '';
        return /page not found|404/i.test(text.slice(0, 400));
      });
      const httpStatus = response?.status() ?? 0;
      const dead = notFound || httpStatus >= 400;
      const out = join(SHOTS_DIR, `${scene.name}.png`);
      await page.screenshot({ path: out, fullPage: scene.fullPage ?? false });
      results.push({
        scene: scene.name,
        path: scene.path,
        file: out,
        ms: Date.now() - t0,
        httpStatus,
        notFound: dead,
        errors: sceneErrors.slice(),
      });
      const mark = dead ? '⚠ 404?' : '✓';
      console.log(`${mark} ${scene.name.padEnd(28)} ${scene.path.padEnd(36)} ${Date.now() - t0}ms`);
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
  const dead = results.filter((r) => r.notFound);
  console.log(`\n${results.length} scenes, ${totalErrors} console errors`);
  if (dead.length > 0) {
    console.log(`\n${dead.length} scene(s) landed on a 404. The route moved; fix the scene list:`);
    for (const r of dead) console.log(`  ${r.scene} → ${r.path}`);
  }
  if (!reviewGameId) {
    console.log('\ngame-review scene skipped (set MISTBOARD_MOBILE_GAME_ID to include it)');
  }
  console.log(`shots → ${SHOTS_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
