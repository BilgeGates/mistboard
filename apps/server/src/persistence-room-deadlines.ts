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

// One in-flight correspondence game from a player's perspective. The same
// room_deadlines index that the sweeper reads (one row per active days-per-move
// room, keyed to the seat on the move) doubles as the "your games" source — the
// seat_user_id partial index is built for exactly this.
export type CorrespondenceGameSummary = {
  roomId: string;
  gameSpecId: string;
  mySeat: string;
  isYourMove: boolean;
  opponentName: string | null;
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

// All of a player's in-flight correspondence games, your-move-first then
// soonest-deadline. Joins the deadline index (active days-per-move rooms) to
// the seat the player holds, and resolves the opponent's name from the other
// seat's account. Rooms without a deadline row (finished, or a still-open
// invite) and live rooms naturally fall out — only active correspondence
// rooms the player is seated in survive the join.
export async function listCorrespondenceGamesForUser(
  userId: string,
): Promise<CorrespondenceGameSummary[]> {
  const { rows } = await getPool().query<{
    room_id: string;
    game_spec_id: string;
    my_seat: string;
    on_move_seat: string;
    due_at: Date;
    opponent_name: string | null;
  }>(
    `SELECT rd.room_id, rd.game_spec_id, mine.seat AS my_seat, rd.seat AS on_move_seat,
            rd.due_at, COALESCE(opp_user.display_name, opp_user.handle) AS opponent_name
     FROM room_seat_tokens mine
     JOIN room_deadlines rd ON rd.room_id = mine.room_id
     LEFT JOIN room_seat_tokens opp
       ON opp.room_id = mine.room_id AND opp.seat <> mine.seat AND opp.revoked_at IS NULL
     LEFT JOIN users opp_user ON opp_user.id = opp.user_id
     WHERE mine.user_id = $1 AND mine.revoked_at IS NULL
     ORDER BY (rd.seat = mine.seat) DESC, rd.due_at ASC`,
    [userId],
  );
  return rows.map((row) => ({
    roomId: row.room_id,
    gameSpecId: row.game_spec_id,
    mySeat: row.my_seat,
    isYourMove: row.on_move_seat === row.my_seat,
    opponentName: row.opponent_name,
    dueAt: row.due_at,
  }));
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
