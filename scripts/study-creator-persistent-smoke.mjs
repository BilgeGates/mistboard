import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const externalBaseUrl = process.env.MISTBOARD_WEB_URL?.trim();
const port = Number(process.env.MISTBOARD_STUDY_TEST_PORT ?? 3133);
const baseUrl = normalizeBaseUrl(externalBaseUrl || `http://127.0.0.1:${port}`);
const runId = Date.now();
const email = process.env.MISTBOARD_STUDY_SMOKE_EMAIL ?? `study-creator-smoke+${runId}@example.com`;
const fixtureName = `Creator smoke ${runId}`;
const server = externalBaseUrl ? null : startPersistentApp();

let serverOutput = '';
if (server) {
  server.stdout.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
}

try {
  await waitForServer(`${baseUrl}/api/auth/me`);
  await smokeCreatorFlow();
} catch (error) {
  if (serverOutput) {
    const tail = serverOutput.trim().split('\n').slice(-40).join('\n');
    console.error(`\nStudy smoke app output (last 40 lines):\n${tail}`);
  }
  throw error;
} finally {
  await stopServer();
}

async function smokeCreatorFlow() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const pageErrors = [];
  let studyId = null;

  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await signIn(page);
    await page.goto(`${baseUrl}/study`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'New study' }).click();
    await page.getByLabel('Study name').fill(fixtureName);
    await page.getByLabel('Study visibility').selectOption('private');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.waitForURL(/\/study\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/, { timeout: 15_000 });
    await page.getByRole('region', { name: 'Chapters' }).waitFor();
    await page.getByLabel('Xiangqi board', { exact: true }).waitFor({ timeout: 15_000 });

    const createdPath = new URL(page.url()).pathname;
    const createdMatch = /^\/study\/([A-Za-z0-9]+)\/([A-Za-z0-9]+)$/.exec(createdPath);
    assert.ok(createdMatch, `created study should have a chapter permalink, got ${createdPath}`);
    studyId = createdMatch[1];
    const firstChapterId = createdMatch[2];

    await page.getByRole('button', { name: 'Comment', exact: true }).click();
    const note = `Durable note ${Date.now()}`;
    const saveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().includes(`/api/studies/${studyId}/chapters/${firstChapterId}`),
      { timeout: 10_000 },
    );
    await page.locator('.annotation-editor__comment').fill(note);
    assert.equal((await saveResponse).ok(), true, 'annotation autosave should succeed');
    await page.locator('.study-actions__status[data-state="saved"]').waitFor();
    assert.equal(
      await page.evaluate(
        (key) => window.localStorage.getItem(key),
        `mistboard:study-draft:${studyId}:${firstChapterId}`,
      ),
      null,
      'confirmed autosave should clear the local draft',
    );

    await page.reload({ waitUntil: 'networkidle' });
    await page.getByLabel('Xiangqi board', { exact: true }).waitFor({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Comment', exact: true }).click();
    assert.equal(
      await page.locator('.annotation-editor__comment').inputValue(),
      note,
      'saved annotation should survive reload',
    );

    const secondChapterId = await addChapter(page, 'Smoke chapter 2');
    const thirdChapterId = await addChapter(page, 'Smoke chapter 3');
    assert.equal(
      new URL(page.url()).pathname,
      `/study/${studyId}/${thirdChapterId}`,
      'new chapter should receive a stable permalink',
    );

    const reorderResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        new URL(response.url()).pathname === `/api/studies/${studyId}/chapters`,
      { timeout: 10_000 },
    );
    await page.getByRole('button', { name: 'Reorder Smoke chapter 3' }).press('ArrowUp');
    assert.equal((await reorderResponse).ok(), true, 'chapter reorder should succeed');
    await page.locator('.study-actions__status[data-state="saved"]').waitFor();
    await assertChapterOrder(page, ['Chapter 1', 'Smoke chapter 3', 'Smoke chapter 2']);

    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('region', { name: 'Chapters' }).waitFor();
    await assertChapterOrder(page, ['Chapter 1', 'Smoke chapter 3', 'Smoke chapter 2']);
    assert.equal(
      new URL(page.url()).pathname,
      `/study/${studyId}/${thirdChapterId}`,
      'active chapter permalink should survive reload',
    );
    assert.notEqual(secondChapterId, thirdChapterId);

    await page.getByRole('button', { name: 'Study settings' }).click();
    await page.getByRole('button', { name: 'Delete study' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await page.waitForURL(/\/study\?tab=mine$/, { timeout: 10_000 });
    assert.equal(
      await page.getByText(fixtureName, { exact: true }).count(),
      0,
      'deleted fixture should not remain in My studies',
    );
    studyId = null;

    assert.deepEqual(pageErrors, [], `unexpected browser errors: ${pageErrors.join(' | ')}`);
    console.log(
      JSON.stringify({
        baseUrl,
        checks: [
          'create private study',
          'autosave annotation',
          'reload persisted annotation',
          'add chapters',
          'reorder chapters',
          'preserve chapter permalink',
          'delete fixture',
        ],
        fixtureName,
        ok: true,
      }),
    );
  } finally {
    if (studyId) {
      await context.request.delete(`${baseUrl}/api/studies/${studyId}`).catch(() => undefined);
    }
    await browser.close();
  }
}

async function signIn(page) {
  await page.goto(`${baseUrl}/account?tab=login`, { waitUntil: 'networkidle' });
  await page.locator('input[name=email]').fill(email);
  await page.locator('form.account-form button[type=submit]').click();
  await page.locator('input[name=code]:visible').waitFor({ timeout: 5_000 });
  const code = await page.locator('input[name=code]').inputValue();
  assert.ok(code, 'local persistent auth should auto-fill the development login code');
  await page.locator('form.account-form button[type=submit]').click();
  await page.locator('.account-nav-trigger').waitFor({ timeout: 5_000 });
}

async function addChapter(page, name) {
  await page.getByRole('button', { name: 'Add a new chapter' }).click();
  await page.getByLabel('Chapter name').fill(name);
  const createResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/api\/studies\/[A-Za-z0-9]+\/chapters$/.test(new URL(response.url()).pathname),
    { timeout: 10_000 },
  );
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  assert.equal((await createResponse).ok(), true, `creating ${name} should succeed`);
  await page.getByRole('link', { name: new RegExp(name) }).waitFor();
  const match = /\/study\/[A-Za-z0-9]+\/([A-Za-z0-9]+)$/.exec(new URL(page.url()).pathname);
  assert.ok(match, `${name} should open at its chapter permalink`);
  return match[1];
}

async function assertChapterOrder(page, expected) {
  const names = await page.locator('.study-chapters__name').allTextContents();
  assert.deepEqual(names, expected);
}

function startPersistentApp() {
  return spawn('npm', ['run', 'dev:persistent'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      BROWSER: 'none',
      FORCE_COLOR: '0',
      MISTBOARD_DEV_PORT_BASE: String(port),
      NO_COLOR: '1',
    },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The dev pair is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Study app did not become ready at ${url}. Run npm run db:up and npm run db:migrate first.`,
  );
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  if (process.platform !== 'win32') process.kill(-server.pid, 'SIGTERM');
  else server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}
