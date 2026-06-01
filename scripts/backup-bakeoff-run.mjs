#!/usr/bin/env node
// One-command backup of a recovered bakeoff run into Postgres.
//
// Chains the two pieces that already exist:
//   1. git pull the engine repo          → fetch recover-pushed tarballs
//   2. untar recovered/<run-id>.tar.gz    → a temp run dir
//   3. apps/server/src/import-bakeoff-run → write games (moves + times +
//                                           metadata; perply belief logs ignored)
//
// A `recover` ticket (kind: recover, recover_run_id: <id>) must already have run
// on engine-bakeoff so the tarball exists in the engine repo. This script never
// touches the batch box — it only reads the git-pushed artifact and writes to
// whatever DATABASE_URL points at.
//
// Usage (prod — railway injects DATABASE_URL into the process, never printed):
//   railway run --service web -- node scripts/backup-bakeoff-run.mjs <run-id>
//
// Or against any DB you provide:
//   DATABASE_URL=... node scripts/backup-bakeoff-run.mjs <run-id>
//
// Options:
//   --list                      list recoverable run ids and exit
//   --engine-dir <path>         engine repo (default: ../mistboard-engine or $MISTBOARD_ENGINE_DIR)
//   --no-pull                   skip the engine-repo git pull
//   --corpus <id>               corpus id (default: <run-id>)
//   --tier1-id / --tier1-name        v2/tier1 engine identity (default: v2.0)
//   --opponent-id / --opponent-name  opponent identity (default: v0.9.5)
//   --mode <eve> / --visibility <public>

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

const DEFAULTS = {
  tier1Id: 'engine-v2-2026-05-24',
  tier1Name: 'Mistboard Engine v2.0',
  opponentId: 'python-tier1-v0.9.5',
  opponentName: 'Mistboard Engine v0.9.5',
  mode: 'eve',
  visibility: 'public',
};

function parseArgs(argv) {
  const opts = { _: [], pull: true, list: false };
  const valueFlags = new Map([
    ['engine-dir', 'engineDir'],
    ['corpus', 'corpus'],
    ['tier1-id', 'tier1Id'],
    ['tier1-name', 'tier1Name'],
    ['opponent-id', 'opponentId'],
    ['opponent-name', 'opponentName'],
    ['mode', 'mode'],
    ['visibility', 'visibility'],
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      opts._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key === 'list') opts.list = true;
    else if (key === 'no-pull') opts.pull = false;
    else if (valueFlags.has(key) && argv[i + 1] !== undefined) {
      opts[valueFlags.get(key)] = argv[i + 1];
      i += 1;
    } else {
      fail(`unknown or incomplete flag: --${key}`);
    }
  }
  return opts;
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

function recoveredDir(engineDir) {
  return join(engineDir, 'lab', 'bakeoffs', 'data', 'recovered');
}

function listRecoverable(engineDir) {
  const dir = recoveredDir(engineDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.tar.gz'))
    .map((f) => f.slice(0, -'.tar.gz'.length))
    .sort();
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const engineDir = resolve(
    opts.engineDir ?? process.env.MISTBOARD_ENGINE_DIR ?? join(repoRoot, '..', 'mistboard-engine'),
  );
  if (!existsSync(engineDir)) {
    fail(`engine repo not found at ${engineDir} (set --engine-dir or $MISTBOARD_ENGINE_DIR)`);
  }

  if (opts.pull) {
    try {
      run('git', ['-C', engineDir, 'pull', '--ff-only']);
    } catch {
      console.warn('warning: git pull failed; continuing with the local checkout');
    }
  }

  if (opts.list) {
    const ids = listRecoverable(engineDir);
    console.log(ids.length ? `recoverable runs:\n  ${ids.join('\n  ')}` : 'no recovered artifacts');
    return;
  }

  const runId = opts._[0];
  if (!runId) fail('missing <run-id>. Use --list to see recoverable runs.');

  if (!process.env.DATABASE_URL) {
    fail(
      'DATABASE_URL is not set. Run via:\n' +
        `  railway run --service web -- node scripts/backup-bakeoff-run.mjs ${runId}`,
    );
  }

  const tarball = join(recoveredDir(engineDir), `${runId}.tar.gz`);
  if (!existsSync(tarball)) {
    const available = listRecoverable(engineDir);
    fail(
      `no recovered artifact at ${tarball}.\n` +
        'Queue a recover ticket on engine-bakeoff first (kind: recover, ' +
        `recover_run_id: ${runId}), let it process, then retry.\n` +
        (available.length ? `Currently recoverable:\n  ${available.join('\n  ')}` : ''),
    );
  }

  const workDir = mkdtempSync(join(tmpdir(), `mistboard-bakeoff-${runId}-`));
  try {
    run('tar', ['xzf', tarball, '-C', workDir]);
    const ingest = resolve(repoRoot, 'apps', 'server', 'src', 'import-bakeoff-run.ts');
    run(
      'npx',
      [
        'tsx',
        ingest,
        '--run',
        workDir,
        '--corpus',
        opts.corpus ?? runId,
        '--tier1-id',
        opts.tier1Id ?? DEFAULTS.tier1Id,
        '--tier1-name',
        opts.tier1Name ?? DEFAULTS.tier1Name,
        '--opponent-id',
        opts.opponentId ?? DEFAULTS.opponentId,
        '--opponent-name',
        opts.opponentName ?? DEFAULTS.opponentName,
        '--mode',
        opts.mode ?? DEFAULTS.mode,
        '--visibility',
        opts.visibility ?? DEFAULTS.visibility,
        '--skip-migrations',
      ],
      { cwd: repoRoot },
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main();
