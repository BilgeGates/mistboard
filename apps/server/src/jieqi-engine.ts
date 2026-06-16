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

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const JIEQI_DEFAULT_ENGINE_ID = 'pikafish-jieqi-strong';

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

const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_QUEUE_TIMEOUT_MS = 5_000;

let activeProcesses = 0;
const queue: Array<{
  reject(err: Error): void;
  resolve(): void;
  timer: ReturnType<typeof setTimeout>;
}> = [];

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

export type JieqiEngineOptions = { movetimeMs?: number; depth?: number };

/**
 * Ask PikaJieQi for a move given a redacted current-position FEN (see jieqi-fen.ts).
 * Returns the engine's bestmove in Pikafish UCI (rank 0..9, e.g. "e7a7") or null if
 * there is no move. The FEN is server-built and trusted; it is written to stdin.
 */
export async function jieqiLiveEngineMove(
  engineId: string,
  fen: string,
  opts: { movetimeMs?: number } = {},
): Promise<string | null> {
  const tier = jieqiEngineTierFor(engineId);
  if (!tier) throw new Error(`unknown Jieqi engine: ${engineId}`);
  const release = await acquireSlot();
  try {
    return await jieqiEngineMove(fen, {
      depth: tier.depth,
      movetimeMs: opts.movetimeMs ?? tier.movetimeMs,
    });
  } finally {
    release();
  }
}

export function jieqiEngineMove(
  fen: string,
  opts: JieqiEngineOptions = {},
): Promise<string | null> {
  const bin = pikaJieqiPath();
  const movetimeMs = opts.movetimeMs ?? 500;
  const depth = opts.depth !== undefined ? Math.max(1, Math.floor(opts.depth)) : null;

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
      () => finish(() => reject(new Error('pikafish-jieqi move timed out'))),
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
      ...netOption(),
      'ucinewgame',
      'isready',
      `position fen ${fen}`,
      // depth cap (if any) stops the search early for weaker tiers; movetime bounds
      // latency on the deep tiers. `go depth N movetime T` halts at whichever hits first.
      depth === null ? `go movetime ${movetimeMs}` : `go depth ${depth} movetime ${movetimeMs}`,
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
      reject(new Error('pikafish-jieqi concurrency queue timed out'));
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
  return boundedEnvInt('MISTBOARD_PIKAFISH_MAX_PROCESSES', DEFAULT_MAX_CONCURRENT, 1, 8);
}

function queueTimeoutMs(): number {
  return boundedEnvInt(
    'MISTBOARD_PIKAFISH_QUEUE_TIMEOUT_MS',
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
