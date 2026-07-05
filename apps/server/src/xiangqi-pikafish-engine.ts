// Mainline Pikafish move provider for standard (open-information) Xiangqi PvE.
//
// Unlike Jieqi (which needs the `jieqi_old` fork + a redacted FEN) or Fortress
// (a Fairy-Stockfish custom variant), STANDARD xiangqi is exactly what mainline
// Pikafish plays natively — no fork, no variants.ini, no FEN redaction. We drive
// the stock binary as a UCI subprocess (the same Tier-B pattern as Jieqi/FSF),
// replaying the game as `position startpos moves ...` in Pikafish UCI coords.
//
// Coordinate note: our XiangqiSquare is `${file a-i}${rank 1-10}` (red back rank
// = rank 1). Pikafish UCI uses rank 0-9 (red back rank = rank 0), so the only
// translation is a rank-1 shift — see xiangqiMoveToPikafishUci. The process
// lifecycle (spawn/parse/timeout/kill + the concurrency pool) is the shared
// uci-engine-harness; this file is just the Pikafish config, tiers, and coords.
//
// Mainline Pikafish REQUIRES an NNUE net (EvalFile). It defaults to loading
// `pikafish.nnue` from the process CWD, which the server does not provide, so we
// always pass an absolute EvalFile resolved next to the binary (or via
// MISTBOARD_PIKAFISH_XIANGQI_NET). Net licensing: the shipped net is the
// official Pikafish NNUE (see NNUE-License in the pikafish distribution).

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runUciBestmove, UciEnginePool } from './uci-engine-harness.js';

// Xiangqi -> engine UCI now lives in @mistboard/game so the browser FSF-wasm
// analysis engine and this server Pikafish path share one converter. Re-exported
// under the historical names so existing importers are untouched.
export {
  xiangqiMoveToPikafishUci,
  xiangqiSquareToPikafishUci as xiangqiSquareToPikafish,
} from '@mistboard/game';

export const XIANGQI_DEFAULT_ENGINE_ID = 'pikafish-xiangqi-strong';
// Engine BUILD version recorded per PvE game (subject_id encodes only the tier).
// Bump on any engine/net/config change.
export const XIANGQI_ENGINE_VERSION = '0.1.0';

export type XiangqiEngineTier = {
  id: string;
  name: string;
  // Skill Level (0-20) weakens move selection CPU-independently; the NODE budget
  // pins strength reproducibly across the slow prod vCPU; movetimeMs is the
  // latency ceiling handed to the clock-aware allocator (budgetForMove). Starting
  // points — calibrate vs play.
  skill: number;
  nodes: number;
  movetimeMs: number;
};

const XIANGQI_ENGINE_TIERS = [
  {
    id: 'pikafish-xiangqi-amateur',
    name: 'Pikafish - Amateur',
    skill: 3,
    nodes: 20_000,
    movetimeMs: 400,
  },
  {
    id: XIANGQI_DEFAULT_ENGINE_ID,
    name: 'Pikafish - Strong',
    skill: 12,
    nodes: 300_000,
    movetimeMs: 1_500,
  },
  {
    id: 'pikafish-xiangqi-strongest',
    name: 'Pikafish - Strongest',
    skill: 20,
    nodes: 3_000_000,
    movetimeMs: 4_000,
  },
] as const satisfies readonly XiangqiEngineTier[];

export const XIANGQI_PLAYABLE_ENGINES: readonly XiangqiEngineTier[] = XIANGQI_ENGINE_TIERS;

const XIANGQI_ENGINE_BY_ID: ReadonlyMap<string, XiangqiEngineTier> = new Map(
  XIANGQI_ENGINE_TIERS.map((engine) => [engine.id, engine]),
);

// Small per-process slot pool (Tier-B UCI subprocess; shared harness). Reuses the
// same env knobs as the Jieqi Pikafish pool.
const enginePool = new UciEnginePool({
  maxProcessesEnvVar: 'MISTBOARD_PIKAFISH_MAX_PROCESSES',
  queueTimeoutEnvVar: 'MISTBOARD_PIKAFISH_QUEUE_TIMEOUT_MS',
  queueTimeoutMessage: 'pikafish-xiangqi concurrency queue timed out',
});

// Resolve the mainline Pikafish binary: explicit env override, else the known dev
// location, else the prod (railpack-baked) / system locations. Throws rather than
// silently falling back to a first-legal move.
export function pikafishXiangqiPath(): string {
  const explicit = process.env.MISTBOARD_PIKAFISH_XIANGQI_PATH;
  if (explicit) {
    const resolved = resolve(explicit);
    if (!existsSync(resolved)) {
      throw new Error(
        `MISTBOARD_PIKAFISH_XIANGQI_PATH points at ${resolved} but the binary does not exist`,
      );
    }
    return resolved;
  }
  const home = process.env.HOME;
  if (home) {
    const dev = resolve(
      home,
      'projects',
      'tools',
      'pikafish-official-2026-01-02',
      'MacOS',
      'pikafish-apple-silicon',
    );
    if (existsSync(dev)) return dev;
  }
  for (const candidate of [
    resolve(process.cwd(), 'bin', 'pikafish'),
    '/app/bin/pikafish',
    '/usr/local/bin/pikafish',
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    'mainline Pikafish (xiangqi) binary not found. Set MISTBOARD_PIKAFISH_XIANGQI_PATH.',
  );
}

// Resolve the NNUE net (absolute EvalFile). Explicit env override, else
// pikafish.nnue next to the binary (dev keeps it one level up from MacOS/, prod
// bakes it beside the binary), else beside the resolved binary dir.
export function pikafishXiangqiNetPath(binPath: string): string {
  const explicit = process.env.MISTBOARD_PIKAFISH_XIANGQI_NET;
  if (explicit) {
    const resolved = resolve(explicit);
    if (!existsSync(resolved)) {
      throw new Error(
        `MISTBOARD_PIKAFISH_XIANGQI_NET points at ${resolved} but the file does not exist`,
      );
    }
    return resolved;
  }
  const binDir = dirname(binPath);
  for (const candidate of [
    resolve(binDir, 'pikafish.nnue'),
    resolve(binDir, '..', 'pikafish.nnue'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    'Pikafish NNUE net (pikafish.nnue) not found beside the binary. Set MISTBOARD_PIKAFISH_XIANGQI_NET.',
  );
}

export function xiangqiEngineTierFor(engineId: string | undefined): XiangqiEngineTier | null {
  if (!engineId) return null;
  return XIANGQI_ENGINE_BY_ID.get(engineId) ?? null;
}

export function xiangqiEngineDisplayName(engineId: string): string {
  return xiangqiEngineTierFor(engineId)?.name ?? engineId;
}

export function isXiangqiEngineClientId(clientId: string | undefined): boolean {
  return xiangqiEngineTierFor(clientId) !== null;
}

export function xiangqiEngineVersion(clientId: string | undefined): string | null {
  return isXiangqiEngineClientId(clientId) ? XIANGQI_ENGINE_VERSION : null;
}

export type XiangqiEngineOptions = { movetimeMs?: number };

/**
 * Ask mainline Pikafish for a move given the Pikafish-UCI move history since the
 * start position (built by the adapter via xiangqiMoveToPikafishUci). Returns the
 * bestmove in Pikafish UCI (e.g. "b0c2") or null. The history is server-built and
 * trusted.
 */
export async function xiangqiLiveEngineMove(
  engineId: string,
  moves: string[],
  opts: XiangqiEngineOptions = {},
): Promise<string | null> {
  const tier = xiangqiEngineTierFor(engineId);
  if (!tier) throw new Error(`unknown Xiangqi engine: ${engineId}`);
  const release = await enginePool.acquire();
  try {
    return await xiangqiEngineMove(moves, {
      skill: tier.skill,
      nodes: tier.nodes,
      movetimeMs: opts.movetimeMs ?? tier.movetimeMs,
    });
  } finally {
    release();
  }
}

export function xiangqiEngineMove(
  moves: string[],
  opts: { skill: number; nodes: number; movetimeMs: number },
): Promise<string | null> {
  const bin = pikafishXiangqiPath();
  const net = pikafishXiangqiNetPath(bin);
  const skill = Math.max(0, Math.min(20, Math.floor(opts.skill)));
  const nodes = Math.max(1, Math.floor(opts.nodes));
  const movetimeMs = Math.max(1, Math.floor(opts.movetimeMs));
  const position =
    moves.length > 0 ? `position startpos moves ${moves.join(' ')}` : 'position startpos';
  const commands = [
    'uci',
    `setoption name EvalFile value ${net}`,
    `setoption name Skill Level value ${skill}`,
    'ucinewgame',
    'isready',
    position,
    // `go nodes N movetime T` halts at whichever binds first: the node budget is
    // the reproducible strength anchor; the movetime is the latency ceiling.
    `go nodes ${nodes} movetime ${movetimeMs}`,
  ];
  return runUciBestmove({
    bin,
    commands,
    timeoutMs: movetimeMs + 4000,
    timeoutMessage: 'pikafish-xiangqi move timed out',
  });
}
