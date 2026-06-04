import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';
import { engineCounters } from './obs.js';
import { PythonPool } from './python-pool.js';

// A fake pool worker (node, not python): emits `ready`, then for each request
// reads a shared state file holding `crashes_remaining`. While > 0 it decrements
// and exits(1) (simulating a crash/OOM); once 0 it replies ok. Lets us drive the
// R1-recover retry path deterministically without a real engine or Stockfish.
const FAKE_WORKER = `
import fs from 'node:fs';
const stateFile = process.env.FAKE_WORKER_STATE;
process.stdout.write(JSON.stringify({ kind: 'ready', engineId: 'fake', pid: process.pid }) + '\\n');
let buf = '';
process.stdin.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const req = JSON.parse(line);
    let remaining = 0;
    try { remaining = parseInt(fs.readFileSync(stateFile, 'utf8'), 10) || 0; } catch {}
    if (remaining > 0) {
      fs.writeFileSync(stateFile, String(remaining - 1));
      process.exit(1); // crash mid-request
    }
    process.stdout.write(JSON.stringify({
      requestId: req.requestId,
      ok: true,
      response: { move: { from: 'e2', to: 'e4' }, engine: { id: 'fake' }, roomId: 'r' },
    }) + '\\n');
  }
});
`;

let dir: string;
let scriptPath: string;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'pool-test-'));
  scriptPath = join(dir, 'fake-worker.mjs');
  writeFileSync(scriptPath, FAKE_WORKER);
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makePool(stateFile: string): PythonPool {
  return new PythonPool({
    engineId: 'fake',
    size: 2,
    pythonBin: process.execPath,
    scriptPath,
    cwd: dir,
    workerSeed: 1,
    readyTimeoutMs: 5_000,
  });
}

const PAYLOAD = { engineTurnRequest: { gameId: 'g', engineId: 'fake' } };

test('R1-recover: a one-off worker crash is retried on a healthy worker', async () => {
  const stateFile = join(dir, 'state-retry');
  writeFileSync(stateFile, '1'); // first dispatch crashes, then recover
  process.env.FAKE_WORKER_STATE = stateFile;
  const pool = makePool(stateFile);
  await pool.start();
  const retriesBefore = engineCounters.totalPythonPoolRetries;
  try {
    const res = await pool.chooseMove(PAYLOAD, 4_000);
    assert.deepEqual(res.move, { from: 'e2', to: 'e4' }, 'move recovered after the crash');
    assert.equal(
      engineCounters.totalPythonPoolRetries,
      retriesBefore + 1,
      'exactly one retry recorded',
    );
  } finally {
    pool.dispose();
  }
});

test('R1-recover: a persistently failing move rejects after exhausting attempts', async () => {
  const stateFile = join(dir, 'state-exhaust');
  writeFileSync(stateFile, '9'); // every dispatch crashes → retries exhaust
  process.env.FAKE_WORKER_STATE = stateFile;
  const pool = makePool(stateFile);
  await pool.start();
  try {
    await assert.rejects(
      pool.chooseMove(PAYLOAD, 4_000),
      /worker .* timeout|pool request|closed|exit|!ok|fail/i,
      'rejects once attempts are exhausted (no infinite retry loop)',
    );
  } finally {
    pool.dispose();
  }
});

// A fake worker that echoes its own pid + the request's gameId, so a test can
// tell WHICH worker served a move and assert session-affinity stickiness.
const FAKE_WORKER_PID = `
process.stdout.write(JSON.stringify({ kind: 'ready', engineId: 'fake', pid: process.pid }) + '\\n');
let buf = '';
process.stdin.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const req = JSON.parse(line);
    const gameId = (req.engineTurnRequest && req.engineTurnRequest.gameId) || null;
    process.stdout.write(JSON.stringify({
      requestId: req.requestId,
      ok: true,
      response: { move: { from: 'e2', to: 'e4' }, engine: { id: 'fake' }, roomId: gameId, workerPid: process.pid },
    }) + '\\n');
  }
});
`;

const pidOf = (r: unknown): number | undefined => (r as { workerPid?: number }).workerPid;

test('affinity: a game stays on one worker; concurrent games spread', async () => {
  const scriptFile = join(dir, 'pid-worker.mjs');
  writeFileSync(scriptFile, FAKE_WORKER_PID);
  const pool = new PythonPool({
    engineId: 'fake',
    size: 2,
    pythonBin: process.execPath,
    scriptPath: scriptFile,
    cwd: dir,
    workerSeed: 1,
    readyTimeoutMs: 5_000,
    affinity: true,
  });
  await pool.start();
  try {
    const move = (gameId: string) =>
      pool.chooseMove({ engineTurnRequest: { gameId, engineId: 'fake' } }, 4_000);

    const a1 = await move('A');
    const a2 = await move('A');
    const a3 = await move('A');
    assert.ok(pidOf(a1) !== undefined, 'worker reported its pid');
    assert.equal(pidOf(a2), pidOf(a1), 'game A sticks to its worker (delta-feed)');
    assert.equal(pidOf(a3), pidOf(a1), 'game A sticks across moves');

    // Two games dispatched concurrently land on different workers (2-worker pool).
    const [x, y] = await Promise.all([move('X'), move('Y')]);
    assert.notEqual(pidOf(x), pidOf(y), 'concurrent games spread across workers');
  } finally {
    pool.dispose();
  }
});
