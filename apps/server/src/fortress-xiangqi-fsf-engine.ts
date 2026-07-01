// Fairy-Stockfish move provider for Fortress Xiangqi (7x8, "xiangqi with a
// pocket").
//
// Fortress is perfect-information (opposite-corner-palace xiangqi + the Treasure
// + crazyhouse drops + the chasing rule). FSF plays it natively from a custom
// variants.ini (fortress-xiangqi.ini) that inherits the built-in `minixiangqi`
// and layers on the 8th rank, corner palaces, the elephant/advisor/Treasure
// pieces, both-side drops, and chasingRule=axf. The config is validated against
// the game kernel byte-for-byte on the legal-move set by
// scripts/variant-lab/fortress-xiangqi-fsf-play.ts (0 mismatches over 10k+
// positions).
//
// Mirrors the Drop Mini Xiangqi provider (per-request FSF process, node+skill
// tiers, custom variant via VariantPath). Engine ids follow the Fairy-Stockfish
// naming (fairy-stockfish-fortress-xiangqi-*); public bot identities live in
// bot_profiles, separate from the executable engine id.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fairyStockfishPath } from './crossroads-chess-engine.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const VARIANT = 'fortressxiangqi';

export const FORTRESS_XIANGQI_DEFAULT_ENGINE_ID = 'fairy-stockfish-fortress-xiangqi-strong';
// Engine BUILD version recorded per PvE game. Bump on any engine/config change
// (including edits to fortress-xiangqi.ini).
export const FORTRESS_XIANGQI_ENGINE_VERSION = '0.1.0';

export type FortressXiangqiEngineTier = {
  id: string;
  name: string;
  skill: number;
  nodes: number;
  movetimeMs: number;
};

// Tiers mirror Drop Mini Xiangqi: Skill Level weakens CPU-independently, a node
// budget pins top-tier strength reproducibly across the slow prod vCPU, and a
// movetime cap guards wall-clock. The 7x8 board is small; budgets are cheap.
const FORTRESS_XIANGQI_ENGINE_TIERS = [
  {
    id: 'fairy-stockfish-fortress-xiangqi-amateur',
    name: 'Fairy Stockfish - Amateur',
    skill: 1,
    nodes: 6_000,
    movetimeMs: 300,
  },
  {
    id: FORTRESS_XIANGQI_DEFAULT_ENGINE_ID,
    name: 'Fairy Stockfish - Strong',
    skill: 8,
    nodes: 60_000,
    movetimeMs: 800,
  },
  {
    id: 'fairy-stockfish-fortress-xiangqi-very-strong',
    name: 'Fairy Stockfish - Strongest',
    skill: 20,
    nodes: 800_000,
    movetimeMs: 2_000,
  },
] as const satisfies readonly FortressXiangqiEngineTier[];

export const FORTRESS_XIANGQI_PLAYABLE_ENGINES: readonly FortressXiangqiEngineTier[] =
  FORTRESS_XIANGQI_ENGINE_TIERS;

const FORTRESS_XIANGQI_ENGINE_BY_ID: ReadonlyMap<string, FortressXiangqiEngineTier> = new Map(
  FORTRESS_XIANGQI_ENGINE_TIERS.map((engine) => [engine.id, engine]),
);

export function fortressXiangqiEngineTierFor(
  engineId: string | undefined,
): FortressXiangqiEngineTier | null {
  if (!engineId) return null;
  return FORTRESS_XIANGQI_ENGINE_BY_ID.get(engineId) ?? null;
}

export function fortressXiangqiEngineDisplayName(engineId: string): string {
  return fortressXiangqiEngineTierFor(engineId)?.name ?? engineId;
}

export function isFortressXiangqiEngineClientId(clientId: string | undefined): boolean {
  return fortressXiangqiEngineTierFor(clientId) !== null;
}

export function fortressXiangqiEngineVersion(clientId: string | undefined): string | null {
  return isFortressXiangqiEngineClientId(clientId) ? FORTRESS_XIANGQI_ENGINE_VERSION : null;
}

// fortress-xiangqi.ini lives in src/; tsc does not copy it to dist/, so look in
// both the tsx-dev (src) and built (dist -> ../src) locations.
export function fortressXiangqiVariantIniPath(): string {
  const candidates = [
    resolve(HERE, 'fortress-xiangqi.ini'),
    resolve(HERE, '..', 'src', 'fortress-xiangqi.ini'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`fortress-xiangqi.ini not found (looked in ${candidates.join(', ')})`);
}

export type FortressXiangqiEngineRequestOptions = {
  movetimeMs?: number;
  skill?: number;
  nodes?: number;
};

/**
 * Resolve the engine tier, take a concurrency slot, and ask FSF for a move given
 * the UCI move history from the start position. Returns the UCI move (board move
 * "b1b3" or drop "Q@d4") or null when there is no move.
 */
export async function fortressXiangqiLiveEngineMove(
  engineId: string,
  moves: string[],
  opts: { movetimeMs?: number } = {},
): Promise<string | null> {
  const tier = fortressXiangqiEngineTierFor(engineId);
  if (!tier) throw new Error(`unknown Fortress Xiangqi engine: ${engineId}`);
  const release = await acquireFsfSlot();
  try {
    return await fortressXiangqiEngineMove(moves, {
      skill: tier.skill,
      nodes: tier.nodes,
      movetimeMs: opts.movetimeMs ?? tier.movetimeMs,
    });
  } finally {
    release();
  }
}

export function fortressXiangqiEngineMove(
  moves: string[],
  opts: FortressXiangqiEngineRequestOptions = {},
): Promise<string | null> {
  const fsf = fairyStockfishPath();
  const ini = fortressXiangqiVariantIniPath();
  const movetimeMs = opts.movetimeMs ?? 800;
  const skill = opts.skill === undefined ? null : Math.max(0, Math.min(20, Math.floor(opts.skill)));
  const nodes = opts.nodes === undefined ? null : Math.max(1, Math.floor(opts.nodes));

  return new Promise<string | null>((resolveMove, reject) => {
    const child = spawn(fsf, [], { stdio: ['pipe', 'pipe', 'pipe'] });
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
      () => finish(() => reject(new Error('fsf move timed out'))),
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

    const position =
      moves.length > 0 ? `position startpos moves ${moves.join(' ')}` : 'position startpos';
    const goLimits = [...(nodes === null ? [] : [`nodes ${nodes}`]), `movetime ${movetimeMs}`].join(
      ' ',
    );
    const commands = [
      'uci',
      `setoption name VariantPath value ${ini}`,
      `setoption name UCI_Variant value ${VARIANT}`,
      ...(skill === null ? [] : [`setoption name Skill Level value ${skill}`]),
      'ucinewgame',
      'isready',
      position,
      `go ${goLimits}`,
    ];
    child.stdin.write(`${commands.join('\n')}\n`);
  });
}

// Small FSF slot pool, separate from the other variants. Promote to a shared
// pool only under real concurrent load.
const DEFAULT_MAX_CONCURRENT_FSF = 2;
const DEFAULT_FSF_QUEUE_TIMEOUT_MS = 5_000;
let activeFsfProcesses = 0;
const fsfQueue: Array<{
  reject(err: Error): void;
  resolve(release: () => void): void;
  timer: ReturnType<typeof setTimeout>;
}> = [];

function maxConcurrentFsfProcesses(): number {
  const raw = Number.parseInt(process.env.MISTBOARD_FORTRESS_XIANGQI_FSF_MAX_PROCESSES ?? '', 10);
  // Clamp 1–8: an unbounded override would let a misconfig fan out arbitrarily
  // many FSF subprocesses on the shared web vCPU.
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 8) : DEFAULT_MAX_CONCURRENT_FSF;
}

function fsfQueueTimeoutMs(): number {
  const raw = Number.parseInt(
    process.env.MISTBOARD_FORTRESS_XIANGQI_FSF_QUEUE_TIMEOUT_MS ?? '',
    10,
  );
  return Number.isFinite(raw) && raw > 0
    ? Math.min(Math.max(raw, 100), 30_000)
    : DEFAULT_FSF_QUEUE_TIMEOUT_MS;
}

function acquireFsfSlot(): Promise<() => void> {
  if (activeFsfProcesses < maxConcurrentFsfProcesses()) {
    activeFsfProcesses += 1;
    return Promise.resolve(releaseFsfSlot);
  }
  return new Promise((resolveSlot, reject) => {
    const timer = setTimeout(() => {
      const idx = fsfQueue.findIndex((entry) => entry.reject === reject);
      if (idx >= 0) fsfQueue.splice(idx, 1);
      reject(new Error('fsf concurrency queue timed out'));
    }, fsfQueueTimeoutMs());
    timer.unref();
    fsfQueue.push({ reject, resolve: resolveSlot, timer });
  });
}

function releaseFsfSlot(): void {
  activeFsfProcesses = Math.max(0, activeFsfProcesses - 1);
  const next = fsfQueue.shift();
  if (next) {
    clearTimeout(next.timer);
    activeFsfProcesses += 1;
    next.resolve(releaseFsfSlot);
  }
}
