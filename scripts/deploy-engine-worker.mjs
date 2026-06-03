#!/usr/bin/env node
// Deploy the engine-worker service — the manual, gotcha-prone half of a prod
// deploy. release:prod covers the WEB (CI gate → push → auto-deploy → smoke);
// the engine-worker does NOT auto-deploy on push and was always hand-driven.
//
// What this codifies (the gotchas hit on 2026-06-03):
//   1. Cachebust gate — the engine-worker re-clones the private engine repo
//      ONLY when railpack.json's `echo cachebust-…-<sha>` line changes. If the
//      engine changed but the cachebust still points at the old SHA, the deploy
//      ships the OLD engine silently. We compare the cachebust SHA against the
//      engine repo's origin/main HEAD and refuse (or --bump) on mismatch.
//   2. `railway up --service engine-worker` — the actual deploy (no auto-deploy).
//      Uploads the LOCAL working tree, so stash uncommitted WIP first if it
//      would ship (web content / server code). railway up over a RED CI is on
//      you — run this only after CI is green.
//   3. Boot-health verify — R1-prevent makes the worker self-test (one real
//      move) before `ready` and REFUSE to come up if it can't serve. We poll
//      the deploy logs for `engine_warmup_ok` + `selftest ok` and FAIL on
//      `boot_warmup_failed` / timeout, so a refused boot isn't mistaken for OK.
//
// Usage:
//   node scripts/deploy-engine-worker.mjs              # check-only (default)
//   node scripts/deploy-engine-worker.mjs --deploy     # deploy + verify boot
//   node scripts/deploy-engine-worker.mjs --bump       # rewrite cachebust → engine HEAD (then commit + push)
//
// Exit codes: 0 ok · 1 config/usage · 2 cachebust mismatch · 3 deploy failed
//   · 4 boot-health failed/timeout

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const SERVICE = 'engine-worker';
const ENGINE_REMOTE = 'git@github.com:brianhliou/mistboard-engine.git';
const ENGINE_REF = process.env.MISTBOARD_ENGINE_REF ?? 'main';
const RAILPACK = 'railpack.json';
const HEALTH_TIMEOUT_MS = Number.parseInt(process.env.DEPLOY_HEALTH_TIMEOUT_MS ?? '900000', 10);
const HEALTH_POLL_MS = 20_000;

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  printHelp();
  process.exit(0);
}

const cachebustSha = readCachebustSha();
const engineSha = engineHeadSha();
const match = engineSha.startsWith(cachebustSha) || cachebustSha.startsWith(engineSha);

console.log('# deploy-engine-worker');
console.log(`engine ${ENGINE_REF} HEAD: ${engineSha}`);
console.log(`railpack cachebust SHA:   ${cachebustSha}`);
console.log(`cachebust matches engine: ${match ? 'yes' : 'NO — engine changed but cachebust not bumped'}`);

if (opts.bump) {
  if (match) {
    console.log('bump: skipped (cachebust already at engine HEAD)');
  } else {
    bumpCachebust(engineSha);
    console.log(`bump: railpack.json cachebust → ${engineSha} (commit + push before deploying)`);
  }
  process.exit(0);
}

if (!match) {
  console.error(
    '\nRefusing: the engine changed but the cachebust still points at the old SHA, so',
  );
  console.error('the engine-worker would re-deploy the OLD engine. Run with --bump, then');
  console.error('commit + push railpack.json, then re-run with --deploy.');
  process.exit(2);
}

if (!opts.deploy) {
  console.log('\ncheck-only. Re-run with --deploy to ship + verify boot health.');
  process.exit(0);
}

// --- deploy ---
console.log(`\n$ railway up --service ${SERVICE} --detach`);
const up = railway(['up', '--service', SERVICE, '--detach'], { inherit: true });
if (up.status !== 0) {
  console.error('deploy: railway up failed');
  process.exit(3);
}

// --- boot-health verify ---
console.log('\n# boot-health (waiting for self-test + warmup; R1-prevent)');
const healthy = pollBootHealth();
if (!healthy) {
  console.error('boot-health: FAILED or timed out — check the build/deploy logs.');
  console.error('A refused boot (boot_warmup_failed) means the worker could not serve;');
  console.error('the previous healthy deploy keeps serving (R1-prevent fail-safe).');
  process.exit(4);
}
console.log('boot-health: OK — worker self-tested and is serving.');
process.exit(0);

// ---------------------------------------------------------------------------

function pollBootHealth() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  // Markers only count if newer than now — don't match a prior boot's logs.
  const startIso = new Date().toISOString();
  while (Date.now() < deadline) {
    sleep(HEALTH_POLL_MS);
    const logs = railwayLogsTail();
    const failed = logs.find(
      (l) => l.includes('boot_warmup_failed') || /engine_alert.*critical/.test(l),
    );
    if (failed) {
      console.error(`  saw failure: ${failed.slice(0, 200)}`);
      return false;
    }
    const warm = logs.filter((l) => l > startIso && /engine_warmup_ok|selftest ok/.test(l));
    if (warm.length > 0) {
      console.log(`  ${warm.length} healthy boot marker(s) since ${startIso}`);
      return true;
    }
    console.log(`  …still booting (${Math.round((deadline - Date.now()) / 1000)}s left)`);
  }
  return false;
}

function railwayLogsTail() {
  // railway logs streams; bound it with a line cap (head closes the pipe).
  const res = spawnSync('sh', ['-c', `railway logs --service ${SERVICE} 2>&1 | head -300`], {
    env: railwayEnv(),
    encoding: 'utf8',
    timeout: 60_000,
  });
  return (res.stdout ?? '').split('\n');
}

function railway(args, { inherit = false } = {}) {
  return spawnSync('railway', args, {
    env: railwayEnv(),
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
    timeout: 300_000,
  });
}

function railwayEnv() {
  // A stale RAILWAY_API_TOKEN in the launch env shadows the valid browser
  // session ("Unauthorized") — drop it so the CLI uses the logged-in session.
  const env = { ...process.env };
  delete env.RAILWAY_API_TOKEN;
  return env;
}

function readCachebustSha() {
  const text = readFileSync(RAILPACK, 'utf8');
  const m = text.match(/echo cachebust-[\w.-]*?-([0-9a-f]{7,40})\b/);
  if (!m) {
    console.error(`could not find an "echo cachebust-…-<sha>" line in ${RAILPACK}`);
    process.exit(1);
  }
  return m[1];
}

function bumpCachebust(sha) {
  const text = readFileSync(RAILPACK, 'utf8');
  const date = new Date().toISOString().slice(0, 10);
  const next = text.replace(
    /echo cachebust-[\w.-]+/,
    `echo cachebust-${date}-engine-${sha.slice(0, 7)}`,
  );
  writeFileSync(RAILPACK, next);
}

function engineHeadSha() {
  const res = spawnSync('git', ['ls-remote', ENGINE_REMOTE, ENGINE_REF], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(`could not read ${ENGINE_REMOTE} ${ENGINE_REF}: ${res.stderr?.trim()}`);
    process.exit(1);
  }
  const sha = (res.stdout ?? '').trim().split(/\s+/)[0] ?? '';
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    console.error(`unexpected ls-remote output: ${res.stdout}`);
    process.exit(1);
  }
  return sha.slice(0, 7);
}

function sleep(ms) {
  // Synchronous wait so the poll loop stays simple + sequential (no busy-spin).
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function parseArgs(args) {
  const o = { deploy: false, bump: false, help: false };
  for (const a of args) {
    if (a === '--deploy') o.deploy = true;
    else if (a === '--bump') o.bump = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else {
      console.error(`unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return o;
}

function printHelp() {
  console.log(
    [
      'Deploy the engine-worker (cachebust gate + railway up + R1-prevent boot-health).',
      '',
      'Usage:',
      '  node scripts/deploy-engine-worker.mjs            check-only (default)',
      '  node scripts/deploy-engine-worker.mjs --deploy   deploy + verify boot health',
      '  node scripts/deploy-engine-worker.mjs --bump     rewrite cachebust → engine HEAD',
    ].join('\n'),
  );
}
