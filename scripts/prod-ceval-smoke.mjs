// Headless engine smoke: proves the in-browser analysis engine (Fairy-Stockfish
// WASM) actually RUNS end-to-end on the /analysis/xiangqi route — not just that
// the assets serve. This is the check that would have caught the 2026-07-06
// prod outage (five stacked serving/isolation bugs, all hidden behind green
// deploys because nothing exercised a real search). It:
//   1. loads /analysis/xiangqi?moves=... and asserts the page is cross-origin
//      isolated (COOP/COEP present → SharedArrayBuffer available),
//   2. confirms the board mounted from the move list,
//   3. toggles the engine on and waits for a real eval + at least one PV line,
//   4. fails on any pthread / SharedArrayBuffer / ceval console error.
//
// Defaults to prod; point MISTBOARD_WEB_URL at a local build to smoke locally.
import { chromium } from '@playwright/test';

const baseUrl = normalizeBaseUrl(process.env.MISTBOARD_WEB_URL ?? 'https://mistboard.com');
const timeoutMs = Number(process.env.MISTBOARD_CEVAL_SMOKE_TIMEOUT_MS ?? 45000);
const moves = process.env.MISTBOARD_CEVAL_SMOKE_MOVES ?? 'b3e3,h8e8,b1c3';
const url = `${baseUrl}/analysis/xiangqi?moves=${encodeURIComponent(moves)}`;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  if (!response?.ok())
    throw new Error(`${url} returned HTTP ${response?.status() ?? 'no response'}`);

  const isolated = await page.evaluate(() => globalThis.crossOriginIsolated === true);
  if (!isolated) {
    throw new Error(
      'page is not cross-origin isolated — COOP/COEP missing, so SharedArrayBuffer (and the WASM engine) is unavailable',
    );
  }

  // The board must reconstruct from the pasted move list.
  await page
    .locator('.xiangqi-live-board svg')
    .first()
    .waitFor({ state: 'attached', timeout: timeoutMs });

  // Toggle the engine on. Programmatic click fires the handler synchronously and
  // sets aria-pressed, so we can assert the toggle actually engaged.
  const engaged = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((el) =>
      /^Engine/.test((el.textContent ?? '').trim()),
    );
    if (!button) return { ok: false, reason: 'engine toggle button not found' };
    if (button.disabled)
      return { ok: false, reason: 'engine toggle is disabled (engine reported unsupported)' };
    button.click();
    return { ok: button.getAttribute('aria-pressed') === 'true', reason: 'toggle did not engage' };
  });
  if (!engaged.ok) throw new Error(engaged.reason);

  // The engine must return a real eval and at least one principal variation.
  await page.waitForFunction(
    () => {
      const panel = document.querySelector('.engine-panel');
      const evalText = panel?.querySelector('.engine-panel__eval')?.textContent?.trim();
      const lineCount = panel?.querySelectorAll('.engine-panel__line').length ?? 0;
      return Boolean(evalText) && lineCount >= 1;
    },
    { timeout: timeoutMs },
  );

  const result = await page.evaluate(() => {
    const panel = document.querySelector('.engine-panel');
    return {
      eval: panel?.querySelector('.engine-panel__eval')?.textContent?.trim() ?? null,
      lines: panel?.querySelectorAll('.engine-panel__line').length ?? 0,
      meta: (panel?.textContent ?? '').match(/depth\s+\d+[\s\S]*?nps/)?.[0] ?? null,
    };
  });

  const fatal = errors.filter((message) =>
    /pthread|SharedArrayBuffer|ceval|engine global missing|failed to load engine/i.test(message),
  );
  if (fatal.length > 0) throw new Error(`engine console errors: ${fatal.join(' | ')}`);

  console.log(JSON.stringify({ ok: true, baseUrl, url, ...result }));
} catch (err) {
  console.error(JSON.stringify({ ok: false, baseUrl, url, error: err?.message ?? String(err) }));
  process.exitCode = 1;
} finally {
  await browser.close();
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}
