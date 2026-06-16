// MistyBanqi move provider for Banqi (半棋) PvE.
//
// The engine is our own `banqi-engine` binary ("MistyBanqi", in
// ~/projects/mistboard-engine/banqi-engine) — a standalone Rust αβ+Star1+TT engine
// driven as a UCI subprocess, the same Tier-B pattern as jieqi/Crossroads (NOT the
// fog engine-worker). Banqi has hidden piece IDENTITIES the engine must not learn, so
// we hand it a redacted CURRENT-position FEN built by banqi-fen.ts. One process per
// request (stateless, robust); promote to a persistent pool only under real load.
//
// Fixed-strength classical engine (no net), so "tiers" are just movetime (search
// depth). v0.1.0.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const BANQI_DEFAULT_ENGINE_ID = 'misty-banqi-strong';

export type BanqiEngineTier = {
  id: string;
  name: string;
  movetimeMs: number;
};

// MistyBanqi is fixed-strength; tiers vary only movetime (more time = deeper αβ = stronger).
const BANQI_ENGINE_TIERS = [
  { id: 'misty-banqi-amateur', name: 'MistyBanqi - Amateur', movetimeMs: 200 },
  { id: BANQI_DEFAULT_ENGINE_ID, name: 'MistyBanqi - Strong', movetimeMs: 600 },
  { id: 'misty-banqi-strongest', name: 'MistyBanqi - Strongest', movetimeMs: 1500 },
] as const satisfies readonly BanqiEngineTier[];

export const BANQI_PLAYABLE_ENGINES: readonly BanqiEngineTier[] = BANQI_ENGINE_TIERS;

const BANQI_ENGINE_BY_ID: ReadonlyMap<string, BanqiEngineTier> = new Map(
  BANQI_ENGINE_TIERS.map((engine) => [engine.id, engine]),
);

const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_QUEUE_TIMEOUT_MS = 5_000;

let activeProcesses = 0;
const queue: Array<{
  reject(err: Error): void;
  resolve(): void;
  timer: ReturnType<typeof setTimeout>;
}> = [];

// Resolve the MistyBanqi binary: explicit env override, else the dev build location,
// else the prod (railpack-compiled) / system locations.
export function banqiEnginePath(): string {
  const explicit = process.env.MISTBOARD_BANQI_ENGINE_PATH;
  if (explicit) {
    const resolved = resolve(explicit);
    if (!existsSync(resolved)) {
      throw new Error(
        `MISTBOARD_BANQI_ENGINE_PATH points at ${resolved} but the binary does not exist`,
      );
    }
    return resolved;
  }
  const home = process.env.HOME;
  if (home) {
    const dev = resolve(
      home,
      'projects',
      'mistboard-engine',
      'banqi-engine',
      'target',
      'release',
      'banqi-engine',
    );
    if (existsSync(dev)) return dev;
  }
  for (const candidate of [
    resolve(process.cwd(), 'bin', 'banqi-engine'),
    '/app/bin/banqi-engine',
    '/usr/local/bin/banqi-engine',
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('MistyBanqi (banqi) binary not found. Set MISTBOARD_BANQI_ENGINE_PATH.');
}

export function banqiEngineTierFor(engineId: string | undefined): BanqiEngineTier | null {
  if (!engineId) return null;
  return BANQI_ENGINE_BY_ID.get(engineId) ?? null;
}

export function banqiEngineDisplayName(engineId: string): string {
  return banqiEngineTierFor(engineId)?.name ?? engineId;
}

export function isBanqiEngineClientId(clientId: string | undefined): boolean {
  return banqiEngineTierFor(clientId) !== null;
}

export type BanqiEngineOptions = { movetimeMs?: number };

/**
 * Ask MistyBanqi for a move given a redacted current-position FEN (see banqi-fen.ts).
 * Returns the engine's bestmove in engine UCI (rank 0..3, e.g. "a0b0", flip "a0a0") or
 * null if there is no move. The FEN is server-built and trusted; written to stdin.
 */
export async function banqiLiveEngineMove(
  engineId: string,
  fen: string,
  opts: { movetimeMs?: number } = {},
): Promise<string | null> {
  const tier = banqiEngineTierFor(engineId);
  if (!tier) throw new Error(`unknown Banqi engine: ${engineId}`);
  const release = await acquireSlot();
  try {
    return await banqiEngineMove(fen, { movetimeMs: opts.movetimeMs ?? tier.movetimeMs });
  } finally {
    release();
  }
}

export function banqiEngineMove(
  fen: string,
  opts: BanqiEngineOptions = {},
): Promise<string | null> {
  const bin = banqiEnginePath();
  const movetimeMs = opts.movetimeMs ?? 600;

  return new Promise<string | null>((resolveMove, reject) => {
    const child = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    let settled = false;

    const finish = (run: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      run();
    };

    const timer = setTimeout(
      () => finish(() => reject(new Error('banqi-engine move timed out'))),
      movetimeMs + 4000,
    );

    child.on('error', (err) => finish(() => reject(err)));
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      let newline = buf.indexOf('\n');
      while (newline >= 0) {
        const line = buf.slice(0, newline).trim();
        buf = buf.slice(newline + 1);
        if (line.startsWith('bestmove')) {
          const move = line.split(/\s+/)[1];
          finish(() => resolveMove(move && move !== '(none)' ? move : null));
          return;
        }
        newline = buf.indexOf('\n');
      }
    });

    const commands = [
      'uci',
      'ucinewgame',
      'isready',
      `position fen ${fen}`,
      `go movetime ${movetimeMs}`,
    ];
    child.stdin.write(`${commands.join('\n')}\n`);
  });
}

function acquireSlot(): Promise<() => void> {
  if (activeProcesses < maxConcurrentProcesses()) {
    activeProcesses += 1;
    return Promise.resolve(releaseSlot);
  }
  return new Promise((resolveSlot, reject) => {
    const timer = setTimeout(() => {
      const idx = queue.findIndex((entry) => entry.reject === reject);
      if (idx >= 0) queue.splice(idx, 1);
      reject(new Error('banqi-engine concurrency queue timed out'));
    }, queueTimeoutMs());
    timer.unref();
    queue.push({
      reject,
      resolve: () => {
        clearTimeout(timer);
        activeProcesses += 1;
        resolveSlot(releaseSlot);
      },
      timer,
    });
  });
}

function releaseSlot(): void {
  activeProcesses = Math.max(0, activeProcesses - 1);
  const next = queue.shift();
  if (next) next.resolve();
}

function maxConcurrentProcesses(): number {
  return boundedEnvInt('MISTBOARD_BANQI_MAX_PROCESSES', DEFAULT_MAX_CONCURRENT, 1, 8);
}

function queueTimeoutMs(): number {
  return boundedEnvInt('MISTBOARD_BANQI_QUEUE_TIMEOUT_MS', DEFAULT_QUEUE_TIMEOUT_MS, 100, 30_000);
}

function boundedEnvInt(name: string, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
