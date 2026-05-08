import pg from 'pg';
import type { GameEvent } from '@bichess/game';

let pool: pg.Pool | null = null;

export type GameMode = 'pvp' | 'pve' | 'eve' | 'imported' | 'manual';
export type GameResult = 'white-wins' | 'black-wins' | 'draw';
export type GameTermination =
  | 'king-captured'
  | 'timeout'
  | 'checkmate'
  | 'draw'
  | 'engine-failure'
  | 'worker-aborted'
  | 'server-restarted'
  | 'no-legal-moves'
  | 'truncated';
export type GameReviewStatus = 'unreviewed' | 'flagged' | 'reviewed' | 'training' | 'rejected';

export type GameSummary = {
  variant: string;
  mode?: GameMode;
  result: GameResult;
  termination: GameTermination;
  plyCount: number;
  startedAt: Date;
  endedAt: Date;
  whiteClient: string | null;
  blackClient: string | null;
  whiteName: string | null;
  blackName: string | null;
  corpusId: string | null;
  reviewStatus?: GameReviewStatus;
};

export type GameRecord = {
  roomId: string;
  variant: string;
  result: string;
  termination: string;
  plyCount: number;
  startedAt: Date;
  endedAt: Date;
  whiteName: string | null;
  blackName: string | null;
  corpusId: string | null;
};

export type RecentEveGameRecord = GameRecord & {
  jobId: string | null;
  gameIndex: number | null;
  whiteEngineId: string | null;
  blackEngineId: string | null;
  timeControl: Record<string, unknown> | null;
};

export function init(connectionString: string): void {
  if (pool) throw new Error('persistence already initialized');
  pool = new pg.Pool({ connectionString, max: 10 });
}

export async function close(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}

export function isInitialized(): boolean {
  return pool !== null;
}

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

export async function listCorpusGames(corpusId: string, limit = 100): Promise<GameRecord[]> {
  const { rows } = await getPool().query<{
    room_id: string;
    variant: string;
    result: string;
    termination: string;
    ply_count: number;
    started_at: Date;
    ended_at: Date;
    white_name: string | null;
    black_name: string | null;
    corpus_id: string | null;
  }>(
    `SELECT room_id, variant, result, termination, ply_count, started_at, ended_at,
            white_name, black_name, corpus_id
     FROM games
     WHERE corpus_id = $1
       AND status = 'completed'
     ORDER BY room_id
     LIMIT $2`,
    [corpusId, limit],
  );
  return rows.map((row) => ({
    roomId: row.room_id,
    variant: row.variant,
    result: row.result,
    termination: row.termination,
    plyCount: row.ply_count,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    whiteName: row.white_name,
    blackName: row.black_name,
    corpusId: row.corpus_id,
  }));
}

export async function listRecentEveGames(limit = 12): Promise<RecentEveGameRecord[]> {
  const { rows } = await getPool().query<{
    room_id: string;
    variant: string;
    result: string;
    termination: string;
    ply_count: number;
    started_at: Date;
    ended_at: Date;
    white_name: string | null;
    black_name: string | null;
    corpus_id: string | null;
    job_id: string | null;
    game_index: number | null;
    white_engine_id: string | null;
    black_engine_id: string | null;
    time_control: Record<string, unknown> | null;
  }>(
    `SELECT games.room_id, games.variant, games.result, games.termination,
            games.ply_count, games.started_at, games.ended_at,
            games.white_name, games.black_name, games.corpus_id,
            eve_games.job_id, eve_games.game_index,
            eve_games.white_engine_id, eve_games.black_engine_id,
            eve_games.time_control
     FROM games
     LEFT JOIN eve_games ON eve_games.game_id = games.room_id
     WHERE games.mode = 'eve'
       AND games.status = 'completed'
     ORDER BY games.ended_at DESC, games.room_id DESC
     LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({
    roomId: row.room_id,
    variant: row.variant,
    result: row.result,
    termination: row.termination,
    plyCount: row.ply_count,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    whiteName: row.white_name,
    blackName: row.black_name,
    corpusId: row.corpus_id,
    jobId: row.job_id,
    gameIndex: row.game_index,
    whiteEngineId: row.white_engine_id,
    blackEngineId: row.black_engine_id,
    timeControl: row.time_control,
  }));
}

export async function recordGameEnd(roomId: string, summary: GameSummary): Promise<void> {
  await getPool().query(
    `INSERT INTO games
       (room_id, variant, result, termination, ply_count, started_at, ended_at,
        white_client, black_client, white_name, black_name, corpus_id,
        mode, status, review_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'completed', $14)
     ON CONFLICT (room_id) DO UPDATE SET
       variant = EXCLUDED.variant,
       result = EXCLUDED.result,
       termination = EXCLUDED.termination,
       ply_count = EXCLUDED.ply_count,
       started_at = EXCLUDED.started_at,
       ended_at = EXCLUDED.ended_at,
       white_client = EXCLUDED.white_client,
       black_client = EXCLUDED.black_client,
       white_name = EXCLUDED.white_name,
       black_name = EXCLUDED.black_name,
       corpus_id = EXCLUDED.corpus_id,
       mode = EXCLUDED.mode,
       status = 'completed',
       review_status = EXCLUDED.review_status,
       aborted_reason = NULL
     WHERE games.status = 'running'`,
    [
      roomId,
      summary.variant,
      summary.result,
      summary.termination,
      summary.plyCount,
      summary.startedAt,
      summary.endedAt,
      summary.whiteClient,
      summary.blackClient,
      summary.whiteName,
      summary.blackName,
      summary.corpusId,
      summary.mode ?? (summary.corpusId ? 'imported' : 'pvp'),
      summary.reviewStatus ?? 'unreviewed',
    ],
  );
}

function getPool(): pg.Pool {
  if (!pool) throw new Error('persistence not initialized — call init(connectionString) first');
  return pool;
}
