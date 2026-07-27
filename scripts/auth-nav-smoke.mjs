import { mkdir } from 'node:fs/promises';

import { launchChromium } from './lib/launch-browser.mjs';

const baseUrl = normalizeBaseUrl(process.env.MISTBOARD_WEB_URL ?? 'http://127.0.0.1:3000');
const email = process.env.MISTBOARD_AUTH_SMOKE_EMAIL ?? 'local-auth-smoke@example.com';
const screenshotPath = '/private/tmp/mistboard-auth-nav-smoke.png';

const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  const apiResp = await page.goto(`${baseUrl}/api/auth/me`, { waitUntil: 'networkidle' });
  if (!apiResp?.ok()) {
    throw new Error(
      `Auth API is not reachable through ${baseUrl}. Run: npm run db:up, npm run db:migrate, npm run dev:persistent`,
    );
  }

  await page.goto(`${baseUrl}/account?tab=login`, { waitUntil: 'networkidle' });
  const before = await page.locator('.site-nav-auth').innerText();
  await page.locator('input[name=email]').fill(email);
  await page.locator('form.account-form button[type=submit]').click();
  await page.locator('input[name=code]:visible').waitFor({ state: 'visible', timeout: 5000 });

  const codeValue = await page.locator('input[name=code]').inputValue();
  if (!codeValue) {
    throw new Error(
      'Login code was not auto-filled. Local smoke requires dev auth codes, use npm run dev:persistent.',
    );
  }

  await page.locator('form.account-form button[type=submit]').click();
  await page.locator('.account-nav-trigger').waitFor({ state: 'visible', timeout: 5000 });

  const after = await page.locator('.account-nav-trigger').innerText();
  const heading = await page.locator('h1').innerText();
  const signedOutCount = await page.locator('.site-nav-link-signin').count();

  await mkdir('/private/tmp', { recursive: true });
  await page.screenshot({
    path: screenshotPath,
    clip: { x: 0, y: 0, width: 520, height: 170 },
  });

  const failures = [];
  if (before !== 'Sign in\nRegister') failures.push(`expected signed-out nav, found ${before}`);
  if (!after) failures.push('account nav trigger did not render');
  if (!heading.startsWith('@'))
    failures.push(`expected signed-in account heading, found ${heading}`);
  if (signedOutCount !== 0) failures.push(`expected zero Sign in links, found ${signedOutCount}`);
  if (errors.length > 0) failures.push(`page errors: ${errors.join(' | ')}`);

  console.log(
    JSON.stringify(
      {
        baseUrl,
        email,
        before,
        after,
        heading,
        signedOutCount,
        screenshot: screenshotPath,
      },
      null,
      2,
    ),
  );

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }
} finally {
  await browser.close();
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}
