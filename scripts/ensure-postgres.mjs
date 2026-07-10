#!/usr/bin/env node

// Bring the local dev Postgres up, idempotently, from ANY working tree.
//
// Why this exists: `docker compose up -d postgres` fails from a git worktree
// when the `mistboard-postgres` container was created by the main tree's compose
// project ("The container name /mistboard-postgres is already in use"). Compose
// keys containers to its project name (the directory), so a second tree tries to
// create a second container under the same fixed container_name and collides.
//
// Fix: if the named container already exists (any state, any owning project),
// just `docker start` it — that never conflicts. Only fall back to `docker
// compose up` when the container has never been created.
//
// Fails loudly (exit 1) when Docker itself is not running, telling the user to
// start Docker Desktop or run `npm run dev:memory` (the no-Postgres path).

import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTAINER_NAME = 'mistboard-postgres';
const COMPOSE_SERVICE = 'postgres';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://mistboard:mistboard@localhost:5435/mistboard';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { host, port } = parseHostPort(DATABASE_URL);

async function main() {
  assertDockerRunning();

  if (containerExists()) {
    // Idempotent: `docker start` on an already-running container is a no-op that
    // still exits 0, so re-running is safe and never touches compose.
    runDocker(['start', CONTAINER_NAME], `start container ${CONTAINER_NAME}`);
    console.log(`ensure-postgres: started existing container ${CONTAINER_NAME}`);
  } else {
    runDocker(['compose', 'up', '-d', COMPOSE_SERVICE], `compose up ${COMPOSE_SERVICE}`, {
      cwd: repoRoot,
    });
    console.log(`ensure-postgres: created ${CONTAINER_NAME} via docker compose`);
  }

  await waitForPort(host, port, 30_000);
  console.log(`ensure-postgres: Postgres is accepting connections on ${host}:${port}`);
}

function assertDockerRunning() {
  const probe = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    encoding: 'utf8',
  });
  if (probe.error && probe.error.code === 'ENOENT') {
    failLoudly(
      'Docker CLI not found on PATH. Install Docker Desktop, or run `npm run dev:memory`.',
    );
  }
  if (probe.status !== 0) {
    failLoudly(
      'Docker does not appear to be running. Start Docker Desktop and retry, or run `npm run dev:memory` (in-memory, no Postgres).',
    );
  }
}

function containerExists() {
  const result = spawnSync(
    'docker',
    ['ps', '-a', '--filter', `name=^/${CONTAINER_NAME}$`, '--format', '{{.Names}}'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    failLoudly(`Failed to inspect Docker containers: ${(result.stderr || '').trim()}`);
  }
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .includes(CONTAINER_NAME);
}

function runDocker(args, label, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', stdio: 'inherit', ...options });
  if (result.status !== 0) {
    failLoudly(`Failed to ${label} (exit ${result.status ?? 'unknown'}).`);
  }
}

function waitForPort(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolvePromise) => {
    const attempt = () => {
      const socket = net.connect({ host, port });
      socket.setTimeout(2000);
      socket.once('connect', () => {
        socket.destroy();
        resolvePromise();
      });
      const retry = () => {
        socket.destroy();
        if (Date.now() > deadline) {
          failLoudly(
            `Postgres did not start accepting connections on ${host}:${port} within ${Math.round(
              timeoutMs / 1000,
            )}s.`,
          );
        }
        setTimeout(attempt, 500);
      };
      socket.once('error', retry);
      socket.once('timeout', retry);
    };
    attempt();
  });
}

function parseHostPort(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    return { host: url.hostname || 'localhost', port: Number.parseInt(url.port || '5432', 10) };
  } catch {
    return { host: 'localhost', port: 5435 };
  }
}

function failLoudly(message) {
  console.error(`ensure-postgres: ${message}`);
  process.exit(1);
}

await main();
