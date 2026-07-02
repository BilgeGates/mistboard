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
//
// The process lifecycle (spawn/parse/timeout/kill + the concurrency pool) is the
// shared `uci-engine-harness`; this file is just the Fortress config + tiers.

import {
  fairyStockfishBestmove,
  resolveFsfVariantIniPath,
  UciEnginePool,
} from './uci-engine-harness.js';

const VARIANT = 'fortressxiangqi';
const VARIANT_INI = 'fortress-xiangqi.ini';

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

// Small FSF slot pool, separate from the other variants. Promote to a shared
// pool only under real concurrent load.
const fsfPool = new UciEnginePool({
  maxProcessesEnvVar: 'MISTBOARD_FORTRESS_XIANGQI_FSF_MAX_PROCESSES',
  queueTimeoutEnvVar: 'MISTBOARD_FORTRESS_XIANGQI_FSF_QUEUE_TIMEOUT_MS',
  queueTimeoutMessage: 'fsf concurrency queue timed out',
});

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
  return resolveFsfVariantIniPath(VARIANT_INI);
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
  const release = await fsfPool.acquire();
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
  return fairyStockfishBestmove({
    moves,
    variant: VARIANT,
    iniPath: fortressXiangqiVariantIniPath(),
    skill: opts.skill,
    nodes: opts.nodes,
    movetimeMs: opts.movetimeMs ?? 800,
  });
}
