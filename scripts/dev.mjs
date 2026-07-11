#!/usr/bin/env node

// Launch the dev server+web pair with parameterizable ports so multiple worktree
// sessions can run side by side against ONE shared Postgres.
//
// One knob: MISTBOARD_DEV_PORT_BASE (default 3000).
//   web    = base      (vite --port ${PORT} --strictPort)
//   server = base + 1  (server-config.ts reads PORT, defaults to 3001)
//   web proxy + derived dev WebSocket URL point at http://localhost:${base + 1}
//   via MISTBOARD_DEV_API_URL (vite.config.ts).
//
// strictPort stays on for BOTH: an occupied port is a loud failure, never a
// silent auto-increment (a hard repo rule — a stray listener otherwise serves a
// stale tree, see the Localhost Port Shadowing lesson).
//
//   node scripts/dev.mjs            # persistent (Postgres-backed) server
//   node scripts/dev.mjs --memory   # in-memory server (no Postgres)

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const concurrentlyBin = resolve(repoRoot, 'node_modules', '.bin', 'concurrently');

const memory = process.argv.includes('--memory');
const serverScript = memory ? 'dev' : 'dev:persistent';

// Local dev defaults: variant flags ON so room creation and PvE work out of
// the box. Prod reads these from Railway env; a fresh `npm run dev` in a
// clean shell otherwise boots flag-off and room creation rejects with e.g.
// `xiangqi_disabled` (surfaced in the UI as "Could not start an engine
// game"). Explicit env always wins: export MISTBOARD_XIANGQI_ENABLED=false
// to exercise the gated-off path. Rated + lobby chat are deliberately NOT
// defaulted — those are launch decisions, and dev should match prod's
// posture on them unless opted in.
const DEV_DEFAULT_TRUE_FLAGS = [
  'MISTBOARD_XIANGQI_ENABLED',
  'MISTBOARD_DARK_XIANGQI_ENABLED',
  'MISTBOARD_DARK_MINI_XIANGQI_ENABLED',
  'MISTBOARD_FORTRESS_XIANGQI_ENABLED',
  'MISTBOARD_JIEQI_ENABLED',
  'MISTBOARD_BANQI_ENABLED',
  'MISTBOARD_LUZHANQI_ENABLED',
  'MISTBOARD_REVEAL_CHESS_ENABLED',
  'MISTBOARD_CROSSROADS_CHESS_ENABLED',
  'MISTBOARD_DARK_CROSSROADS_CHESS_ENABLED',
  'MISTBOARD_DARK_SHOGI_ENABLED',
  'MISTBOARD_DARK_CRAZYHOUSE_ENABLED',
  'MISTBOARD_KRIEGSPIEL_ENABLED',
  'MISTBOARD_JUNGLE_ENABLED',
  'MISTBOARD_JUNGLE_FLIP_ENABLED',
  'MISTBOARD_CORRESPONDENCE_ENABLED',
];

const childEnv = { ...process.env };
for (const flag of DEV_DEFAULT_TRUE_FLAGS) {
  if (childEnv[flag] === undefined) childEnv[flag] = 'true';
}

const base = parsePortBase(process.env.MISTBOARD_DEV_PORT_BASE);
const webPort = base;
const serverPort = base + 1;
const devApiUrl = `http://localhost:${serverPort}`;

const serverCommand = `env PORT=${serverPort} npm run ${serverScript} --workspace @mistboard/server`;
const webCommand = `env PORT=${webPort} MISTBOARD_DEV_API_URL=${devApiUrl} npm run dev --workspace @mistboard/web`;

console.log(
  `dev: web=${webPort} server=${serverPort} (${memory ? 'in-memory' : 'persistent'}); ` +
    `set MISTBOARD_DEV_PORT_BASE to run a second session on other ports.`,
);

const child = spawn(
  concurrentlyBin,
  [
    '--kill-others-on-fail',
    '--names',
    'server,web',
    '--prefix-colors',
    'blue,green',
    serverCommand,
    webCommand,
  ],
  { stdio: 'inherit', env: childEnv },
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

function parsePortBase(raw) {
  if (raw === undefined || raw.trim() === '') return 3000;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1024 || value > 65_534) {
    console.error(
      `dev: MISTBOARD_DEV_PORT_BASE must be an integer in [1024, 65534] (got "${raw}"). ` +
        'web binds to it and server to base+1.',
    );
    process.exit(1);
  }
  return value;
}
