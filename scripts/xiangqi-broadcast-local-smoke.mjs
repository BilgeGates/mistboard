#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

const DATABASE_URL = 'postgres://mistboard:mistboard@localhost:5435/mistboard';
const FIXTURE_DIR = 'packages/game/fixtures/xiangqi-broadcast/2025-wxc-sample';
const WXF_HTML = 'apps/server/fixtures/wxf-dhtmlxq/2019-wxc-men-r1a-mini.html';
const TSX = 'node_modules/.bin/tsx';
const DEV_BASE_URL = 'http://localhost:5173';

const started = Date.now();
const children = [];

function log(message) {
  console.log(`[xiangqi-broadcast-smoke] ${message}`);
}

function fail(message) {
  console.error(`[xiangqi-broadcast-smoke] failed: ${message}`);
  process.exitCode = 1;
}

function runNpm(args, options = {}) {
  log(`$ npm ${args.join(' ')}`);
  const result = spawnSync('npm', args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL, ...(options.env ?? {}) },
    encoding: 'utf-8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (options.capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(' ')} exited ${result.status ?? 'without status'}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

async function canConnect(host, port, timeoutMs = 1000) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === 'string') {
          reject(new Error('could not allocate a local port'));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function ensureDatabase() {
  log('ensuring local Postgres is available');
  if (await canConnect('127.0.0.1', 5435, 1000)) return;

  const dbUp = spawnSync('npm', ['run', 'db:up'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    stdio: 'inherit',
  });
  if (dbUp.status !== 0) {
    log('db:up did not exit cleanly; checking whether localhost:5435 is already reachable');
  }
  if (!(await canConnect('127.0.0.1', 5435, 2000))) {
    throw new Error('local Postgres is not reachable on localhost:5435');
  }
}

async function startSource(args) {
  const child = spawn(TSX, ['apps/server/src/serve-xiangqi-broadcast-source.ts', ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);

  let output = '';
  const append = (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`source server did not start:\n${output}`));
    }, 10_000);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`source server exited early with ${code}:\n${output}`));
    });
    const poll = setInterval(() => {
      if (output.includes('xiangqi broadcast fixture source listening')) {
        clearTimeout(timeout);
        clearInterval(poll);
        resolve();
      }
    }, 50);
  });
}

function stopSources() {
  for (const child of children.splice(0)) {
    if (!child.killed) child.kill('SIGINT');
  }
}

function assertPollOk(output, label) {
  if (!output.includes('poll ok ') || !output.includes('failed=0')) {
    throw new Error(`${label} poll did not report a clean import`);
  }
}

async function main() {
  try {
    await ensureDatabase();
    runNpm(['run', 'migrate', '--workspace', '@mistboard/server']);

    log('importing canonical completed fixture');
    runNpm([
      'run',
      'import:xiangqi-broadcast',
      '--workspace',
      '@mistboard/server',
      '--',
      '--dir',
      FIXTURE_DIR,
    ]);

    log('running deterministic tape simulation');
    runNpm([
      'run',
      'simulate:xiangqi-broadcast',
      '--workspace',
      '@mistboard/server',
      '--',
      '--dir',
      FIXTURE_DIR,
      '--speed',
      'instant',
    ]);

    const fakePort = await freePort();
    log(`starting fake live source on localhost:${fakePort}`);
    await startSource(['--dir', FIXTURE_DIR, '--mode', 'clean', '--port', String(fakePort)]);
    const fakePoll = runNpm(
      [
        'run',
        'poll:xiangqi-broadcast',
        '--workspace',
        '@mistboard/server',
        '--',
        '--source',
        `http://localhost:${fakePort}/source.json`,
        '--once',
        '--timeout-ms',
        '1000',
      ],
      { capture: true },
    );
    assertPollOk(fakePoll, 'fake source');

    const wxfPort = await freePort();
    log(`starting WXF/DhtmlXQ fixture source on localhost:${wxfPort}`);
    await startSource([
      '--wxf-html',
      WXF_HTML,
      '--wxf-tour-slug',
      '2019-wxc-men-local-smoke',
      '--wxf-tour-name',
      '2019 World Xiangqi Championship Men Local Smoke',
      '--wxf-round-id',
      '2019-wxc-men-local-smoke-r01a',
      '--wxf-round-name',
      'Men Round 1 Page 1a',
      '--port',
      String(wxfPort),
    ]);
    const wxfPoll = runNpm(
      [
        'run',
        'poll:xiangqi-broadcast',
        '--workspace',
        '@mistboard/server',
        '--',
        '--source',
        `http://localhost:${wxfPort}/source.json`,
        '--once',
        '--timeout-ms',
        '1000',
      ],
      { capture: true },
    );
    assertPollOk(wxfPoll, 'WXF fixture source');

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    log(`ok in ${elapsed}s`);
    console.log('\nNext visual check:');
    console.log('  npm run dev:persistent');
    console.log(`  ${DEV_BASE_URL}/broadcast/xiangqi`);
    console.log(`  ${DEV_BASE_URL}/broadcast/xiangqi/2025-wxc-sample`);
    console.log(`  ${DEV_BASE_URL}/broadcast/xiangqi/2025-wxc-sample/round/men-r1`);
    console.log(`  ${DEV_BASE_URL}/broadcast/xiangqi/board/2025-wxc-sample-men-r1-b01`);
    console.log(`  ${DEV_BASE_URL}/broadcast/xiangqi/2019-wxc-men-local-smoke`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    stopSources();
  }
}

await main();
