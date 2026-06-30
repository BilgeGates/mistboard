// MistyJungleFlip move provider for Flip Jungle (兽棋 / 翻翻棋) PvE.
//
// The engine is our own `jungle-flip-engine` binary ("MistyJungleFlip", in
// ~/projects/mistboard-engine/jungle-flip-engine) — a standalone Rust αβ+Star1+TT
// engine driven as a UCI subprocess, the same Tier-B pattern as banqi/jieqi/Crossroads
// (NOT the fog engine-worker). Flip Jungle has hidden piece IDENTITIES the engine must
// not learn, so we hand it a redacted CURRENT-position FEN built by jungle-flip-fen.ts.
// One process per request (stateless, robust); promote to a persistent pool only under
// real load.
//
// Fixed-strength classical engine (no net). Strength is a NODE budget (positions
// searched), not a time budget — so the bot plays the same strength on any CPU. A
// movetime cap bounds latency. One versioned bot (v0.1.0). Unlike banqi, the binary
// ignores trailing `moves` (the clock is carried in the FEN), so we never send a
// repetition window — the engine's own search-internal repetition detection applies.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Bump on every shipped eval/search change; the binary self-reports "MistyJungleFlip
// <version>" over UCI, and the engines registry records it (configHash) per game.
export const JUNGLE_FLIP_ENGINE_VERSION = '0.1.0';
export const JUNGLE_FLIP_DEFAULT_ENGINE_ID = 'misty-jungle-flip';

export type JungleFlipEngineTier = {
  id: string;
  name: string;
  version: string;
  // Strength is a NODE budget, not a time budget: `go nodes N` searches the same number
  // of positions on any CPU, so the bot plays the same strength regardless of how
  // slow/loaded the prod box is.
  nodes: number;
  // Latency cap (ms): `go nodes N movetime CAP` halts at whichever hits first, so a slow
  // box never exceeds CAP per move.
  movetimeCapMs: number;
};

// One versioned bot. The Rust engine searches ~512K nodes comfortably; the 4x4 board
// makes that very deep. Cap keeps moves playable on the shared prod vCPU.
const MISTY_JUNGLE_FLIP: JungleFlipEngineTier = {
  id: JUNGLE_FLIP_DEFAULT_ENGINE_ID,
  name: 'MistyJungleFlip',
  version: JUNGLE_FLIP_ENGINE_VERSION,
  nodes: 512_000,
  movetimeCapMs: 5000,
};

export const JUNGLE_FLIP_PLAYABLE_ENGINES: readonly JungleFlipEngineTier[] = [MISTY_JUNGLE_FLIP];

const JUNGLE_FLIP_ENGINE_BY_ID: ReadonlyMap<string, JungleFlipEngineTier> = new Map<
  string,
  JungleFlipEngineTier
>([[MISTY_JUNGLE_FLIP.id, MISTY_JUNGLE_FLIP]]);

const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_QUEUE_TIMEOUT_MS = 5_000;

let activeProcesses = 0;
const queue: Array<{
  reject(err: Error): void;
  resolve(): void;
  timer: ReturnType<typeof setTimeout>;
}> = [];

// Resolve the MistyJungleFlip binary: explicit env override, else the dev build
// location, else the prod (railpack-compiled) / system locations.
export function jungleFlipEnginePath(): string {
  const explicit = process.env.MISTBOARD_JUNGLE_FLIP_ENGINE_PATH;
  if (explicit) {
    const resolved = resolve(explicit);
    if (!existsSync(resolved)) {
      throw new Error(
        `MISTBOARD_JUNGLE_FLIP_ENGINE_PATH points at ${resolved} but the binary does not exist`,
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
      'jungle-flip-engine',
      'target',
      'release',
      'jungle-flip-engine',
    );
    if (existsSync(dev)) return dev;
  }
  for (const candidate of [
    resolve(process.cwd(), 'bin', 'jungle-flip-engine'),
    '/app/bin/jungle-flip-engine',
    '/usr/local/bin/jungle-flip-engine',
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    'MistyJungleFlip (jungle-flip) binary not found. Set MISTBOARD_JUNGLE_FLIP_ENGINE_PATH.',
  );
}

export function jungleFlipEngineTierFor(engineId: string | undefined): JungleFlipEngineTier | null {
  if (!engineId) return null;
  return JUNGLE_FLIP_ENGINE_BY_ID.get(engineId) ?? null;
}

export function jungleFlipEngineDisplayName(engineId: string): string {
  return jungleFlipEngineTierFor(engineId)?.name ?? engineId;
}

export function isJungleFlipEngineClientId(clientId: string | undefined): boolean {
  return jungleFlipEngineTierFor(clientId) !== null;
}

// Engine BUILD version recorded per PvE game (subject_id is version-less). Bump
// JUNGLE_FLIP_ENGINE_VERSION on each shipped eval/search change.
export function jungleFlipEngineVersion(clientId: string | undefined): string | null {
  return isJungleFlipEngineClientId(clientId) ? JUNGLE_FLIP_ENGINE_VERSION : null;
}

export type JungleFlipEngineOptions = {
  nodes?: number;
  movetimeCapMs?: number;
};

/**
 * Ask MistyJungleFlip for a move given a redacted FEN (see jungle-flip-fen.ts). Returns
 * the engine's bestmove in engine UCI (rank 0..3, e.g. "a0b0", flip "a0a0") or null.
 * FEN is server-built/trusted.
 */
export async function jungleFlipLiveEngineMove(
  engineId: string,
  fen: string,
  opts: JungleFlipEngineOptions = {},
): Promise<string | null> {
  const tier = jungleFlipEngineTierFor(engineId);
  if (!tier) throw new Error(`unknown Flip Jungle engine: ${engineId}`);
  const release = await acquireSlot();
  try {
    return await jungleFlipEngineMove(fen, {
      nodes: opts.nodes ?? tier.nodes,
      movetimeCapMs: opts.movetimeCapMs ?? tier.movetimeCapMs,
    });
  } finally {
    release();
  }
}

export function jungleFlipEngineMove(
  fen: string,
  opts: JungleFlipEngineOptions = {},
): Promise<string | null> {
  const bin = jungleFlipEnginePath();
  const nodes = opts.nodes ?? 512_000;
  const movetimeCapMs = opts.movetimeCapMs ?? 2500;

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
      () => finish(() => reject(new Error('jungle-flip-engine move timed out'))),
      movetimeCapMs + 4000,
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

    // Node budget = CPU-independent strength; movetime cap bounds latency (halt at
    // whichever first). No trailing moves: the binary carries the clock in the FEN.
    const commands = [
      'uci',
      'ucinewgame',
      'isready',
      `position fen ${fen}`,
      `go nodes ${nodes} movetime ${movetimeCapMs}`,
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
      reject(new Error('jungle-flip-engine concurrency queue timed out'));
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
  return boundedEnvInt('MISTBOARD_JUNGLE_FLIP_MAX_PROCESSES', DEFAULT_MAX_CONCURRENT, 1, 8);
}

function queueTimeoutMs(): number {
  return boundedEnvInt(
    'MISTBOARD_JUNGLE_FLIP_QUEUE_TIMEOUT_MS',
    DEFAULT_QUEUE_TIMEOUT_MS,
    100,
    30_000,
  );
}

function boundedEnvInt(name: string, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
