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
  'python-v2-v1.1', // Misty 1.1 (supersedes 1.0 2026-06-16; latest-only picker)
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
      'Misty Legacy: prior first-party engine kept in-registry (EvE/records) ' +
      'but hidden from the live picker.',
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
  // Current v2 development engine. Local-only: enable via
  // MISTBOARD_EXTRA_PLAYABLE_ENGINES=python-v2-current. Uses a generous timeout
  // because this path is for strength testing, not the production picker.
  'python-v2-current': {
    id: 'python-v2-current',
    engineId: 'v2',
    engineName: 'Mistboard Engine',
    name: 'Mistboard Engine v2 dev build',
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
    notes: 'Current v2 development engine. Local-only; for strength testing.',
  },
  // Local-only A/B for the human gadget match (2026-06-14). Both use current
  // src/fow_chess/; the live worker maps the engine-id to an engine_profile
  // (strongest = shipped gadget-off; faithful = Obscuro Resolve, cvar=0). Enable:
  // MISTBOARD_EXTRA_PLAYABLE_ENGINES=python-v2-strongest,python-v2-faithful
  'python-v2-strongest': {
    id: 'python-v2-strongest',
    engineId: 'v2',
    engineName: 'Misty',
    name: 'Misty (Strongest · gadget-off)',
    kind: 'container',
    configHash: 'v2-strongest-local',
    playSignature: 'v2-strongest',
    config: {
      kind: 'python-subprocess',
      strategy: 'v2',
      version: 'current',
      config: 'v2-strongest',
      config_hash: 'current',
    },
    livePolicy: { timeoutMs: 120_000 },
    notes: 'Local-only A/B: shipped STRONGEST profile (gadget-off). Worker maps id->profile.',
  },
  'python-v2-faithful': {
    id: 'python-v2-faithful',
    engineId: 'v2',
    engineName: 'Misty',
    name: 'Misty (Faithful · Resolve)',
    kind: 'container',
    configHash: 'v2-faithful-local',
    playSignature: 'v2-faithful',
    config: {
      kind: 'python-subprocess',
      strategy: 'v2',
      version: 'current',
      config: 'v2-faithful',
      config_hash: 'current',
    },
    livePolicy: { timeoutMs: 120_000 },
    notes: 'Local-only A/B: faithful Obscuro Resolve (cvar=0, gadget-on). Worker maps id->profile.',
  },
  // Local-only A/B for the king-safe human gate (2026-06-15). v1.1-rc2 = shipped
  // v1.0 + ONLY the king-only commit backstop (no gadget); the worker maps this
  // id to engine_profile 'v1.1-rc2'. Enable:
  // MISTBOARD_EXTRA_PLAYABLE_ENGINES=python-v2-v1.0,python-v2-kingsafe
  'python-v2-kingsafe': {
    id: 'python-v2-kingsafe',
    engineId: 'v2',
    engineName: 'Misty',
    name: 'Misty (King-safe · v1.1-rc2)',
    kind: 'container',
    configHash: 'v2-kingsafe-local',
    playSignature: 'v2-kingsafe',
    config: {
      kind: 'python-subprocess',
      strategy: 'v2',
      version: 'current',
      config: 'v2-kingsafe',
      config_hash: 'current',
    },
    livePolicy: { timeoutMs: 120_000 },
    notes: 'Local-only A/B: v1.0 + king-only commit backstop (v1.1-rc2). Worker maps id->profile.',
  },
  // Misty 1.0 is the frozen, player-facing first-party engine. Internal pins
  // stay stable so already-recorded games resolve. Bump to python-v2-v1.1
  // (+ V2_LIVE_ENGINES) on the next engine upgrade.
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
      'Misty 1.0 — frozen first-party engine release for live play. Validated ' +
      '2026-06-02 against the legacy first-party baseline. Superseded by 1.1 ' +
      '2026-06-16; kept in registry so already-recorded 1.0 games resolve.',
  },
  // Misty 1.1 — the player-facing release that SUPERSEDES 1.0 (2026-06-16). The
  // faithful/Resolve arm: the only config 0% on BOTH catastrophe rigs (king-suicide
  // + queen-in-fog hang) at no strength cost vs 1.0 (40-position move-divergence:
  // 85% identical moves, ~0.03 mean EV gap). Worker maps id -> engine_profile v1.1.
  'python-v2-v1.1': {
    id: 'python-v2-v1.1',
    engineId: 'v2',
    engineName: 'Misty',
    name: 'Misty 1.1',
    kind: 'container',
    configHash: 'v2-v1.1-17f55c5',
    playSignature: '17f55c5',
    config: {
      kind: 'python-subprocess',
      strategy: 'v2',
      version: '1.1',
      config: 'v2-faithful-resolve',
      config_hash: '17f55c5',
      engine_pin: 'misty-1.1@17f55c5',
    },
    livePolicy: { timeoutMs: 30_000 },
    notes:
      'Misty 1.1 — faithful/Resolve, catastrophe-complete (king + queen). ' +
      'Shipped 2026-06-16, supersedes 1.0.',
  },
  // Dark Mini Xiangqi engine. Not in the chess PvE picker; the Dark Mini
  // Xiangqi route selects it through the variant-aware worker protocol.
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
    notes: 'Dark Mini Xiangqi engine served through the variant-aware worker adapter.',
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

const CROSSROADS_CHESS_ENGINES: Record<string, EngineDefinition> = {
  'fairy-stockfish-crossroads-amateur': {
    id: 'fairy-stockfish-crossroads-amateur',
    engineId: 'fairy-stockfish-crossroads',
    engineName: 'Fairy Stockfish',
    name: 'Fairy Stockfish - Amateur',
    kind: 'container',
    gameSpecId: 'crossroads-chess',
    configHash: 'fsf-crossroads-amateur',
    playSignature: 'fsf-crossroads-amateur',
    config: { kind: 'fairy-stockfish', skill: 2, movetime_ms: 150 },
    notes: 'Crossroads Chess Fairy-Stockfish tier capped for production-safe amateur play.',
  },
  'fairy-stockfish-crossroads-strong': {
    id: 'fairy-stockfish-crossroads-strong',
    engineId: 'fairy-stockfish-crossroads',
    engineName: 'Fairy Stockfish',
    name: 'Fairy Stockfish - Strong',
    kind: 'container',
    gameSpecId: 'crossroads-chess',
    configHash: 'fsf-crossroads-strong',
    playSignature: 'fsf-crossroads-strong',
    config: { kind: 'fairy-stockfish', skill: 8, movetime_ms: 300 },
    notes:
      'Default Crossroads Chess Fairy-Stockfish tier with lower-skill move selection plus the live immediate-loss guard.',
  },
  'fairy-stockfish-crossroads-very-strong': {
    id: 'fairy-stockfish-crossroads-very-strong',
    engineId: 'fairy-stockfish-crossroads',
    engineName: 'Fairy Stockfish',
    name: 'Fairy Stockfish - Strongest',
    kind: 'container',
    gameSpecId: 'crossroads-chess',
    configHash: 'fsf-crossroads-very-strong',
    playSignature: 'fsf-crossroads-very-strong',
    config: { kind: 'fairy-stockfish', skill: 20, movetime_ms: 2000 },
    notes:
      'Top Crossroads Chess Fairy-Stockfish tier at full skill with a longer think budget plus the live immediate-loss guard.',
  },
};

// Jieqi (揭棋) PvE engines — the Pikafish jieqi branch driven as a UCI subprocess
// (Tier-B, server-jieqi-engine.ts), same shape as crossroads/FSF. LAUNCH uses the
// no-net `jieqi_old` classical build (clean GPL-3, no net-licensing problem); the
// strength track swaps in a self-trained NNUE via MISTBOARD_PIKAFISH_NET. Not added
// to PROD_PLAYABLE_ENGINE_IDS yet — gated until the vertical ships.
const JIEQI_ENGINES: Record<string, EngineDefinition> = {
  'pikafish-jieqi-amateur': {
    id: 'pikafish-jieqi-amateur',
    engineId: 'pikafish-jieqi',
    engineName: 'PikaJieQi',
    name: 'PikaJieQi - Amateur',
    kind: 'container',
    gameSpecId: 'jieqi',
    configHash: 'pikafish-jieqi-amateur',
    playSignature: 'pikafish-jieqi-amateur',
    config: { kind: 'pikafish', skill: 3, movetime_ms: 200 },
    notes: 'Jieqi PikaJieQi (Pikafish jieqi_old, no-net classical eval) amateur tier.',
  },
  'pikafish-jieqi-strong': {
    id: 'pikafish-jieqi-strong',
    engineId: 'pikafish-jieqi',
    engineName: 'PikaJieQi',
    name: 'PikaJieQi - Strong',
    kind: 'container',
    gameSpecId: 'jieqi',
    configHash: 'pikafish-jieqi-strong',
    playSignature: 'pikafish-jieqi-strong',
    config: { kind: 'pikafish', skill: 12, movetime_ms: 500 },
    notes: 'Default Jieqi PikaJieQi tier.',
  },
  'pikafish-jieqi-strongest': {
    id: 'pikafish-jieqi-strongest',
    engineId: 'pikafish-jieqi',
    engineName: 'PikaJieQi',
    name: 'PikaJieQi - Strongest',
    kind: 'container',
    gameSpecId: 'jieqi',
    configHash: 'pikafish-jieqi-strongest',
    playSignature: 'pikafish-jieqi-strongest',
    config: { kind: 'pikafish', skill: 20, movetime_ms: 2500 },
    notes: 'Top Jieqi PikaJieQi tier at full skill with a longer think budget.',
  },
};

// MistyBanqi (our own Rust αβ+TT engine, Tier-B UCI subprocess — banqi-engine.ts).
// Fixed-strength, so tiers vary only movetime (deeper = stronger). ids match
// banqi-engine.ts (the route/scheduler key off those, not this registry).
const BANQI_ENGINES: Record<string, EngineDefinition> = {
  'misty-banqi-amateur': {
    id: 'misty-banqi-amateur',
    engineId: 'misty-banqi',
    engineName: 'MistyBanqi',
    name: 'MistyBanqi - Amateur',
    kind: 'container',
    gameSpecId: 'banqi',
    configHash: 'misty-banqi-amateur',
    playSignature: 'misty-banqi-amateur',
    config: { kind: 'banqi-uci', movetime_ms: 200 },
    notes: 'Banqi MistyBanqi 0.1.0 (standalone Rust αβ+TT UCI engine) amateur tier.',
  },
  'misty-banqi-strong': {
    id: 'misty-banqi-strong',
    engineId: 'misty-banqi',
    engineName: 'MistyBanqi',
    name: 'MistyBanqi - Strong',
    kind: 'container',
    gameSpecId: 'banqi',
    configHash: 'misty-banqi-strong',
    playSignature: 'misty-banqi-strong',
    config: { kind: 'banqi-uci', movetime_ms: 600 },
    notes: 'Default Banqi MistyBanqi tier.',
  },
  'misty-banqi-strongest': {
    id: 'misty-banqi-strongest',
    engineId: 'misty-banqi',
    engineName: 'MistyBanqi',
    name: 'MistyBanqi - Strongest',
    kind: 'container',
    gameSpecId: 'banqi',
    configHash: 'misty-banqi-strongest',
    playSignature: 'misty-banqi-strongest',
    config: { kind: 'banqi-uci', movetime_ms: 1500 },
    notes: 'Top Banqi MistyBanqi tier (longer movetime).',
  },
};

const KNOWN_ENGINES: Record<string, EngineDefinition> = {
  ...BUILTIN_ENGINES,
  ...PYTHON_ENGINES,
  ...CROSSROADS_CHESS_ENGINES,
  ...JIEQI_ENGINES,
  ...BANQI_ENGINES,
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
