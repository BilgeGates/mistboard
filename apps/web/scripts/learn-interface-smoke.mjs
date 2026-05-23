import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const scriptPath = fileURLToPath(import.meta.url);
const webRoot = new URL('..', import.meta.url);
const port = Number(process.env.MISTBOARD_LEARN_TEST_PORT ?? 3127);
const baseUrl = `http://127.0.0.1:${port}`;

const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: fileURLToPath(webRoot),
  env: {
    ...process.env,
    BROWSER: 'none',
    FORCE_COLOR: '0',
    NO_COLOR: '1',
  },
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
});

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
    assert.equal(await page.locator('.site-nav-brand span').textContent(), 'MISTBOARD');

    // Tutorial shell: 5 steps with Steps 1-3 shipped — the other 2 are locked.
    assert.equal(await page.locator('.learn-progress').textContent(), 'Step 1 of 5');
    assert.equal(await page.locator('.learn-heading').textContent(), 'Vision');
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'Move and watch');
    assert.equal(await page.locator('.learn-menu-category h2').first().textContent(), 'Tutorial');
    assert.equal(await page.locator('.learn-menu-lesson').count(), 5);
    assert.equal(await page.locator('.learn-menu-lesson.is-locked').count(), 2);

    // Step 1: any legal rook move counts.
    await dragSquare(page, 'd1', 'd4');
    await page.waitForSelector('.learn-tutorial-message.success');
    const step1Text = await page.locator('.learn-tutorial-message.success').textContent();
    assert.match(step1Text ?? '', /Vision moves with the piece/);
    // With Step 2 shipped, the next-step CTA is now "Next".
    const nextButton = page.locator('.learn-actions').getByRole('button', { name: 'Next' });
    assert.equal(await nextButton.count(), 1);

    // Advance to Step 2 via the Next button.
    await nextButton.click();
    await page.waitForFunction(
      () => document.querySelector('.learn-progress')?.textContent === 'Step 2 of 5',
    );
    assert.equal(await page.locator('.learn-heading').textContent(), 'King Capture');
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'Take the king');

    // Step 2: drag rook h1→h8 to capture the exposed black king and win.
    await dragSquare(page, 'h1', 'h8');
    await page.waitForSelector('.learn-tutorial-message.success');
    const step2Text = await page.locator('.learn-tutorial-message.success').textContent();
    assert.match(step2Text ?? '', /You captured the king/);
    // With Step 3 shipped, Step 2's success CTA is "Next".
    const step2Next = page.locator('.learn-actions').getByRole('button', { name: 'Next' });
    assert.equal(await step2Next.count(), 1);

    // Advance to Step 3.
    await step2Next.click();
    await page.waitForFunction(
      () => document.querySelector('.learn-progress')?.textContent === 'Step 3 of 5',
    );
    assert.equal(await page.locator('.learn-heading').textContent(), 'Hidden Moves');
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'What just happened?');

    // Step 3 is a click-to-reveal chapter — no board moves accepted, just the
    // "Reveal what happened" button.
    const revealButton = page.locator('.learn-actions').getByRole('button', {
      name: 'Reveal what happened',
    });
    assert.equal(await revealButton.count(), 1);
    await revealButton.click();
    await page.waitForSelector('.learn-tutorial-message.success');
    const step3Text = await page.locator('.learn-tutorial-message.success').textContent();
    assert.match(step3Text ?? '', /knight from b8 to c6/);
    // Step 3 is the last shipped chapter — Restart CTA.
    assert.equal(
      await page.locator('.learn-actions').getByRole('button', { name: 'Restart' }).count(),
      1,
    );
  } finally {
    await browser.close();
  }
}

async function assertVisible(page, selector) {
  const locator = page.locator(selector);
  assert.equal(await locator.count(), 1, `${selector} should appear once`);
  assert.equal(await locator.first().isVisible(), true, `${selector} should be visible`);
}

async function clickLesson(page, title) {
  const label = page
    .locator('.learn-menu .learn-menu-lesson-label')
    .getByText(title, { exact: true });
  assert.equal(await label.count(), 1, `${title} lesson should appear once`);
  await label.click();
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
