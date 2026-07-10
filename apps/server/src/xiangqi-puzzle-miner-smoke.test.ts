// Opt-in end-to-end smoke for the standard-xiangqi puzzle miner
// (scripts/variant-lab/xiangqi-puzzle-miner.ts): mines the dpxq fixture game
// in dir mode at tiny node budgets and asserts the run completes and prints
// the machine-parseable metrics line. Yield may legitimately be 0 (the fixture
// is a balanced pro game); the smoke asserts the pipeline, not the content.
//
// Skipped unless BOTH hold:
//   - MISTBOARD_XIANGQI_MINER_SMOKE=1 (opt-in: keeps the engine out of every
//     local unit-test / pre-push run even on machines that have Pikafish), and
//   - the Pikafish binary + NNUE net resolve locally.
//
// Run: MISTBOARD_XIANGQI_MINER_SMOKE=1 npm run test:unit --workspace @mistboard/server

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { pikafishXiangqiNetPath, pikafishXiangqiPath } from './xiangqi-pikafish-engine.js';

const execFileAsync = promisify(execFile);

// Works from both src (tsx) and dist (compiled) at the same depth.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function engineResolves(): boolean {
  try {
    pikafishXiangqiNetPath(pikafishXiangqiPath());
    return true;
  } catch {
    return false;
  }
}

const optedIn = process.env.MISTBOARD_XIANGQI_MINER_SMOKE === '1';
const skip = !optedIn
  ? 'opt-in: set MISTBOARD_XIANGQI_MINER_SMOKE=1 (needs a local Pikafish binary)'
  : engineResolves()
    ? false
    : 'Pikafish binary or NNUE net not found';

test('xiangqi puzzle miner mines the dpxq fixture end-to-end and prints metrics', {
  skip,
}, async () => {
  const jsonl = join(mkdtempSync(join(tmpdir(), 'xq-miner-smoke-')), 'mine.jsonl');
  const { stdout } = await execFileAsync(
    resolve(REPO_ROOT, 'node_modules', '.bin', 'tsx'),
    [
      resolve(REPO_ROOT, 'scripts', 'variant-lab', 'xiangqi-puzzle-miner.ts'),
      '--source',
      'dir',
      '--dir',
      resolve(REPO_ROOT, 'apps', 'server', 'fixtures', 'dpxq'),
      '--limit',
      '1',
      '--scan-nodes',
      '2000',
      '--verify-nodes',
      '8000',
      '--concurrency',
      '1',
      '--jsonl',
      jsonl,
    ],
    { cwd: REPO_ROOT, timeout: 180_000 },
  );

  const lines = stdout.trim().split('\n');
  const metrics = JSON.parse(lines[lines.length - 1] as string) as {
    kind: string;
    games: { scanned: number; failed: number };
    positionsEvaluated: number;
    verified: number;
  };
  assert.equal(metrics.kind, 'xiangqi-puzzle-mine-metrics');
  assert.equal(metrics.games.failed, 0);
  assert.equal(metrics.games.scanned, 1);
  assert.ok(metrics.positionsEvaluated > 0);
  // Yield may be 0 on the balanced fixture game; the metric just has to exist.
  assert.ok(metrics.verified >= 0);
});
