// Centralized live-engine seat accounting (Postgres), correct across an elastic
// fleet of engine-worker replicas — the multi-replica replacement for the
// per-instance in-memory EngineReservationStore. A "seat" is one active engine
// game; the global cap is COUNT(*) per engine_id. See migration 036 and
// engine/assign-and-pin-affinity-scope-2026-06-03.md (private engine repo).
//
// Not yet wired into the live reservation path — that flips behind a flag in a
// later slice, alongside the move work-queue.
import { getPool, withTransaction } from './persistence-db.js';

export type EngineSeatReservation = {
  reserved: boolean;
  activeSeats: number;
  maxSeats: number;
};

/**
 * Reserve a seat for `roomId`, capped globally per engine at `maxSeats`.
 * Atomic across replicas via a per-engine transactional advisory lock, which
 * serializes the count+insert so the cap can never be over-subscribed.
 * Idempotent: re-reserving a room that already holds a seat succeeds without
 * consuming another (covers retries / reconnects).
 */
export async function reserveEngineSeat(
  roomId: string,
  engineId: string,
  color: 'white' | 'black',
  maxSeats: number,
): Promise<EngineSeatReservation> {
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`engine-seat:${engineId}`]);
    const own = await client.query('SELECT 1 FROM live_engine_games WHERE room_id = $1', [roomId]);
    let reserved = (own.rowCount ?? 0) > 0;
    if (!reserved) {
      const { rows } = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM live_engine_games WHERE engine_id = $1',
        [engineId],
      );
      if ((rows[0]?.n ?? 0) < maxSeats) {
        await client.query(
          `INSERT INTO live_engine_games (room_id, engine_id, color)
             VALUES ($1, $2, $3) ON CONFLICT (room_id) DO NOTHING`,
          [roomId, engineId, color],
        );
        reserved = true;
      }
    }
    const { rows } = await client.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM live_engine_games WHERE engine_id = $1',
      [engineId],
    );
    return { reserved, activeSeats: rows[0]?.n ?? 0, maxSeats };
  });
}

export async function releaseEngineSeat(roomId: string): Promise<void> {
  await getPool().query('DELETE FROM live_engine_games WHERE room_id = $1', [roomId]);
}

/** Keepalive so the reaper doesn't release a still-live game's seat. */
export async function heartbeatEngineSeat(roomId: string): Promise<void> {
  await getPool().query('UPDATE live_engine_games SET last_heartbeat = now() WHERE room_id = $1', [
    roomId,
  ]);
}

export async function countActiveEngineSeats(engineId: string): Promise<number> {
  const { rows } = await getPool().query<{ n: number }>(
    'SELECT count(*)::int AS n FROM live_engine_games WHERE engine_id = $1',
    [engineId],
  );
  return rows[0]?.n ?? 0;
}

/** Soft affinity hint: the worker that served this game's last move. */
export async function setEnginePreferredWorker(roomId: string, workerId: string): Promise<void> {
  await getPool().query('UPDATE live_engine_games SET preferred_worker = $2 WHERE room_id = $1', [
    roomId,
    workerId,
  ]);
}

export async function getEnginePreferredWorker(roomId: string): Promise<string | null> {
  const { rows } = await getPool().query<{ preferred_worker: string | null }>(
    'SELECT preferred_worker FROM live_engine_games WHERE room_id = $1',
    [roomId],
  );
  return rows[0]?.preferred_worker ?? null;
}

/**
 * Release seats whose game stopped heartbeating beyond `staleMs` (crash /
 * disconnect without a clean release). Returns the number reclaimed.
 */
export async function reapStaleEngineSeats(staleMs: number): Promise<number> {
  const { rowCount } = await getPool().query(
    `DELETE FROM live_engine_games
      WHERE last_heartbeat < now() - ($1::float8 * interval '1 millisecond')`,
    [staleMs],
  );
  return rowCount ?? 0;
}
