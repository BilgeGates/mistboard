import type pg from 'pg';
import { BUILTIN_ENGINES } from './builtin/index.js';
import type { EngineDefinition } from './types.js';

type Queryable = Pick<pg.Client | pg.Pool | pg.PoolClient, 'query'>;

export type {
  EngineDefinition,
  EngineMoveContext,
  EngineMoveDecision,
  EngineMoveScore,
} from './types.js';

export function defaultEngineId(): string {
  return 'builtin-random-legal';
}

export function builtinEngineIds(): string[] {
  return Object.keys(BUILTIN_ENGINES);
}

export function playableBuiltinEngines(): EngineDefinition[] {
  return builtinEngineIds()
    .map((engineId) => loadEngine(engineId))
    .filter((engine) => engine.kind === 'builtin' && engine.chooseMove);
}

// Streamlined release (2026-06-02): only Misty (versioned v2) is player-facing.
// Legacy (v0.9.5) and Random stay in the registry for EvE/testing/historical
// records, but are NOT offered in the live PvE picker. No random fallback in the
// PvE serving path — if Misty can't serve it fails loudly (503), by design.
const PROD_PLAYABLE_ENGINE_IDS = new Set([
  'python-v2-v1.0', // Misty 1.0 (frozen GT-CFR v2, gadget-off + early-stop)
]);

// Opt-in extras for load testing / local experimentation. Set
// MISTBOARD_EXTRA_PLAYABLE_ENGINES=python-random-legal,foo to enable.
// Default empty → prod behavior is unchanged.
function extraPlayableEngineIds(): Set<string> {
  const raw = process.env.MISTBOARD_EXTRA_PLAYABLE_ENGINES;
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function playableLiveEngines(): EngineDefinition[] {
  const extras = extraPlayableEngineIds();
  return Object.values(KNOWN_ENGINES).filter(
    (engine) => PROD_PLAYABLE_ENGINE_IDS.has(engine.id) || extras.has(engine.id),
  );
}

export function isPlayableLiveEngineClientId(clientId: string | undefined): boolean {
  if (!clientId) return false;
  const engineId = clientId === 'random-engine' ? defaultEngineId() : clientId;
  return playableLiveEngines().some((engine) => engine.id === engineId);
}

// Broad "is this seat an engine (not a human)?" check — true for ANY engine in
// the registry, playable or not. Use this to IDENTIFY an engine seat in an
// existing game (hydration, recovery, historical records), as opposed to
// isPlayableLiveEngineClientId, which gates what the live picker may OFFER. The
// two predicates diverged when the picker was streamlined to a single engine
// (2026-06-02): legacy/random games still exist and must be recognized, even
// though those engines are no longer offered.
export function isKnownEngineClientId(clientId: string | undefined): boolean {
  if (!clientId) return false;
  const engineId = clientId === 'random-engine' ? defaultEngineId() : clientId;
  return engineId in KNOWN_ENGINES;
}

// True iff `clientId` is a registered engine that plays Dark Mini Xiangqi. Used
// to (a) validate a PvE create request's engineId and (b) identify the engine
// seat in a DMX room (its seat holds this id, set by a seat-assigned event).
export function isDarkMiniXiangqiEngineClientId(clientId: string | undefined): boolean {
  if (!clientId) return false;
  return KNOWN_ENGINES[clientId]?.gameSpecId === 'dark-mini-xiangqi';
}

// The default Dark Mini Xiangqi PvE engine (the single player-facing DMX engine,
// mirroring Misty for chess).
export const DARK_MINI_XIANGQI_DEFAULT_ENGINE_ID = 'python-dmx-v1.0';

const PYTHON_ENGINES: Record<string, EngineDefinition> = {
  'python-tier1-v0.9.5': {
    id: 'python-tier1-v0.9.5',
    engineId: 'tier1',
    engineName: 'Misty Legacy',
    name: 'Misty Legacy',
    kind: 'container',
    configHash: 'tier1-v0.9.5-372b4bb6c064',
    playSignature: '372b4bb6c064',
    config: {
      kind: 'python-subprocess',
      strategy: 'tier1',
      version: '0.9.5',
      config: 'tier1-v1',
      config_hash: '372b4bb6c064',
      engine_pin: 'v0.9.5-tactical-patches@372b4bb6c064',
    },
    livePolicy: { timeoutMs: 5_000 },
    notes:
      'Misty Legacy (v0.9.5 tactical-patches): the pre-GT-CFR first-party engine, '
      + 'kept in-registry (EvE/records) but hidden from the live picker. '
      + 'Draw-reduction knobs, '
      + 'phantom-check guard, recapture exemption.',
  },
  // Uses current src/fow_chess/. Skipped by PROD_PLAYABLE_ENGINE_IDS — only
  // available locally via the MISTBOARD_EXTRA_PLAYABLE_ENGINES env var.
  // Intended for asymmetric strength testing against a moving target codebase.
  'python-tier1-current': {
    id: 'python-tier1-current',
    engineId: 'tier1',
    engineName: 'Mistboard Engine',
    name: 'Mistboard Engine dev build',
    kind: 'container',
    configHash: 'tier1-current',
    playSignature: 'current',
    config: {
      kind: 'python-subprocess',
      strategy: 'tier1',
      version: 'current',
      config: 'tier1-v1',
      config_hash: 'current',
    },
    livePolicy: { timeoutMs: 5_000 },
    notes: 'Current first-party engine source checkout. Local-only; for strength testing.',
  },
  // GT-CFR v2 engine (EngineV2 / Obscuro architecture), current source. The
  // worker constructs EngineV2Strategy for this id (use_rust_eq, |I|=16). Local-
  // only: enable via MISTBOARD_EXTRA_PLAYABLE_ENGINES=python-v2-current. Generous
  // timeout because the worker replays the transcript per move (stateless), so
  // v2's belief enumeration re-runs each move and late-game moves are slow.
  'python-v2-current': {
    id: 'python-v2-current',
    engineId: 'v2',
    engineName: 'Mistboard Engine',
    name: 'Mistboard Engine v2 (GT-CFR dev)',
    kind: 'container',
    configHash: 'v2-current',
    playSignature: 'v2-current',
    config: {
      kind: 'python-subprocess',
      strategy: 'v2',
      version: 'current',
      config: 'v2-current',
      config_hash: 'current',
    },
    livePolicy: { timeoutMs: 120_000 },
    notes: 'GT-CFR v2 engine (use_rust_eq, |I|=16). Local-only; slow late-game (stateless replay).',
  },
  // Misty 1.0 — the FROZEN, shipped GT-CFR v2 engine (first production release of
  // the v2 line; the single player-facing engine). Pinned to mistboard-engine @
  // a06f9a1. (Internal ids below keep the original "misty-max" pin/hash so
  // already-recorded games resolve.) Config (validated
  // 2026-06-02): STRONGEST gadget-OFF + king-aware leaf + clock-aware budget +
  // convergence early-stop + bottom-K(16M), i=32, KLUSS k=2, mixing off. Stateful
  // delta-feed (not stateless replay), so fast — early-stop lands moves in ~1-2s.
  // Bump to python-v2-v1.1 (+ V2_LIVE_ENGINES) on the next engine upgrade.
  'python-v2-v1.0': {
    id: 'python-v2-v1.0',
    engineId: 'v2',
    engineName: 'Misty',
    name: 'Misty 1.0',
    kind: 'container',
    configHash: 'v2-v1.0-a06f9a1',
    playSignature: 'a06f9a1',
    config: {
      kind: 'python-subprocess',
      strategy: 'v2',
      version: '1.0',
      config: 'v2-strongest-gadget-off',
      config_hash: 'a06f9a1',
      engine_pin: 'misty-max-v1.0@a06f9a1',
    },
    livePolicy: { timeoutMs: 30_000 },
    notes:
      'Misty 1.0 — GT-CFR/Obscuro v2: gadget-off + king-aware + clock-aware '
      + 'budget + early-stop + bottom-K. Validated 2026-06-02 (30-0-0 vs Legacy, '
      + '0 hard failures, |P| max 5.9M, ~72s/game).',
  },
  // Dark Mini Xiangqi (7x7) engine. Same EngineV2 core as Misty, parameterized
  // with MiniXiangqiRules; leaf eval is Fairy-Stockfish's built-in minixiangqi
  // variant (falls back to a material stub if the FSF binary is absent). The
  // gameSpecId routes the worker spawn (--game dark-mini-xiangqi) and the
  // EngineTurnRequest geometry (7-wide squares + mini piece letters). Not in the
  // chess PvE picker — the Dark Mini Xiangqi route selects it.
  'python-dmx-v1.0': {
    id: 'python-dmx-v1.0',
    engineId: 'v2',
    engineName: 'Misty',
    name: 'Misty (Dark Mini Xiangqi)',
    kind: 'container',
    gameSpecId: 'dark-mini-xiangqi',
    configHash: 'dmx-v1.0-fsf-leaf',
    playSignature: 'dmx-v1.0',
    config: {
      kind: 'python-subprocess',
      strategy: 'v2-mini',
      version: '1.0',
      config: 'dmx-fsf-leaf',
      config_hash: 'dmx-v1.0-fsf-leaf',
      engine_pin: 'dmx-v1.0',
    },
    livePolicy: { timeoutMs: 30_000 },
    notes:
      'Dark Mini Xiangqi (7x7) — EngineV2(MiniXiangqiRules) + Fairy-Stockfish '
      + 'minixiangqi leaf eval (material-stub fallback). Served via the dedicated '
      + 'python-dmx pool (--game dark-mini-xiangqi).',
  },
  'python-tier1-v0.9.1': {
    id: 'python-tier1-v0.9.1',
    engineId: 'tier1',
    engineName: 'Mistboard Engine',
    name: 'Mistboard Engine preview',
    kind: 'container',
    configHash: 'tier1-v0.9.1-8918f287499f',
    playSignature: '8918f287499f',
    config: {
      kind: 'python-subprocess',
      strategy: 'tier1',
      version: '0.9.1',
      config: 'tier1-v1',
      config_hash: '8918f287499f',
      engine_pin: 'v0.9.1-pawn-shield-diagonal@8918f287499f',
    },
    livePolicy: { timeoutMs: 5_000 },
    notes: 'First-party engine preview with king-defense and belief-piece-save tuning.',
  },
  'python-tier1-v0.8.9': {
    id: 'python-tier1-v0.8.9',
    engineId: 'tier1',
    engineName: 'Mistboard Engine',
    name: 'Mistboard Engine preview',
    kind: 'container',
    configHash: 'tier1-v0.8.9-b22f29dd73f5',
    playSignature: '2c010d792075',
    config: {
      kind: 'python-subprocess',
      strategy: 'tier1',
      version: '0.8.9',
      config: 'tier1-v1',
      config_hash: 'b22f29dd73f5',
      engine_pin: 'v0.8.9-repair-caps@2c010d792075',
    },
    livePolicy: { timeoutMs: 5_000 },
    notes: 'Owner-operated first-party engine preview with repair-source tuning.',
  },
  'python-tier1-v0.7.22': {
    id: 'python-tier1-v0.7.22',
    engineId: 'tier1',
    engineName: 'Mistboard Engine',
    name: 'Mistboard Engine preview',
    kind: 'container',
    configHash: 'tier1-v0.7.22-b22f29dd73f5',
    playSignature: '5d3ddffa74f6',
    config: {
      kind: 'python-subprocess',
      strategy: 'tier1',
      version: '0.7.22',
      config: 'tier1-v1',
      config_hash: 'b22f29dd73f5',
      engine_pin: 'v0.7.22-king-risk@5d3ddffa74f6',
    },
    livePolicy: { timeoutMs: 5_000 },
    notes: 'Owner-operated first-party engine preview with profiled particle updates.',
  },
  'python-tier1-v0.7.0': {
    id: 'python-tier1-v0.7.0',
    engineId: 'tier1',
    engineName: 'Mistboard Engine',
    name: 'Mistboard Engine preview',
    kind: 'container',
    configHash: 'tier1-v0.7.0-b22f29dd73f5',
    playSignature: 'tier1-v0.7.0-b22f29dd73f5',
    config: {
      kind: 'python-subprocess',
      strategy: 'tier1',
      version: '0.7.0',
      config: 'tier1-v1',
      config_hash: 'b22f29dd73f5',
    },
    livePolicy: { timeoutMs: 5_000 },
    notes: 'Owner-operated first-party engine preview executed through the worker adapter.',
  },
  'python-random-legal': {
    id: 'python-random-legal',
    engineId: 'random-legal',
    engineName: 'Random Legal',
    name: 'Random Legal Python v1',
    kind: 'container',
    configHash: 'python-random-legal-v1',
    playSignature: 'python-random-legal-v1',
    config: { kind: 'python-subprocess', strategy: 'random-legal', version: 1 },
    notes: 'Owner-only Python random-legal baseline for subprocess engine smoke tests.',
  },
};

const KNOWN_ENGINES: Record<string, EngineDefinition> = {
  ...BUILTIN_ENGINES,
  ...PYTHON_ENGINES,
};

export function latestBuiltinEngineIds(): { white: string; black: string } {
  return {
    white: 'builtin-capture-seeker',
    black: 'builtin-random-legal',
  };
}

export function loadEngine(engineId: string | null | undefined): EngineDefinition {
  const resolvedId = engineId ?? defaultEngineId();
  const engine = KNOWN_ENGINES[resolvedId];
  if (!engine) throw new Error(`engine ${resolvedId} is not loadable by this worker`);
  return engine;
}

export function engineVersionDisplayName(engineId: string): string {
  return KNOWN_ENGINES[engineId]?.name ?? engineId;
}

export async function upsertBuiltinEngineVersions(
  db: Queryable,
  engineIds: string[],
): Promise<void> {
  for (const engineId of new Set(engineIds)) {
    const engine = loadEngine(engineId);
    await db.query(
      `INSERT INTO engines
         (id, name, visibility, status, notes)
       VALUES ($1, $2, 'builtin', 'active', $3)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         visibility = EXCLUDED.visibility,
         status = EXCLUDED.status,
         notes = EXCLUDED.notes,
         updated_at = now()`,
      [
        engine.engineId,
        engine.engineName,
        'Built-in TypeScript engine family for owner-operated EvE runs.',
      ],
    );
    await db.query(
      `INSERT INTO engine_versions
         (id, engine_id, name, kind, status, config_hash, play_signature,
          engine_version_pin, config, metadata, notes)
       VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         engine_id = EXCLUDED.engine_id,
         name = EXCLUDED.name,
         kind = EXCLUDED.kind,
         status = EXCLUDED.status,
         config_hash = EXCLUDED.config_hash,
         play_signature = EXCLUDED.play_signature,
         engine_version_pin = EXCLUDED.engine_version_pin,
         config = EXCLUDED.config,
         metadata = EXCLUDED.metadata,
         notes = EXCLUDED.notes`,
      [
        engine.id,
        engine.engineId,
        engine.name,
        engine.kind,
        engine.configHash,
        engine.playSignature,
        engine.id,
        engine.config,
        {
          owner: 'admin',
          runtime:
            engine.config.kind === 'python-subprocess'
              ? 'python-subprocess'
              : 'in-process-typescript',
        },
        engine.notes ?? 'Built-in TypeScript worker engine for EvE data collection MVP.',
      ],
    );
  }
}
