/**
 * room_deadlines persistence: the durable index for correspondence
 * (days-per-move) deadline enforcement. Rows are maintained by the tenant
 * event writer (upsert on every event while a deadline exists, delete on
 * terminal) and consumed by the deadline sweeper, which re-derives the
 * deadline from the hydrated room's event log before acting — the event log
 * stays the source of truth; this table only decides which rooms to look at.
 */

import { getPool } from './persistence-db.js';

export type RoomDeadlineRecord = {
  roomId: string;
  gameSpecId: string;
  seat: string;
  seatUserId: string | null;
  dueAt: Date;
};

export type DueRoomDeadline = {
  roomId: string;
  gameSpecId: string;
  seat: string;
  dueAt: Date;
};

export async function upsertRoomDeadline(record: RoomDeadlineRecord): Promise<void> {
  // A changed due_at re-arms the warning email (warned_at resets); an
  // unchanged due_at keeps it so re-upserts on unrelated events stay
  // idempotent.
  await getPool().query(
    `INSERT INTO room_deadlines (room_id, game_spec_id, seat, seat_user_id, due_at, warned_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NULL, now())
     ON CONFLICT (room_id) DO UPDATE SET
       game_spec_id = EXCLUDED.game_spec_id,
       seat = EXCLUDED.seat,
       seat_user_id = EXCLUDED.seat_user_id,
       due_at = EXCLUDED.due_at,
       warned_at = CASE
         WHEN room_deadlines.due_at = EXCLUDED.due_at THEN room_deadlines.warned_at
         ELSE NULL
       END,
       updated_at = now()`,
    [record.roomId, record.gameSpecId, record.seat, record.seatUserId, record.dueAt],
  );
}

export async function deleteRoomDeadline(roomId: string): Promise<void> {
  await getPool().query('DELETE FROM room_deadlines WHERE room_id = $1', [roomId]);
}

export async function listDueRoomDeadlines(now: Date, limit = 50): Promise<DueRoomDeadline[]> {
  const { rows } = await getPool().query(
    `SELECT room_id, game_spec_id, seat, due_at
     FROM room_deadlines
     WHERE due_at <= $1
     ORDER BY due_at
     LIMIT $2`,
    [now, limit],
  );
  return rows.map((row) => ({
    roomId: row.room_id as string,
    gameSpecId: row.game_spec_id as string,
    seat: row.seat as string,
    dueAt: row.due_at as Date,
  }));
}
