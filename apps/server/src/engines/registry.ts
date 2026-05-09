import type pg from 'pg';
import { BUILTIN_ENGINES } from './builtin/index.js';
import type { EngineDefinition } from './types.js';

type Queryable = Pick<pg.Client | pg.Pool | pg.PoolClient, 'query'>;

export type { EngineDefinition, EngineMoveContext, EngineMoveDecision, EngineMoveScore } from './types.js';

export function defaultEngineId(): string {
  return 'builtin-random-legal';
}

export function builtinEngineIds(): string[] {
  return Object.keys(BUILTIN_ENGINES);
}

const PYTHON_ENGINES: Record<string, EngineDefinition> = {
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
    notes: 'Owner-only Python Tier-1 v0.7.22 engine with profiled particle updates and terminal king-risk veto.',
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

export async function upsertBuiltinEngineVersions(db: Queryable, engineIds: string[]): Promise<void> {
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
          runtime: engine.config.kind === 'python-subprocess'
            ? 'python-subprocess'
            : 'in-process-typescript',
        },
        engine.notes ?? 'Built-in TypeScript worker engine for EvE data collection MVP.',
      ],
    );
  }
}
