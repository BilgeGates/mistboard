#!/usr/bin/env node
// Drain → poll until active games hit zero → print ready-to-deploy.
//
// Does NOT auto-run `railway up` — that's the human's call. The script's
// job is to put the server into drain mode, wait for in-flight games to
// finish, and either declare "go" or "window exceeded, X games still
// active, your call". The deploy itself is one explicit command after.
//
// Usage:
//   MISTBOARD_DRAIN_TOKEN=… node scripts/safe-deploy.mjs [options]
//
// Options:
//   --base-url <url>      target server (default: https://mistboard.com)
//   --window-ms <ms>      drain window length (default: 900_000 = 15min)
//   --poll-ms <ms>        poll interval (default: 30_000 = 30s)
//   --force               skip interactive confirmation
//
// Exit codes:
//   0   drain complete, ready to deploy
//   1   configuration error (missing token, bad arg)
//   2   server unreachable / probe failed
//   3   drain endpoint failed
//   4   window elapsed with games still active (force-deploy is your call)
//   130 SIGINT — drain was cancelled

const DEFAULT_BASE_URL = 'https://mistboard.com';
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_POLL_MS = 30 * 1000;

const options = parseArgs(process.argv.slice(2));
const baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.MISTBOARD_BASE_URL ?? DEFAULT_BASE_URL);
const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
const token = process.env.MISTBOARD_DRAIN_TOKEN;

if (!token) {
  console.error('error: MISTBOARD_DRAIN_TOKEN is not set in the environment.');
  console.error('  - Get it from the Railway dashboard for the web service.');
  console.error('  - Then re-run: MISTBOARD_DRAIN_TOKEN=… node scripts/safe-deploy.mjs');
  process.exit(1);
}

// Cancel drain on Ctrl-C so the server isn't left rejecting matchmaking.
let drainActive = false;
process.on('SIGINT', async () => {
  console.error('\nsignal received: cancelling drain and exiting');
  if (drainActive) {
    try { await cancelDrain(); } catch (err) { console.error(`cancel failed: ${err.message}`); }
  }
  process.exit(130);
});

try {
  await safeDeployFlow();
} catch (err) {
  console.error(`safe-deploy failed: ${err.message}`);
  if (drainActive) {
    try { await cancelDrain(); console.error('drain cancelled'); }
    catch (e) { console.error(`drain still active — cancel manually: ${e.message}`); }
  }
  process.exit(err.exitCode ?? 1);
}

async function safeDeployFlow() {
  console.log(`safe-deploy: target=${baseUrl.href} window=${humanMs(windowMs)} poll=${humanMs(pollMs)}`);

  // 1. Health probe.
  const health = await fetchJson(new URL('/health', baseUrl), {});
  if (health.status !== 200) {
    throw withExit(2, `/health returned ${health.status}`);
  }

  // 2. Baseline active count.
  const before = await fetchJson(new URL('/api/server-status', baseUrl), {});
  if (before.status !== 200) throw withExit(2, `/api/server-status returned ${before.status}`);
  console.log(`active games before drain: ${before.body.activeGames}`);

  if (before.body.restartAt && before.body.restartAt > Date.now()) {
    console.log(`drain already active (restartAt=${new Date(before.body.restartAt).toISOString()}). Reusing existing window.`);
  } else {
    if (!options.force) {
      console.log('\nAbout to begin drain. New games blocked, in-flight games paused at restart.');
      console.log('Press Enter to continue, Ctrl-C to abort.');
      await readEnter();
    }
    await startDrain();
  }
  drainActive = true;

  // 3. Poll until zero or window elapsed.
  const deadline = Date.now() + windowMs;
  let remainingActive = before.body.activeGames;
  while (remainingActive > 0 && Date.now() < deadline) {
    await sleep(pollMs);
    const tick = await fetchJson(new URL('/api/server-status', baseUrl), {});
    if (tick.status !== 200) {
      console.error(`poll: status ${tick.status} — retrying next tick`);
      continue;
    }
    remainingActive = tick.body.activeGames;
    const remainingMs = Math.max(0, deadline - Date.now());
    console.log(`active=${remainingActive} window-remaining=${humanMs(remainingMs)}`);
  }

  // 4. Decide outcome.
  if (remainingActive === 0) {
    console.log(JSON.stringify({ ok: true, activeGames: 0, deployHint: 'railway up --service web' }));
    console.log('\nDrain complete. Ready to deploy. Next:');
    console.log('  railway up --service web');
    console.log('\nPause/resume will catch any games that started during drain.');
    process.exit(0);
  } else {
    console.error(JSON.stringify({ ok: false, activeGames: remainingActive, reason: 'window_elapsed' }));
    console.error(`\nWindow elapsed with ${remainingActive} game${remainingActive === 1 ? '' : 's'} still active.`);
    console.error('Deploying now will pause those games via the pause/resume system; players reconnect to a resumable state.');
    console.error('To proceed: railway up --service web');
    console.error('To cancel:  node scripts/safe-deploy.mjs --cancel (or POST /admin/drain/cancel)');
    process.exit(4);
  }
}

async function startDrain() {
  const res = await fetchJson(new URL('/admin/drain', baseUrl), {
    method: 'POST',
    headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ windowMs }),
  });
  if (res.status !== 200) {
    throw withExit(3, `/admin/drain returned ${res.status}: ${JSON.stringify(res.body)}`);
  }
  console.log(`drain started. restartAt=${new Date(res.body.restartAt ?? Date.now() + windowMs).toISOString()}`);
}

async function cancelDrain() {
  const res = await fetchJson(new URL('/admin/drain/cancel', baseUrl), {
    method: 'POST',
    headers: { 'authorization': `Bearer ${token}` },
  });
  if (res.status !== 200) {
    throw new Error(`/admin/drain/cancel returned ${res.status}: ${JSON.stringify(res.body)}`);
  }
  drainActive = false;
}

function withExit(code, message) {
  const err = new Error(message);
  err.exitCode = code;
  return err;
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readEnter() {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}

function humanMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return rem > 0 ? `${m}m${rem}s` : `${m}m`;
}

function normalizeBaseUrl(value) {
  const url = new URL(value.endsWith('/') ? value : `${value}/`);
  return url;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--base-url') out.baseUrl = argv[++i];
    else if (arg === '--window-ms') out.windowMs = Number(argv[++i]);
    else if (arg === '--poll-ms') out.pollMs = Number(argv[++i]);
    else if (arg === '--force') out.force = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: safe-deploy.mjs [--base-url URL] [--window-ms MS] [--poll-ms MS] [--force]');
      console.log('Requires MISTBOARD_DRAIN_TOKEN in env.');
      process.exit(0);
    } else {
      console.error(`unknown arg: ${arg}`);
      process.exit(1);
    }
  }
  return out;
}
