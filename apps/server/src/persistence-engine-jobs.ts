// Live-engine move work-queue (Postgres). The public server enqueues a move
// job and awaits its result; engine-worker replicas claim jobs via FOR UPDATE
// SKIP LOCKED, preferring jobs tagged for them (warm belief → delta-feed) but
// taking any queued job otherwise (cold-replay). The transcript travels in the
// job `request`; affinity is a soft hint with a cold-replay fallback, never
// load-bearing. See migration 036 + the affinity scope doc (engine repo).
//
// Not yet wired — the enqueue/await path (server) and the pull loop (worker)
// land behind a flag in later slices.
import { getPool } from './persistence-db.js';

export type MoveJob = {
  id: number;
  roomId: string;
  engineId: string;
  ply: number | null;
  request: unknown;
  preferredWorker: string | null;
  attempts: number;
};

export async function enqueueMoveJob(input: {
  roomId: string;
  engineId: string;
  ply: number | null;
  request: unknown;
  preferredWorker: string | null;
}): Promise<number> {
  const { rows } = await getPool().query<{ id: number }>(
    `INSERT INTO engine_move_jobs (room_id, engine_id, ply, request, preferred_worker)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.roomId, input.engineId, input.ply, input.request, input.preferredWorker],
  );
  return rows[0]!.id;
}

/**
 * Claim the next job for `workerId`, preferring its own warm games
 * (`preferred_worker = workerId` sorts first) then oldest-first. Returns null
 * when the queue is empty. SKIP LOCKED lets every replica's workers claim
 * concurrently without blocking.
 */
export async function claimMoveJob(workerId: string): Promise<MoveJob | null> {
  const { rows } = await getPool().query<{
    id: number;
    room_id: string;
    engine_id: string;
    ply: number | null;
    request: unknown;
    preferred_worker: string | null;
    attempts: number;
  }>(
    `UPDATE engine_move_jobs
        SET status = 'claimed', claimed_by = $1, claimed_at = now(),
            attempts = attempts + 1, updated_at = now()
      WHERE id = (
        SELECT id FROM engine_move_jobs
         WHERE status = 'queued'
         ORDER BY (preferred_worker = $1) DESC, created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1)
      RETURNING id, room_id, engine_id, ply, request, preferred_worker, attempts`,
    [workerId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    roomId: r.room_id,
    engineId: r.engine_id,
    ply: r.ply,
    request: r.request,
    preferredWorker: r.preferred_worker,
    attempts: r.attempts,
  };
}

export async function completeMoveJob(jobId: number, result: unknown): Promise<void> {
  await getPool().query(
    `UPDATE engine_move_jobs SET status = 'done', result = $2, updated_at = now() WHERE id = $1`,
    [jobId, result],
  );
}

export async function failMoveJob(jobId: number, error: string): Promise<void> {
  await getPool().query(
    `UPDATE engine_move_jobs SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
    [jobId, error],
  );
}

export type MoveJobResult =
  | { status: 'queued' | 'claimed' }
  | { status: 'done'; result: unknown }
  | { status: 'failed'; error: string | null };

/** Poll point for the enqueuing server awaiting its move. Null if the id is unknown. */
export async function getMoveJobResult(jobId: number): Promise<MoveJobResult | null> {
  const { rows } = await getPool().query<{ status: string; result: unknown; error: string | null }>(
    'SELECT status, result, error FROM engine_move_jobs WHERE id = $1',
    [jobId],
  );
  const r = rows[0];
  if (!r) return null;
  if (r.status === 'done') return { status: 'done', result: r.result };
  if (r.status === 'failed') return { status: 'failed', error: r.error };
  return { status: r.status as 'queued' | 'claimed' };
}

/**
 * Recover jobs whose claiming worker died mid-move (claimed older than
 * `staleMs`): requeue those under `maxAttempts` so a healthy worker re-claims
 * and cold-replays; mark the rest failed (no infinite loop). Returns counts.
 */
export async function reapStaleMoveJobs(
  staleMs: number,
  maxAttempts: number,
): Promise<{ requeued: number; failed: number }> {
  const pool = getPool();
  const failed = await pool.query(
    `UPDATE engine_move_jobs
        SET status = 'failed', error = 'max attempts exceeded', updated_at = now()
      WHERE status = 'claimed'
        AND claimed_at < now() - ($1::float8 * interval '1 millisecond')
        AND attempts >= $2`,
    [staleMs, maxAttempts],
  );
  const requeued = await pool.query(
    `UPDATE engine_move_jobs
        SET status = 'queued', claimed_by = NULL, claimed_at = NULL, updated_at = now()
      WHERE status = 'claimed'
        AND claimed_at < now() - ($1::float8 * interval '1 millisecond')
        AND attempts < $2`,
    [staleMs, maxAttempts],
  );
  return { requeued: requeued.rowCount ?? 0, failed: failed.rowCount ?? 0 };
}
