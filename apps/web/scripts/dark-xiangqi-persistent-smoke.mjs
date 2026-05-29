import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const webRoot = new URL('..', import.meta.url);
const repoRoot = new URL('../../..', import.meta.url);
const webPort = Number(process.env.MISTBOARD_DARK_XIANGQI_WEB_PORT ?? 3128);
const serverPort = Number(process.env.MISTBOARD_DARK_XIANGQI_SERVER_PORT ?? 3129);
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const serverBaseUrl = `http://127.0.0.1:${serverPort}`;

const children = [];
let browser = null;

try {
  const server = startServerProcess('server');
  await waitForServer();

  const web = startProcess(
    'web',
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(webPort)],
    {
      cwd: fileURLToPath(webRoot),
      env: {
        ...process.env,
        BROWSER: 'none',
        FORCE_COLOR: '0',
        MISTBOARD_DEV_API_URL: serverBaseUrl,
        NO_COLOR: '1',
        VITE_DARK_XIANGQI_ENABLED: 'true',
        VITE_MISTBOARD_WS_URL: `ws://127.0.0.1:${serverPort}`,
      },
    },
  );
  await waitForHttp(`${webBaseUrl}/xiangqi-spike`);

  browser = await chromium.launch({ args: ['--no-sandbox'] });
  const redContext = await browser.newContext();
  const blackContext = await browser.newContext();
  let redPage = await redContext.newPage();
  let blackPage = await blackContext.newPage();
  const blackFrames = captureServerFrames(blackPage);

  await redPage.goto(`${webBaseUrl}/xiangqi-spike`, { waitUntil: 'domcontentloaded' });
  await redPage.getByRole('button', { name: 'Create server room' }).click();
  await redPage.waitForURL(/\/room\/dxq_/, { timeout: 15_000 });
  const roomPath = new URL(redPage.url()).pathname;

  // In Vite dev, the redirect can complete before the live page has processed
  // its first Dark Xiangqi hello. A reload keeps the smoke focused on room
  // privacy/persistence instead of that dev-only navigation race.
  await redPage.reload({ waitUntil: 'domcontentloaded' });
  await waitForDebug(
    redPage,
    'red initial join',
    (debug) =>
      debug.connectionState === 'connected' &&
      debug.seat === 'red' &&
      debug.gameSpecId === 'dark-xiangqi',
  );

  await blackPage.goto(`${webBaseUrl}${roomPath}`, { waitUntil: 'domcontentloaded' });
  await waitForDebug(
    blackPage,
    'black initial join',
    (debug) =>
      debug.connectionState === 'connected' &&
      debug.seat === 'black' &&
      debug.gameSpecId === 'dark-xiangqi',
  );

  const move = await firstLegalMove(redPage);
  await clickSquare(redPage, move.from);
  await clickSquare(redPage, move.to);

  await waitForDebug(
    redPage,
    'red own move',
    (debug, played) =>
      debug.state?.lastMove?.from === played.from && debug.state?.lastMove?.to === played.to,
    move,
  );
  await waitForDebug(
    blackPage,
    'black redacted move',
    (debug) =>
      debug.state?.status?.turn === 'black' && !Object.hasOwn(debug.state ?? {}, 'lastMove'),
  );

  const blackMoveFrame = blackFrames.find(
    (frame) =>
      frame?.type === 'event-appended' &&
      frame?.gameSpecId === 'dark-xiangqi' &&
      frame?.state?.status?.turn === 'black',
  );
  assert.ok(blackMoveFrame, 'black did not receive the redacted move frame');
  assert.equal(Object.hasOwn(blackMoveFrame, 'event'), false, 'black received opponent event');
  assert.equal(
    Object.hasOwn(blackMoveFrame.state ?? {}, 'lastMove'),
    false,
    'black received opponent lastMove',
  );

  await redPage.close();
  await blackPage.close();
  await sleep(1_000);

  await stopProcess(server);
  const restartedServer = startServerProcess('server-restart');
  await waitForServer();

  redPage = await redContext.newPage();
  await redPage.goto(`${webBaseUrl}${roomPath}`, { waitUntil: 'domcontentloaded' });
  await waitForDebug(
    redPage,
    'red hydrated join',
    (debug) =>
      debug.connectionState === 'connected' &&
      debug.seat === 'red' &&
      debug.gameSpecId === 'dark-xiangqi',
  );

  blackPage = await blackContext.newPage();
  await blackPage.goto(`${webBaseUrl}${roomPath}`, { waitUntil: 'domcontentloaded' });
  await waitForDebug(
    blackPage,
    'black hydrated join',
    (debug) =>
      debug.connectionState === 'connected' &&
      debug.seat === 'black' &&
      debug.gameSpecId === 'dark-xiangqi',
  );

  const redHydrated = await debugSnapshot(redPage);
  const blackHydrated = await debugSnapshot(blackPage);
  assert.deepEqual(redHydrated?.state?.lastMove, move, 'red hydration lost own lastMove');
  assert.equal(
    Object.hasOwn(blackHydrated?.state ?? {}, 'lastMove'),
    false,
    'black hydration exposed opponent lastMove',
  );
  assert.equal(
    (blackHydrated?.events ?? []).some((event) => event?.type === 'move-played'),
    false,
    'black hydration exposed opponent move event',
  );

  console.log(
    JSON.stringify({
      ok: true,
      roomPath,
      move,
      blackFrameCount: blackFrames.length,
    }),
  );

  await stopProcess(restartedServer);
  await stopProcess(web);
} finally {
  if (browser) await browser.close();
  await Promise.allSettled([...children].reverse().map((child) => stopProcess(child)));
}

function startProcess(label, command, args, options) {
  const child = spawn(command, args, {
    ...options,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.mistboardLabel = label;
  child.mistboardOutput = '';
  child.stdout.on('data', (chunk) => {
    child.mistboardOutput += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    child.mistboardOutput += chunk.toString();
  });
  children.push(child);
  return child;
}

function startServerProcess(label) {
  return startProcess(label, process.execPath, ['--import', 'tsx', 'apps/server/src/main.ts'], {
    cwd: fileURLToPath(repoRoot),
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgres://mistboard:mistboard@localhost:5435/mistboard',
      FORCE_COLOR: '0',
      MISTBOARD_DARK_XIANGQI_ENABLED: 'true',
      NO_COLOR: '1',
      PORT: String(serverPort),
    },
  });
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
  } catch {
    // Process may already be gone.
  }
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(5_000)]);
  if (child.exitCode === null) {
    try {
      if (process.platform === 'win32') child.kill('SIGKILL');
      else process.kill(-child.pid, 'SIGKILL');
    } catch {
      // Process may already be gone.
    }
  }
}

async function waitForServer() {
  await waitForHttp(`${serverBaseUrl}/api/server-status`, async (response) => {
    const body = await response.json();
    return body.darkXiangqiEnabled === true;
  });
}

async function waitForHttp(url, predicate = (response) => response.ok) {
  const deadline = Date.now() + 20_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok && (await predicate(response))) return;
    } catch (err) {
      lastError = err;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}${lastError ? `: ${lastError.message}` : ''}`);
}

function captureServerFrames(page) {
  const frames = [];
  page.on('websocket', (socket) => {
    socket.on('framereceived', (frame) => {
      try {
        const parsed = JSON.parse(String(frame.payload));
        if (parsed?.type) frames.push(parsed);
      } catch {
        // Ignore Vite and browser control frames.
      }
    });
  });
  return frames;
}

async function waitForDebug(page, label, predicate, arg = null) {
  try {
    await page.waitForFunction(
      ({ arg, source }) => {
        const debug = window.__MISTBOARD_DEBUG__?.();
        if (!debug) return false;
        return Function('debug', 'arg', `return (${source})(debug, arg);`)(debug, arg);
      },
      { arg, source: predicate.toString() },
      { timeout: 15_000 },
    );
  } catch {
    const snapshot = await debugSnapshot(page).catch((err) => ({ error: err.message }));
    throw new Error(`${label} timed out: ${JSON.stringify(snapshot)}`);
  }
}

async function debugSnapshot(page) {
  return page.evaluate(() => window.__MISTBOARD_DEBUG__?.());
}

async function firstLegalMove(page) {
  const handle = await page.waitForFunction(
    () => window.__MISTBOARD_DEBUG__?.().currentView?.legalMoves?.[0] ?? null,
    null,
    { timeout: 15_000 },
  );
  const move = await handle.jsonValue();
  assert.ok(move?.from && move?.to, 'red had no legal move to play');
  return move;
}

async function clickSquare(page, square) {
  await page.locator(`.xiangqi-live-board [data-square="${square}"]`).click({ force: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
