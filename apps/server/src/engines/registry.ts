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

const PROD_PLAYABLE_ENGINE_IDS = new Set(['builtin-random-legal', 'python-tier1-v0.9.5']);

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

const PYTHON_ENGINES: Record<string, EngineDefinition> = {
  'python-tier1-v0.9.5': {
    id: 'python-tier1-v0.9.5',
    engineId: 'tier1',
    engineName: 'Tier-1',
    name: 'Tier-1 v0.9.5',
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
      'Tier-1 v0.9.5: draw-reduction knobs (info-reveal bonus + push-when-ahead from belief material edge), phantom-check guard (stale-belief skip when slider attack ray is blocked), recapture exemption (exempt recaptures from belief bad-capture-trade veto).',
  },
  // Uses current src/fow_chess/. Skipped by PROD_PLAYABLE_ENGINE_IDS — only
  // available locally via the MISTBOARD_EXTRA_PLAYABLE_ENGINES env var.
  // Intended for asymmetric strength testing against a moving target codebase.
  'python-tier1-current': {
    id: 'python-tier1-current',
    engineId: 'tier1',
    engineName: 'Tier-1',
    name: 'Tier-1 current src',
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
    notes:
      'Tier-1 backed by current src/fow_chess (no engine_version pin). Local-only; for v0.9.5 strength testing.',
  },
  'python-tier1-v0.9.1': {
    id: 'python-tier1-v0.9.1',
    engineId: 'tier1',
    engineName: 'Tier-1',
    name: 'Tier-1 v0.9.1',
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
    notes:
      'Tier-1 v0.9.1: king-defense priority reorder + belief-piece-save landing safety + pawn-shield diagonal tier in early development.',
  },
  'python-tier1-v0.8.9': {
    id: 'python-tier1-v0.8.9',
    engineId: 'tier1',
    engineName: 'Tier-1',
    name: 'Tier-1 v0.8.9',
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
    notes:
      'Owner-only Python Tier-1 v0.8.9 engine with bounded Stage-B supplement and full-recovery repair source selection.',
  },
  'python-tier1-v0.7.22': {
    id: 'python-tier1-v0.7.22',
    engineId: 'tier1',
    engineName: 'Tier-1',
    name: 'Tier-1 v0.7.22',
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
    notes:
      'Owner-only Python Tier-1 v0.7.22 engine with profiled particle updates and terminal king-risk veto.',
  },
  'python-tier1-v0.7.0': {
    id: 'python-tier1-v0.7.0',
    engineId: 'tier1',
    engineName: 'Tier-1',
    name: 'Tier-1 v0.7.0',
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
    notes: 'Owner-only Python Tier-1 v0.7.0 engine executed through the worker subprocess adapter.',
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
