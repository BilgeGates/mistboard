// Pikafish-jieqi move provider for Jieqi (揭棋) PvE.
//
// The engine is the Pikafish `jieqi` / `jieqi_old` branch (our "PikaJieQi" binary)
// driven as a UCI subprocess — the same Tier-B pattern as Crossroads/Fairy-Stockfish,
// NOT the redaction-shaped Obscuro engine-worker (the fog engine). Unlike crossroads
// (perfect information, replayed from `position startpos moves ...`), jieqi has hidden
// identities that the engine must NOT learn, so we hand it a redacted CURRENT-position
// FEN built by jieqi-fen.ts. One process per request (stateless, robust); promote to a
// persistent pool only under real load.
//
// LAUNCH config is the no-net `jieqi_old` classical-eval build (handcrafted eval, no
// NNUE weights — clean GPL-3 with no net-licensing problem). The strength track swaps in
// the NNUE `jieqi` branch + our own-trained net via MISTBOARD_PIKAFISH_NET (EvalFile).

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runUciBestmove, UciEnginePool } from './uci-engine-harness.js';

export const JIEQI_DEFAULT_ENGINE_ID = 'pikafish-jieqi-strong';
// Engine BUILD version recorded per PvE game (subject_id encodes only the tier). The shipped
// engine is the no-net classical Pikafish jieqi_old build; bump on any engine/config change.
export const JIEQI_ENGINE_VERSION = '0.1.0';

export type JieqiEngineTier = {
  id: string;
  name: string;
  movetimeMs: number;
  // Optional hard search-depth cap. jieqi_old has NO Skill Level / UCI_Elo knob
  // (verified: absent from its UCI options), so depth is the only real strength
  // limiter — a shallow classical search is genuinely beatable. The top tier omits
  // it (full strength, time-bounded). Depths are starting points; calibrate vs play.
  depth?: number;
};

const JIEQI_ENGINE_TIERS = [
  {
    id: 'pikafish-jieqi-amateur',
    name: 'PikaJieQi - Amateur',
    depth: 4,
    movetimeMs: 800,
  },
  {
    id: JIEQI_DEFAULT_ENGINE_ID,
    name: 'PikaJieQi - Strong',
    depth: 10,
    movetimeMs: 1200,
  },
  {
    id: 'pikafish-jieqi-strongest',
    name: 'PikaJieQi - Strongest',
    movetimeMs: 2500,
  },
] as const satisfies readonly JieqiEngineTier[];

export const JIEQI_PLAYABLE_ENGINES: readonly JieqiEngineTier[] = JIEQI_ENGINE_TIERS;

const JIEQI_ENGINE_BY_ID: ReadonlyMap<string, JieqiEngineTier> = new Map(
  JIEQI_ENGINE_TIERS.map((engine) => [engine.id, engine]),
);

// Small per-process slot pool (Tier-B UCI subprocess; shared harness).
const enginePool = new UciEnginePool({
  name: 'pikajieqi',
  maxProcessesEnvVar: 'MISTBOARD_PIKAFISH_MAX_PROCESSES',
  queueTimeoutEnvVar: 'MISTBOARD_PIKAFISH_QUEUE_TIMEOUT_MS',
  queueTimeoutMessage: 'pikafish-jieqi concurrency queue timed out',
});

// Resolve the PikaJieQi binary: explicit env override, else the known dev location,
// else the prod (railpack-compiled) / system locations.
export function pikaJieqiPath(): string {
  const explicit = process.env.MISTBOARD_PIKAFISH_PATH;
  if (explicit) {
    const resolved = resolve(explicit);
    if (!existsSync(resolved)) {
      throw new Error(
        `MISTBOARD_PIKAFISH_PATH points at ${resolved} but the binary does not exist`,
      );
    }
    return resolved;
  }
  const home = process.env.HOME;
  if (home) {
    const dev = resolve(home, 'projects', 'tools', 'pikafish-jieqi-old', 'src', 'PikaJieQi');
    if (existsSync(dev)) return dev;
  }
  for (const candidate of [
    resolve(process.cwd(), 'bin', 'pikafish-jieqi'),
    '/app/bin/pikafish-jieqi',
    '/usr/local/bin/pikafish-jieqi',
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('PikaJieQi (jieqi) binary not found. Set MISTBOARD_PIKAFISH_PATH.');
}

// The classical jieqi_old build needs no net. When serving the NNUE `jieqi` branch,
// point MISTBOARD_PIKAFISH_NET at an ABSOLUTE path to our trained .nnue (the engine
// rejects a relative EvalFile).
function netOption(): string[] {
  const net = process.env.MISTBOARD_PIKAFISH_NET;
  if (!net) return [];
  const resolved = resolve(net);
  if (!existsSync(resolved)) {
    throw new Error(`MISTBOARD_PIKAFISH_NET points at ${resolved} but the file does not exist`);
  }
  return [`setoption name EvalFile value ${resolved}`];
}

export function jieqiEngineTierFor(engineId: string | undefined): JieqiEngineTier | null {
  if (!engineId) return null;
  return JIEQI_ENGINE_BY_ID.get(engineId) ?? null;
}

export function jieqiEngineDisplayName(engineId: string): string {
  return jieqiEngineTierFor(engineId)?.name ?? engineId;
}

export function isJieqiEngineClientId(clientId: string | undefined): boolean {
  return jieqiEngineTierFor(clientId) !== null;
}

export function jieqiEngineVersion(clientId: string | undefined): string | null {
  return isJieqiEngineClientId(clientId) ? JIEQI_ENGINE_VERSION : null;
}

// `moves`: the quiet plies since the last irreversible move (capture OR reveal), with `fen`
// being the position at that point. Pikafish replays them to build its position stack, which
// activates is_repeated() (gated on pliesFromNull>=4) so it honors xiangqi repetition /
// perpetual-check / perpetual-chase rules instead of being blind to threefold. Omit for the
// prior FEN-only behavior. Safe under redaction: a window has no reveal, so the window-start
// FEN's dark tiles stay dark and the replayed moves are all of already-revealed pieces.
export type JieqiEngineOptions = { movetimeMs?: number; depth?: number; moves?: string[] };

/**
 * Ask PikaJieQi for a move given a redacted FEN (see jieqi-fen.ts) and an optional
 * repetition window (`opts.moves`; see JieqiEngineOptions). Returns the engine's bestmove in
 * Pikafish UCI (rank 0..9, e.g. "e7a7") or null. The FEN is server-built and trusted.
 */
export async function jieqiLiveEngineMove(
  engineId: string,
  fen: string,
  opts: { movetimeMs?: number; moves?: string[] } = {},
): Promise<string | null> {
  const tier = jieqiEngineTierFor(engineId);
  if (!tier) throw new Error(`unknown Jieqi engine: ${engineId}`);
  const release = await enginePool.acquire();
  try {
    return await jieqiEngineMove(fen, {
      depth: tier.depth,
      movetimeMs: opts.movetimeMs ?? tier.movetimeMs,
      moves: opts.moves,
    });
  } finally {
    release();
  }
}

export function jieqiEngineMove(
  fen: string,
  opts: JieqiEngineOptions = {},
): Promise<string | null> {
  const movetimeMs = opts.movetimeMs ?? 500;
  const depth = opts.depth !== undefined ? Math.max(1, Math.floor(opts.depth)) : null;
  const position =
    opts.moves && opts.moves.length > 0
      ? `position fen ${fen} moves ${opts.moves.join(' ')}`
      : `position fen ${fen}`;
  const commands = [
    'uci',
    ...netOption(),
    'ucinewgame',
    'isready',
    position,
    // depth cap (if any) stops the search early for weaker tiers; movetime bounds
    // latency on the deep tiers. `go depth N movetime T` halts at whichever hits first.
    depth === null ? `go movetime ${movetimeMs}` : `go depth ${depth} movetime ${movetimeMs}`,
  ];
  return runUciBestmove({
    bin: pikaJieqiPath(),
    commands,
    timeoutMs: movetimeMs + 4000,
    timeoutMessage: 'pikafish-jieqi move timed out',
  });
}
