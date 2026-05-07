import pg from 'pg';
import type { GameEvent } from '@bichess/game';

let pool: pg.Pool | null = null;

export type GameSummary = {
  variant: string;
  result: 'white-wins' | 'black-wins' | 'draw';
  termination: 'king-captured' | 'timeout' | 'checkmate' | 'draw';
  plyCount: number;
  startedAt: Date;
  endedAt: Date;
  whiteClient: string | null;
  blackClient: string | null;
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
       AND room_id NOT IN (SELECT room_id FROM games)
     ORDER BY room_id`,
    [since],
  );
  return rows.map((row) => row.room_id);
}

export async function recordGameEnd(roomId: string, summary: GameSummary): Promise<void> {
  await getPool().query(
    `INSERT INTO games
       (room_id, variant, result, termination, ply_count, started_at, ended_at, white_client, black_client)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (room_id) DO NOTHING`,
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
    ],
  );
}

function getPool(): pg.Pool {
  if (!pool) throw new Error('persistence not initialized — call init(connectionString) first');
  return pool;
}
