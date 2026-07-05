// Persistence for the whole-game computer-analysis cache (schema in migration
// 079). A finished game's eval series is immutable given (room, engine, depth),
// so the route computes it once and stores it here; every later request is a
// single row read. Both reads and writes no-op (return null / do nothing) when
// persistence is disabled, so the request path still works in memory-only mode.

import { getPool, isInitialized } from './persistence-db.js';

// The stored/served eval per ply cursor: position AFTER `ply` plies, cp from
// Red's POV. Structurally identical to game/analysis PlyEval so either is
// assignable; kept local to keep this module free of game-logic imports.
export type StoredPlyEval = {
  ply: number;
  cp: number | null;
  mate: number | null;
  best: string | null;
};

export async function getGameAnalysis(
  roomId: string,
  engineId: string,
  depth: number,
): Promise<StoredPlyEval[] | null> {
  if (!isInitialized()) return null;
  const { rows } = await getPool().query<{ plies: StoredPlyEval[] }>(
    `SELECT plies FROM game_analysis WHERE room_id = $1 AND engine_id = $2 AND depth = $3`,
    [roomId, engineId, depth],
  );
  // node-pg parses JSONB columns, so `plies` is already the array.
  return rows[0]?.plies ?? null;
}

// Idempotent: the first writer for a (room, engine, depth) wins; a concurrent or
// repeat save is a no-op (the result is deterministic, so there's nothing to
// overwrite).
export async function saveGameAnalysis(
  roomId: string,
  engineId: string,
  depth: number,
  plies: StoredPlyEval[],
): Promise<void> {
  if (!isInitialized()) return;
  await getPool().query(
    `INSERT INTO game_analysis (room_id, engine_id, depth, plies)
       VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (room_id, engine_id, depth) DO NOTHING`,
    [roomId, engineId, depth, JSON.stringify(plies)],
  );
}
