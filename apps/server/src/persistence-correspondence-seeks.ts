/**
 * correspondence_seeks persistence: the open async-seek board (C3). A seek is a
 * standing correspondence request that anyone can accept later — accepting it
 * (the tenant accept flow) creates a room seating both players and deletes the
 * seek, so this table holds only open seeks. The per-user cap is enforced in
 * app code via countOpenSeeksForUser.
 */

import { getPool } from './persistence-db.js';

export type SeekColorPreference = 'white' | 'black' | 'random';

export type CorrespondenceSeekRecord = {
  id: string;
  creatorUserId: string;
  gameSpecId: string;
  daysPerMove: number;
  preferredColor: SeekColorPreference;
};

export type CorrespondenceSeekListing = CorrespondenceSeekRecord & {
  creatorName: string | null;
  createdAt: Date;
};

export async function createCorrespondenceSeek(seek: CorrespondenceSeekRecord): Promise<void> {
  await getPool().query(
    `INSERT INTO correspondence_seeks
       (id, creator_user_id, game_spec_id, days_per_move, preferred_color)
     VALUES ($1, $2, $3, $4, $5)`,
    [seek.id, seek.creatorUserId, seek.gameSpecId, seek.daysPerMove, seek.preferredColor],
  );
}

export async function countOpenSeeksForUser(userId: string): Promise<number> {
  const { rows } = await getPool().query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM correspondence_seeks WHERE creator_user_id = $1',
    [userId],
  );
  return Number(rows[0]?.count ?? '0');
}

// All open seeks, newest first, with the creator's display name for the board.
export async function listOpenCorrespondenceSeeks(
  limit = 100,
): Promise<CorrespondenceSeekListing[]> {
  const { rows } = await getPool().query<{
    id: string;
    creator_user_id: string;
    game_spec_id: string;
    days_per_move: number;
    preferred_color: SeekColorPreference;
    creator_name: string | null;
    created_at: Date;
  }>(
    `SELECT s.id, s.creator_user_id, s.game_spec_id, s.days_per_move, s.preferred_color,
            COALESCE(u.display_name, u.handle) AS creator_name, s.created_at
     FROM correspondence_seeks s
     JOIN users u ON u.id = s.creator_user_id
     ORDER BY s.created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({
    id: row.id,
    creatorUserId: row.creator_user_id,
    gameSpecId: row.game_spec_id,
    daysPerMove: row.days_per_move,
    preferredColor: row.preferred_color,
    creatorName: row.creator_name,
    createdAt: row.created_at,
  }));
}

export async function getCorrespondenceSeek(id: string): Promise<CorrespondenceSeekRecord | null> {
  const { rows } = await getPool().query<{
    id: string;
    creator_user_id: string;
    game_spec_id: string;
    days_per_move: number;
    preferred_color: SeekColorPreference;
  }>(
    `SELECT id, creator_user_id, game_spec_id, days_per_move, preferred_color
     FROM correspondence_seeks WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    creatorUserId: row.creator_user_id,
    gameSpecId: row.game_spec_id,
    daysPerMove: row.days_per_move,
    preferredColor: row.preferred_color,
  };
}

// Delete a seek, returning whether a row was removed. The accept flow relies on
// this boolean to win the race when two players accept the same seek at once:
// only the deleter (rowCount 1) proceeds to create the room. Pass ownerUserId
// to scope a cancel to the seek's creator.
export async function deleteCorrespondenceSeek(id: string, ownerUserId?: string): Promise<boolean> {
  const result = ownerUserId
    ? await getPool().query(
        'DELETE FROM correspondence_seeks WHERE id = $1 AND creator_user_id = $2',
        [id, ownerUserId],
      )
    : await getPool().query('DELETE FROM correspondence_seeks WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
