import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const scriptPath = fileURLToPath(import.meta.url);
const webRoot = new URL('..', import.meta.url);
const port = Number(process.env.BICHESS_LEARN_TEST_PORT ?? 3127);
const baseUrl = `http://127.0.0.1:${port}`;

const server = spawn(
  'npm',
  ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)],
  {
    cwd: fileURLToPath(webRoot),
    env: {
      ...process.env,
      BROWSER: 'none',
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let serverOutput = '';
server.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on('data', (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForServer(`${baseUrl}/learn`);
  await smokeLearnInterface();
} finally {
  await stopServer();
}

async function smokeLearnInterface() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  try {
    await page.goto(`${baseUrl}/learn`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.learn-tutorial-shell');

    await assertVisible(page, '.site-nav-brand img.site-nav-logo[src="/logo.svg"]');
    assert.equal(await page.locator('.site-nav-brand span').textContent(), 'BICHESS');
    assert.equal(await page.locator('.site-nav-link.active[aria-current="page"]').textContent(), 'Learn');

    assert.equal(await page.locator('.learn-progress').textContent(), 'The Rook 1 of 6');
    assert.equal(await page.locator('.learn-heading').textContent(), 'The Rook');
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'Up The File');
    assert.equal(await page.locator('.learn-actions').getByText('Watch games').count(), 0);
    assert.equal(await page.locator('.learn-menu-category h2').first().textContent(), 'Chess pieces');
    assert.equal(await page.locator('.learn-menu-lesson').count(), 6);
    assert.equal(await page.locator('.learn-menu-lesson.is-locked').count(), 0);
    assert.equal(await page.locator('.learn-menu-chapter').count(), 6);

    assert.equal(await page.locator('.learn-board square.learn-highlight').count(), 1);
    assert.equal(await page.locator('.learn-board square.last-move').count(), 0);

    await dragSquare(page, 'e2', 'e7');
    await page.waitForSelector('.learn-tutorial-message.success');

    const successText = await page.locator('.learn-tutorial-message.success').textContent();
    assert.match(successText ?? '', /straight up the file/);
    assert.equal(await page.locator('.learn-actions').getByRole('button', { name: 'Next' }).count(), 1);
    assert.equal(await page.locator('.learn-board square.last-move').count(), 0);
    assert.equal(await page.locator('.learn-board square.learn-highlight').count(), 1);
    assert.ok(await page.locator('.learn-board square.learn-explained').count() > 1);

    await page.locator('.learn-menu-lesson-row', { hasText: 'The Bishop' }).click();
    await page.waitForFunction(() => document.querySelector('.learn-progress')?.textContent === 'The Bishop 1 of 6');
    assert.equal(await page.locator('.learn-heading').textContent(), 'The Bishop');
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'Up Right');
    assert.equal(await page.locator('.learn-menu-chapter').count(), 6);

    await page.locator('.learn-menu-lesson-row', { hasText: 'The Queen' }).click();
    await page.waitForFunction(() => document.querySelector('.learn-progress')?.textContent === 'The Queen 1 of 6');
    assert.equal(await page.locator('.learn-heading').textContent(), 'The Queen');
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'Up The File');
    assert.equal(await page.locator('.learn-menu-chapter').count(), 6);

    await page.locator('.learn-menu-lesson-row', { hasText: 'The King' }).click();
    await page.waitForFunction(() => document.querySelector('.learn-progress')?.textContent === 'The King 1 of 6');
    assert.equal(await page.locator('.learn-heading').textContent(), 'The King');
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'One Step Up');
    assert.equal(await page.locator('.learn-menu-chapter').count(), 6);

    await page.locator('.learn-menu-lesson-row', { hasText: 'The Knight' }).click();
    await page.waitForFunction(() => document.querySelector('.learn-progress')?.textContent === 'The Knight 1 of 6');
    assert.equal(await page.locator('.learn-heading').textContent(), 'The Knight');
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'First L');
    assert.equal(await page.locator('.learn-menu-chapter').count(), 6);

    await page.locator('.learn-menu-lesson-row', { hasText: 'The Pawn' }).click();
    await page.waitForFunction(() => document.querySelector('.learn-progress')?.textContent === 'The Pawn 1 of 6');
    assert.equal(await page.locator('.learn-heading').textContent(), 'The Pawn');
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'One Step');
    assert.equal(await page.locator('.learn-menu-chapter').count(), 6);
  } finally {
    await browser.close();
  }
}

async function assertVisible(page, selector) {
  const locator = page.locator(selector);
  assert.equal(await locator.count(), 1, `${selector} should appear once`);
  assert.equal(await locator.first().isVisible(), true, `${selector} should be visible`);
}

async function dragSquare(page, from, to) {
  const box = await page.locator('.learn-board').boundingBox();
  assert.ok(box, 'learn board should have a bounding box');
  const fromPoint = squareCenter(box, from);
  const toPoint = squareCenter(box, to);
  await page.mouse.move(fromPoint.x, fromPoint.y);
  await page.mouse.down();
  await page.mouse.move(toPoint.x, toPoint.y, { steps: 12 });
  await page.mouse.up();
}

function squareCenter(box, square) {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]);
  const cell = box.width / 8;
  return {
    x: box.x + (file + 0.5) * cell,
    y: box.y + (8 - rank + 0.5) * cell,
  };
}

async function waitForServer(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    if (server.exitCode !== null) {
      throw new Error(`dev server exited early from ${scriptPath}\n${serverOutput}`);
    }
    try {
      const resp = await fetch(url);
      if (resp.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`timed out waiting for ${url}\n${serverOutput}`);
}

async function stopServer() {
  if (server.exitCode !== null) return;
  signalServer('SIGTERM');
  await waitForServerExit(2_000);
  if (server.exitCode !== null) return;
  signalServer('SIGKILL');
  await waitForServerExit(1_000);
}

function signalServer(signal) {
  if (!server.pid) return;
  try {
    if (process.platform === 'win32') {
      server.kill(signal);
      return;
    }
    process.kill(-server.pid, signal);
  } catch {
    try {
      server.kill(signal);
    } catch {
      // Already stopped.
    }
  }
}

async function waitForServerExit(timeoutMs) {
  if (server.exitCode !== null) return;
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
