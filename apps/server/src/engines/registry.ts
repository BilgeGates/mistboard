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

export function latestBuiltinEngineIds(): { white: string; black: string } {
  return {
    white: 'builtin-capture-seeker',
    black: 'builtin-random-legal',
  };
}

export function loadEngine(engineId: string | null | undefined): EngineDefinition {
  const resolvedId = engineId ?? defaultEngineId();
  const engine = BUILTIN_ENGINES[resolvedId];
  if (!engine) throw new Error(`engine ${resolvedId} is not loadable by this worker`);
  return engine;
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
        { owner: 'admin', runtime: 'in-process-typescript' },
        engine.notes ?? 'Built-in TypeScript worker engine for EvE data collection MVP.',
      ],
    );
  }
}
