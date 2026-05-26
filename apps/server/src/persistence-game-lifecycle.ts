import type { Color, GameEvent } from '@mistboard/game';
import { getPool } from './persistence-db.js';

export type GameMode = 'pvp' | 'pve' | 'eve' | 'imported' | 'manual';
export type GameTermination =
  | 'king-captured'
  | 'timeout'
  | 'checkmate'
  | 'draw'
  | 'resignation'
  | 'engine-failure'
  | 'worker-aborted'
  | 'server-restarted'
  | 'abandoned'
  | 'abandonment'
  | 'no-legal-moves'
  | 'truncated';
export type GameReviewStatus = 'unreviewed' | 'flagged' | 'reviewed' | 'training' | 'rejected';
export type GameVisibility = 'private' | 'link' | 'unlisted' | 'public';

export type RunningGameSummary = {
  variant: string;
  mode: GameMode;
  startedAt: Date;
  whiteClient: string | null;
  blackClient: string | null;
  whiteName: string | null;
  blackName: string | null;
  corpusId: string | null;
  region?: string | null;
  reviewStatus?: GameReviewStatus;
  visibility?: GameVisibility;
};

export type GameDebugArtifactSummary = {
  artifactType: string;
  count: number;
  engineColors: Color[];
  minPly: number | null;
  maxPly: number | null;
  snapshotKinds: string[];
};

export type GameDebugArtifactPayload = {
  id: number;
  gameId: string;
  ply: number | null;
  engineColor: Color | null;
  artifactType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
};

export type GameDebugArtifactInput = {
  artifactType: string;
  engineColor?: Color | null;
  gameId: string;
  payload: Record<string, unknown>;
  ply?: number | null;
};

export type StalePausedFinalizeRecord = {
  roomId: string;
  mode: GameMode;
  startedAt: Date;
  pausedAtMs: number;
  pauseReason: string | null;
  plyCount: number;
};

export async function loadRoom(roomId: string): Promise<GameEvent[] | null> {
  const { rows } = await getPool().query<{ payload: GameEvent }>(
    'SELECT payload FROM events WHERE room_id = $1 ORDER BY seq ASC',
    [roomId],
  );
  if (rows.length === 0) return null;
  return rows.map((row) => row.payload);
}

export async function appendEvent(roomId: string, seq: number, event: GameEvent): Promise<void> {
  await getPool().query(
    'INSERT INTO events (room_id, seq, type, payload) VALUES ($1, $2, $3, $4)',
    [roomId, seq, event.type, event],
  );
}

export async function recordGameDebugArtifact(artifact: GameDebugArtifactInput): Promise<void> {
  await getPool().query(
    `INSERT INTO game_debug_artifacts
       (game_id, ply, engine_color, artifact_type, storage, payload)
     VALUES ($1, $2, $3, $4, 'jsonb', $5)`,
    [
      artifact.gameId,
      artifact.ply ?? null,
      artifact.engineColor ?? null,
      artifact.artifactType,
      artifact.payload,
    ],
  );
}

export async function listActiveRoomIds(since: Date): Promise<string[]> {
  const { rows } = await getPool().query<{ room_id: string }>(
    `SELECT DISTINCT room_id FROM events
     WHERE created_at >= $1
       AND room_id NOT IN (
         SELECT room_id FROM games WHERE status IN ('completed', 'aborted')
       )
     ORDER BY room_id`,
    [since],
  );
  return rows.map((row) => row.room_id);
}

export async function getGameLifecycleStatus(
  roomId: string,
): Promise<{ mode: GameMode; status: 'running' | 'completed' | 'aborted' } | null> {
  const { rows } = await getPool().query<{
    mode: GameMode;
    status: 'running' | 'completed' | 'aborted';
  }>(
    `SELECT mode, status
     FROM games
     WHERE room_id = $1
     LIMIT 1`,
    [roomId],
  );
  return rows[0] ?? null;
}

export async function abortRunningGame(
  roomId: string,
  options: {
    abortedReason: string;
    endedAt?: Date;
    termination: Extract<
      GameTermination,
      'abandoned' | 'engine-failure' | 'server-restarted' | 'worker-aborted'
    >;
  },
): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `UPDATE games
     SET status = 'aborted',
         result = NULL,
         termination = $2,
         ended_at = $3,
         aborted_reason = $4
     WHERE room_id = $1
       AND status = 'running'`,
    [roomId, options.termination, options.endedAt ?? new Date(), options.abortedReason],
  );
  return (rowCount ?? 0) > 0;
}

export async function abortStaleGuestPrestartGames(
  now = new Date(),
  staleAfterMs = 15 * 60 * 1000,
): Promise<{ aborted: number; roomIds: string[] }> {
  const staleBefore = new Date(now.getTime() - staleAfterMs);
  const { rows } = await getPool().query<{ room_id: string }>(
    `WITH candidates AS (
       SELECT games.room_id
       FROM games
       WHERE games.status = 'running'
         AND games.mode IN ('pvp', 'pve')
         AND games.started_at < $1
         AND NOT EXISTS (
           SELECT 1
           FROM events
           WHERE events.room_id = games.room_id
             AND events.type IN ('clock-started', 'move-played')
         )
         AND NOT EXISTS (
           SELECT 1
           FROM room_seat_tokens
           WHERE room_seat_tokens.room_id = games.room_id
             AND room_seat_tokens.revoked_at IS NULL
             AND room_seat_tokens.user_id IS NOT NULL
         )
       FOR UPDATE SKIP LOCKED
     ),
     repaired AS (
       UPDATE games
       SET status = 'aborted',
           result = NULL,
           termination = 'abandoned',
           ended_at = $2,
           aborted_reason = 'guest pre-start timeout'
       FROM candidates
       WHERE games.room_id = candidates.room_id
       RETURNING games.room_id
     )
     SELECT room_id
     FROM repaired
     ORDER BY room_id`,
    [staleBefore, now],
  );
  return { aborted: rows.length, roomIds: rows.map((row) => row.room_id) };
}

/**
 * Finalize paused rooms whose last event is `pause` older than `staleAfterMs`.
 *
 * Marks the games row as completed with `result = 'draw'`, `termination =
 * 'server-restarted'`. Idempotent via `WHERE games.status = 'running'` — a
 * concurrent reconnect-triggered finalize races the sweep at the row level and
 * first-writer wins.
 *
 * Returns one row per finalized game with enough context to log each as an
 * investigable event (paused rooms shouldn't accumulate; every occurrence is
 * a yellow flag).
 */
export async function finalizeStalePausedRooms(
  now = new Date(),
  staleAfterMs = 24 * 60 * 60 * 1000,
): Promise<{ finalized: number; rooms: StalePausedFinalizeRecord[] }> {
  const stalePauseBeforeMs = now.getTime() - staleAfterMs;
  const { rows } = await getPool().query<{
    room_id: string;
    mode: GameMode;
    started_at: Date;
    paused_at_ms: string;
    pause_reason: string | null;
    ply_count: number;
  }>(
    `WITH running_rooms AS (
       SELECT room_id, mode, started_at
       FROM games
       WHERE status = 'running'
     ),
     last_events AS (
       SELECT DISTINCT ON (e.room_id) e.room_id, e.type, e.payload
       FROM events e
       JOIN running_rooms r ON r.room_id = e.room_id
       ORDER BY e.room_id, e.seq DESC
     ),
     candidates AS (
       SELECT
         r.room_id,
         r.mode,
         r.started_at,
         (le.payload->>'at')::bigint AS paused_at_ms,
         le.payload->>'reason' AS pause_reason
       FROM running_rooms r
       JOIN last_events le ON le.room_id = r.room_id
       WHERE le.type = 'pause'
         AND (le.payload->>'at')::bigint < $1
     ),
     finalized AS (
       UPDATE games
       SET status = 'completed',
           result = 'draw',
           termination = 'server-restarted',
           ended_at = $2,
           ply_count = (
             SELECT COUNT(*)::int
             FROM events e2
             WHERE e2.room_id = candidates.room_id
               AND e2.type = 'move-played'
           )
       FROM candidates
       WHERE games.room_id = candidates.room_id
         AND games.status = 'running'
       RETURNING
         games.room_id,
         games.mode,
         games.started_at,
         games.ply_count,
         candidates.paused_at_ms,
         candidates.pause_reason
     )
     SELECT room_id, mode, started_at, paused_at_ms, pause_reason, ply_count
     FROM finalized
     ORDER BY room_id`,
    [stalePauseBeforeMs, now],
  );
  return {
    finalized: rows.length,
    rooms: rows.map((row) => ({
      roomId: row.room_id,
      mode: row.mode,
      startedAt: row.started_at,
      pausedAtMs: Number(row.paused_at_ms),
      pauseReason: row.pause_reason,
      plyCount: row.ply_count,
    })),
  };
}

export async function recordGameStart(roomId: string, summary: RunningGameSummary): Promise<void> {
  await getPool().query(
    `INSERT INTO games
       (room_id, variant, result, termination, ply_count, started_at, ended_at,
        white_client, black_client, white_name, black_name, corpus_id,
        mode, status, review_status, visibility, region)
     VALUES ($1, $2, NULL, NULL, 0, $3, NULL, $4, $5, $6, $7, $8,
        $9, 'running', $10, $11, $12)
     ON CONFLICT (room_id) DO NOTHING`,
    [
      roomId,
      summary.variant,
      summary.startedAt,
      summary.whiteClient,
      summary.blackClient,
      summary.whiteName,
      summary.blackName,
      summary.corpusId,
      summary.mode,
      summary.reviewStatus ?? 'unreviewed',
      summary.visibility ?? 'public',
      summary.region ?? 'global',
    ],
  );
}

export async function listGameDebugArtifactSummaries(
  gameId: string,
): Promise<GameDebugArtifactSummary[]> {
  const { rows } = await getPool().query<{
    artifact_type: string;
    count: string;
    engine_colors: Color[] | null;
    min_ply: number | null;
    max_ply: number | null;
    snapshot_kinds: string[] | null;
  }>(
    `SELECT artifact_type,
            COUNT(*)::text AS count,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT engine_color ORDER BY engine_color), NULL) AS engine_colors,
            MIN(ply) AS min_ply,
            MAX(ply) AS max_ply,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT payload->>'snapshot_kind' ORDER BY payload->>'snapshot_kind')
              FILTER (WHERE storage = 'jsonb' AND payload ? 'snapshot_kind'), NULL) AS snapshot_kinds
     FROM game_debug_artifacts
     WHERE game_id = $1
     GROUP BY artifact_type
     ORDER BY artifact_type`,
    [gameId],
  );

  return rows.map((row) => ({
    artifactType: row.artifact_type,
    count: Number.parseInt(row.count, 10),
    engineColors: row.engine_colors ?? [],
    minPly: row.min_ply,
    maxPly: row.max_ply,
    snapshotKinds: row.snapshot_kinds ?? [],
  }));
}

export async function listGameDebugArtifactPayloads(
  gameId: string,
  filters: {
    artifactType: string;
    engineColors?: Color[];
    limit?: number;
  },
): Promise<GameDebugArtifactPayload[]> {
  const boundedLimit = Math.max(1, Math.min(filters.limit ?? 500, 2000));
  const colors =
    filters.engineColors && filters.engineColors.length > 0 ? filters.engineColors : null;
  const { rows } = await getPool().query<{
    id: string;
    game_id: string;
    ply: number | null;
    engine_color: Color | null;
    artifact_type: string;
    payload: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT id::text, game_id, ply, engine_color, artifact_type, payload, created_at
     FROM game_debug_artifacts
     WHERE game_id = $1
       AND artifact_type = $2
       AND storage = 'jsonb'
       AND ($3::text[] IS NULL OR engine_color = ANY($3::text[]))
     ORDER BY ply NULLS LAST, engine_color NULLS LAST, id
     LIMIT $4`,
    [gameId, filters.artifactType, colors, boundedLimit],
  );
  return rows.map((row) => ({
    id: Number.parseInt(row.id, 10),
    gameId: row.game_id,
    ply: row.ply,
    engineColor: row.engine_color,
    artifactType: row.artifact_type,
    payload: row.payload,
    createdAt: row.created_at,
  }));
}
