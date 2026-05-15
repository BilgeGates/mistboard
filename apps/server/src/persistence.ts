import pg from 'pg';
import type { Color, GameEvent } from '@mistboard/game';
import { engineVersionDisplayName } from './engine-registry.js';
import { computeElo, type EloResult } from './elo.js';
import {
  bucketForGame,
  type RatingBucket,
  type RatingTimeClass,
  type RatingVariant,
} from './rating-buckets.js';

let pool: pg.Pool | null = null;

const MIN_TIMEOUT_SOURCE_PLY_COUNT = 10;

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
  | 'abandoned'
  | 'no-legal-moves'
  | 'truncated';
export type GameReviewStatus = 'unreviewed' | 'flagged' | 'reviewed' | 'training' | 'rejected';
export type GameVisibility = 'private' | 'link' | 'unlisted' | 'public';
export type GameParticipantSubjectType = 'guest' | 'user' | 'engine-version' | 'manual' | 'imported';
export type AccountRole = 'player' | 'test' | 'admin';

export type GameParticipant = {
  color: Color;
  displayName: string;
  subjectType: GameParticipantSubjectType;
  subjectId: string | null;
  visibility: GameVisibility;
};

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
  rated?: boolean;
  reviewStatus?: GameReviewStatus;
  visibility?: GameVisibility;
  participants?: GameParticipant[];
  initialMs?: number | null;
  incrementMs?: number | null;
  hiddenDraft960?: boolean | null;
};

export type RunningGameSummary = {
  variant: string;
  mode: GameMode;
  startedAt: Date;
  whiteClient: string | null;
  blackClient: string | null;
  whiteName: string | null;
  blackName: string | null;
  corpusId: string | null;
  reviewStatus?: GameReviewStatus;
  visibility?: GameVisibility;
};

export type GameRecord = {
  roomId: string;
  variant: string;
  mode: GameMode;
  result: string;
  termination: string;
  plyCount: number;
  startedAt: Date;
  endedAt: Date;
  whiteName: string | null;
  blackName: string | null;
  corpusId: string | null;
  rated: boolean;
  visibility: GameVisibility;
  participants: GameParticipant[];
};

export type ProfileGameRecord = GameRecord & {
  playerColor: Color;
};

export type RecentEveGameRecord = GameRecord & {
  jobId: string | null;
  gameIndex: number | null;
  whiteEngineId: string | null;
  blackEngineId: string | null;
  timeControl: Record<string, unknown> | null;
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

export type CompletedGameFilters = {
  endedFrom: Date;
  endedTo: Date;
  limit?: number;
  mode?: GameMode;
};

export type UserAccount = {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  handle: string;
  handleChangedAt: Date | null;
  displayName: string;
  displayNameChangedAt: Date | null;
  profileVisibility: 'private' | 'unlisted' | 'public';
  accountRole: AccountRole;
  eloRating: number;
  createdAt: Date;
  updatedAt: Date;
};

export type LeaderboardEntry = {
  rank: number;
  handle: string;
  displayName: string;
  eloRating: number;
  gamesPlayed: number;
};

export type LeaderboardQuery = {
  variant: RatingVariant;
  timeClass: RatingTimeClass;
  limit?: number;
};

export type UpdateUserProfileResult =
  | { ok: true; user: UserAccount }
  | { ok: false; error: 'handle_taken' | 'handle_change_cooldown'; availableAt?: Date };

export type EmailLoginChallenge = {
  id: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
};

export type AccountSession = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

export type RoomSeatTokenRecord = {
  seat: Color;
  clientId: string;
  tokenHash: string;
  userId: string | null;
  userHandle: string | null;
  userDisplayName: string | null;
  issuedAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
};

export type PublicProfileUser = {
  handle: string;
  displayName: string;
  profileVisibility: UserAccount['profileVisibility'];
};

export type UserProfile = {
  user: PublicProfileUser;
  games: ProfileGameRecord[];
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

export async function loadRoomSeatTokens(roomId: string): Promise<Partial<Record<Color, RoomSeatTokenRecord>>> {
  const { rows } = await getPool().query<{
    seat: Color;
    client_id: string;
    token_hash: string;
    user_id: string | null;
    user_handle: string | null;
    user_display_name: string | null;
    issued_at: Date;
    last_seen_at: Date;
    revoked_at: Date | null;
  }>(
    `SELECT room_seat_tokens.seat, room_seat_tokens.client_id, room_seat_tokens.token_hash,
            room_seat_tokens.user_id, users.handle AS user_handle, users.display_name AS user_display_name,
            room_seat_tokens.issued_at, room_seat_tokens.last_seen_at, room_seat_tokens.revoked_at
     FROM room_seat_tokens
     LEFT JOIN users ON users.id = room_seat_tokens.user_id
     WHERE room_id = $1
       AND room_seat_tokens.revoked_at IS NULL`,
    [roomId],
  );
  const tokens: Partial<Record<Color, RoomSeatTokenRecord>> = {};
  for (const row of rows) {
    tokens[row.seat] = {
      seat: row.seat,
      clientId: row.client_id,
      tokenHash: row.token_hash,
      userId: row.user_id,
      userHandle: row.user_handle,
      userDisplayName: row.user_display_name,
      issuedAt: row.issued_at,
      lastSeenAt: row.last_seen_at,
      revokedAt: row.revoked_at,
    };
  }
  return tokens;
}

export async function upsertRoomSeatToken(
  roomId: string,
  token: Omit<RoomSeatTokenRecord, 'issuedAt' | 'lastSeenAt' | 'revokedAt'> & {
    issuedAt: Date;
    lastSeenAt: Date;
    revokedAt?: Date | null;
  },
): Promise<void> {
  await getPool().query(
    `INSERT INTO room_seat_tokens
       (room_id, seat, client_id, token_hash, user_id, issued_at, last_seen_at, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (room_id, seat) DO UPDATE SET
       client_id = EXCLUDED.client_id,
       token_hash = EXCLUDED.token_hash,
       user_id = EXCLUDED.user_id,
       issued_at = EXCLUDED.issued_at,
       last_seen_at = EXCLUDED.last_seen_at,
       revoked_at = EXCLUDED.revoked_at`,
    [
      roomId,
      token.seat,
      token.clientId,
      token.tokenHash,
      token.userId,
      token.issuedAt,
      token.lastSeenAt,
      token.revokedAt ?? null,
    ],
  );
}

export async function touchRoomSeatToken(roomId: string, seat: Color, tokenHash: string, at: Date): Promise<void> {
  await getPool().query(
    `UPDATE room_seat_tokens
     SET last_seen_at = $4
     WHERE room_id = $1
       AND seat = $2
       AND token_hash = $3
       AND revoked_at IS NULL`,
    [roomId, seat, tokenHash, at],
  );
}

export async function replaceRoomSeatTokens(
  roomId: string,
  tokens: Partial<Record<Color, RoomSeatTokenRecord>>,
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM room_seat_tokens WHERE room_id = $1', [roomId]);
    for (const token of Object.values(tokens)) {
      if (!token || token.revokedAt) continue;
      await client.query(
        `INSERT INTO room_seat_tokens
           (room_id, seat, client_id, token_hash, user_id, issued_at, last_seen_at, revoked_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          roomId,
          token.seat,
          token.clientId,
          token.tokenHash,
          token.userId,
          token.issuedAt,
          token.lastSeenAt,
          token.revokedAt,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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

export async function getGameLifecycleStatus(roomId: string): Promise<{ mode: GameMode; status: 'running' | 'completed' | 'aborted' } | null> {
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
    termination: Extract<GameTermination, 'abandoned' | 'engine-failure' | 'server-restarted' | 'worker-aborted'>;
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

export async function recordGameStart(roomId: string, summary: RunningGameSummary): Promise<void> {
  await getPool().query(
    `INSERT INTO games
       (room_id, variant, result, termination, ply_count, started_at, ended_at,
        white_client, black_client, white_name, black_name, corpus_id,
        mode, status, review_status, visibility)
     VALUES ($1, $2, NULL, NULL, 0, $3, NULL, $4, $5, $6, $7, $8,
        $9, 'running', $10, $11)
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
    ],
  );
}

export async function createEmailLoginChallenge(challenge: EmailLoginChallenge): Promise<void> {
  await getPool().query(
    `INSERT INTO email_login_challenges (id, email, code_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [challenge.id, challenge.email, challenge.codeHash, challenge.expiresAt],
  );
}

export async function deleteEmailLoginChallenge(id: string): Promise<void> {
  await getPool().query('DELETE FROM email_login_challenges WHERE id = $1', [id]);
}

export async function consumeEmailLoginChallenge(
  id: string,
  codeHash: string,
  at: Date,
): Promise<{ email: string } | null> {
  const { rows } = await getPool().query<{ email: string }>(
    `UPDATE email_login_challenges
     SET consumed_at = $3
     WHERE id = $1
       AND code_hash = $2
       AND consumed_at IS NULL
       AND expires_at > $3
     RETURNING email`,
    [id, codeHash, at],
  );
  return rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<UserAccount | null> {
  const { rows } = await getPool().query<UserRow>(
    `SELECT id, email, email_verified_at, handle, handle_changed_at,
            display_name, display_name_changed_at, profile_visibility,
            account_role, elo_rating, created_at, updated_at
     FROM users
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [email],
  );
  return rows[0] ? userFromRow(rows[0]) : null;
}

export async function createUser(user: {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  handle: string;
  displayName: string;
  profileVisibility?: UserAccount['profileVisibility'];
  accountRole?: AccountRole;
  now: Date;
}): Promise<UserAccount> {
  const { rows } = await getPool().query<UserRow>(
    `INSERT INTO users
       (id, email, email_verified_at, handle, display_name, profile_visibility, account_role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
     RETURNING id, email, email_verified_at, handle, handle_changed_at,
               display_name, display_name_changed_at, profile_visibility,
               account_role, elo_rating, created_at, updated_at`,
    [
      user.id,
      user.email,
      user.emailVerifiedAt,
      user.handle,
      user.displayName,
      user.profileVisibility ?? 'public',
      user.accountRole ?? 'player',
      user.now,
    ],
  );
  return userFromRow(rows[0]!);
}

export async function markUserEmailVerified(userId: string, at: Date): Promise<UserAccount> {
  const { rows } = await getPool().query<UserRow>(
    `UPDATE users
     SET email_verified_at = COALESCE(email_verified_at, $2),
         updated_at = $2
     WHERE id = $1
     RETURNING id, email, email_verified_at, handle, handle_changed_at,
               display_name, display_name_changed_at, profile_visibility,
               account_role, elo_rating, created_at, updated_at`,
    [userId, at],
  );
  return userFromRow(rows[0]!);
}

export async function updateUserProfile(
  userId: string,
  updates: { handle: string; displayName: string },
  at: Date,
): Promise<UpdateUserProfileResult> {
  const client = await getPool().connect();
  const handleCooldownMs = 30 * 24 * 60 * 60 * 1000;
  const handleReservationMs = 90 * 24 * 60 * 60 * 1000;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<UserRow>(
      `SELECT id, email, email_verified_at, handle, handle_changed_at,
              display_name, display_name_changed_at, profile_visibility,
              account_role, elo_rating, created_at, updated_at
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId],
    );
    const current = rows[0] ? userFromRow(rows[0]) : null;
    if (!current) throw new Error(`missing user ${userId}`);

    const nextHandle = updates.handle;
    const nextDisplayName = updates.displayName;
    const handleChanged = nextHandle !== current.handle;
    const displayNameChanged = nextDisplayName !== current.displayName;

    if (handleChanged) {
      if (current.handleChangedAt && at.getTime() - current.handleChangedAt.getTime() < handleCooldownMs) {
        await client.query('ROLLBACK');
        return {
          ok: false,
          error: 'handle_change_cooldown',
          availableAt: new Date(current.handleChangedAt.getTime() + handleCooldownMs),
        };
      }
      const { rows: conflicts } = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM users WHERE lower(handle) = lower($1) AND id <> $2
           UNION ALL
           SELECT 1 FROM user_handle_reservations
           WHERE lower(handle) = lower($1)
             AND user_id <> $2
             AND expires_at > $3
         ) AS exists`,
        [nextHandle, userId, at],
      );
      if (conflicts[0]?.exists) {
        await client.query('ROLLBACK');
        return { ok: false, error: 'handle_taken' };
      }
      await client.query(
        `INSERT INTO user_handle_reservations (handle, user_id, reserved_at, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (handle) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             reserved_at = EXCLUDED.reserved_at,
             expires_at = EXCLUDED.expires_at`,
        [current.handle, userId, at, new Date(at.getTime() + handleReservationMs)],
      );
    }

    const { rows: updatedRows } = await client.query<UserRow>(
      `UPDATE users
       SET handle = $2,
           handle_changed_at = CASE WHEN $4 THEN $6 ELSE handle_changed_at END,
           display_name = $3,
           display_name_changed_at = CASE WHEN $5 THEN $6 ELSE display_name_changed_at END,
           updated_at = $6
       WHERE id = $1
       RETURNING id, email, email_verified_at, handle, handle_changed_at,
                 display_name, display_name_changed_at, profile_visibility,
                 account_role, elo_rating, created_at, updated_at`,
      [userId, nextHandle, nextDisplayName, handleChanged, displayNameChanged, at],
    );
    await client.query('COMMIT');
    return { ok: true, user: userFromRow(updatedRows[0]!) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (isUniqueViolation(err)) return { ok: false, error: 'handle_taken' };
    throw err;
  } finally {
    client.release();
  }
}

export async function createAccountSession(session: AccountSession): Promise<void> {
  await getPool().query(
    `INSERT INTO account_sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [session.id, session.userId, session.tokenHash, session.expiresAt],
  );
}

export async function getUserByAccountSession(
  sessionId: string,
  tokenHash: string,
  at: Date,
): Promise<UserAccount | null> {
  const { rows } = await getPool().query<UserRow>(
    `UPDATE account_sessions
     SET last_seen_at = $3
     FROM users
     WHERE account_sessions.id = $1
       AND account_sessions.token_hash = $2
       AND account_sessions.user_id = users.id
       AND account_sessions.revoked_at IS NULL
       AND account_sessions.expires_at > $3
     RETURNING users.id, users.email, users.email_verified_at, users.handle, users.handle_changed_at,
               users.display_name, users.display_name_changed_at, users.profile_visibility,
               users.account_role, users.created_at, users.updated_at`,
    [sessionId, tokenHash, at],
  );
  return rows[0] ? userFromRow(rows[0]) : null;
}

export async function revokeAccountSession(sessionId: string, tokenHash: string, at: Date): Promise<void> {
  await getPool().query(
    `UPDATE account_sessions
     SET revoked_at = $3
     WHERE id = $1
       AND token_hash = $2
       AND revoked_at IS NULL`,
    [sessionId, tokenHash, at],
  );
}

export async function getUserProfileByHandle(
  handle: string,
  viewerUserId: string | null,
  limit = 50,
): Promise<UserProfile | null> {
  const { rows: userRows } = await getPool().query<UserRow>(
    `SELECT id, email, email_verified_at, handle, handle_changed_at,
            display_name, display_name_changed_at, profile_visibility,
            account_role, elo_rating, created_at, updated_at
     FROM users
     WHERE lower(handle) = lower($1)
     LIMIT 1`,
    [handle],
  );
  const user = userRows[0] ? userFromRow(userRows[0]) : null;
  if (!user) return null;

  const isViewer = viewerUserId === user.id;
  if (user.profileVisibility === 'private' && !isViewer) return null;

  const boundedLimit = Math.max(1, Math.min(limit, 100));
  const visibilityClause = isViewer
    ? ''
    : `AND games.visibility <> 'private'
       AND game_participants.visibility <> 'private'`;
  const { rows: gameRows } = await getPool().query<{
    room_id: string;
    player_color: Color;
    variant: string;
    mode: GameMode;
    result: string;
    termination: string;
    ply_count: number;
    started_at: Date;
    ended_at: Date;
    white_name: string | null;
    black_name: string | null;
    corpus_id: string | null;
    rated: boolean;
    visibility: GameVisibility;
  }>(
    `SELECT games.room_id, game_participants.color AS player_color,
            games.variant, games.mode, games.result, games.termination,
            games.ply_count, games.started_at, games.ended_at,
            games.white_name, games.black_name, games.corpus_id,
            COALESCE(games.rated, true) AS rated, games.visibility
     FROM game_participants
     JOIN games ON games.room_id = game_participants.game_id
     WHERE game_participants.subject_type = 'user'
       AND game_participants.subject_id = $1
       AND games.status = 'completed'
       ${visibilityClause}
     ORDER BY games.ended_at DESC, games.room_id DESC
     LIMIT $2`,
    [user.id, boundedLimit],
  );
  const games = gameRows.map((row): ProfileGameRecord => ({
    roomId: row.room_id,
    playerColor: row.player_color,
    variant: row.variant,
    mode: row.mode,
    result: row.result as GameResult,
    termination: row.termination as GameTermination,
    plyCount: row.ply_count,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    whiteName: row.white_name,
    blackName: row.black_name,
    corpusId: row.corpus_id,
    rated: row.rated,
    visibility: row.visibility,
    participants: [],
  }));

  return {
    user: {
      handle: user.handle,
      displayName: user.displayName,
      profileVisibility: user.profileVisibility,
    },
    games: await withParticipants(games),
  };
}

export async function getLeaderboard(query: LeaderboardQuery): Promise<LeaderboardEntry[]> {
  const bounded = Math.max(1, Math.min(query.limit ?? 100, 500));
  const { rows } = await getPool().query<{
    rank: string;
    handle: string;
    display_name: string;
    elo_rating: number;
    games_played: number;
  }>(
    `SELECT RANK() OVER (ORDER BY r.elo_rating DESC) AS rank,
            u.handle, u.display_name, r.elo_rating, r.games_played
     FROM user_ratings r
     JOIN users u ON u.id = r.user_id
     WHERE r.variant = $1 AND r.time_class = $2
       AND u.profile_visibility IN ('public', 'unlisted')
     ORDER BY r.elo_rating DESC
     LIMIT $3`,
    [query.variant, query.timeClass, bounded],
  );
  return rows.map((row) => ({
    rank: Number(row.rank),
    handle: row.handle,
    displayName: row.display_name,
    eloRating: row.elo_rating,
    gamesPlayed: row.games_played,
  }));
}

export async function listCorpusGames(corpusId: string, limit = 100): Promise<GameRecord[]> {
  const { rows } = await getPool().query<{
    room_id: string;
    variant: string;
    mode: GameMode;
    result: string;
    termination: string;
    ply_count: number;
    started_at: Date;
    ended_at: Date;
    white_name: string | null;
    black_name: string | null;
    corpus_id: string | null;
    visibility: GameVisibility;
  }>(
    `SELECT room_id, variant, mode, result, termination, ply_count, started_at, ended_at,
            white_name, black_name, corpus_id, visibility
     FROM games
     WHERE corpus_id = $1
       AND status = 'completed'
       AND NOT (termination = 'timeout' AND ply_count < $2)
     ORDER BY room_id
     LIMIT $3`,
    [corpusId, MIN_TIMEOUT_SOURCE_PLY_COUNT, limit],
  );
  const records = rows.map((row): GameRecord => ({
    roomId: row.room_id,
    variant: row.variant,
    mode: row.mode,
    result: row.result,
    termination: row.termination,
    plyCount: row.ply_count,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    whiteName: row.white_name,
    blackName: row.black_name,
    corpusId: row.corpus_id,
    rated: true,
    visibility: row.visibility,
    participants: [],
  }));
  return withParticipants(records);
}

export async function listRecentEveGames(limit = 12): Promise<RecentEveGameRecord[]> {
  const { rows } = await getPool().query<{
    room_id: string;
    variant: string;
    mode: GameMode;
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
    visibility: GameVisibility;
  }>(
    `SELECT games.room_id, games.variant, games.mode, games.result, games.termination,
            games.ply_count, games.started_at, games.ended_at,
            games.white_name, games.black_name, games.corpus_id,
            eve_games.job_id, eve_games.game_index,
            eve_games.white_engine_id, eve_games.black_engine_id,
            eve_games.time_control,
            games.visibility
     FROM games
     LEFT JOIN eve_games ON eve_games.game_id = games.room_id
     WHERE games.mode = 'eve'
       AND games.status = 'completed'
       AND NOT (games.termination = 'timeout' AND games.ply_count < $1)
     ORDER BY games.ended_at DESC, games.room_id DESC
    LIMIT $2`,
    [MIN_TIMEOUT_SOURCE_PLY_COUNT, limit],
  );
  const records = rows.map((row): RecentEveGameRecord => ({
    roomId: row.room_id,
    variant: row.variant,
    mode: row.mode,
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
    rated: true,
    visibility: row.visibility,
    participants: [],
  }));
  return withParticipants(records);
}

export async function listRecentPublicGames(limit = 10): Promise<RecentEveGameRecord[]> {
  const boundedLimit = Math.max(1, Math.min(limit, 50));
  const { rows } = await getPool().query<{
    room_id: string;
    variant: string;
    mode: GameMode;
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
    visibility: GameVisibility;
  }>(
    `SELECT games.room_id, games.variant, games.mode, games.result, games.termination,
            games.ply_count, games.started_at, games.ended_at,
            games.white_name, games.black_name, games.corpus_id,
            eve_games.job_id, eve_games.game_index,
            eve_games.white_engine_id, eve_games.black_engine_id,
            eve_games.time_control,
            games.visibility
     FROM games
     LEFT JOIN eve_games ON eve_games.game_id = games.room_id
     WHERE games.status = 'completed'
       AND NOT (games.termination = 'timeout' AND games.ply_count < $1)
       AND NOT (games.mode IN ('pvp', 'pve') AND games.ply_count < 2)
       AND EXISTS (
         SELECT 1
         FROM events
         WHERE events.room_id = games.room_id
         LIMIT 1
       )
       AND (
         games.visibility = 'public'
         OR games.mode = 'eve'
         OR (games.mode = 'pve' AND games.visibility <> 'private')
       )
     ORDER BY games.ended_at DESC, games.room_id DESC
     LIMIT $2`,
    [MIN_TIMEOUT_SOURCE_PLY_COUNT, boundedLimit],
  );

  const records = rows.map((row): RecentEveGameRecord => ({
    roomId: row.room_id,
    variant: row.variant,
    mode: row.mode,
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
    rated: true,
    visibility: row.visibility,
    participants: [],
  }));
  return withParticipants(records);
}

export async function listCompletedGames(filters: CompletedGameFilters): Promise<RecentEveGameRecord[]> {
  const limit = Math.max(1, Math.min(filters.limit ?? 100, 250));
  const values: unknown[] = [filters.endedFrom, filters.endedTo];
  const modeClause = filters.mode ? 'AND games.mode = $3' : '';
  if (filters.mode) values.push(filters.mode);
  values.push(limit);
  const limitParam = values.length;

  const { rows } = await getPool().query<{
    room_id: string;
    variant: string;
    mode: GameMode;
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
    visibility: GameVisibility;
  }>(
    `SELECT games.room_id, games.variant, games.mode, games.result, games.termination,
            games.ply_count, games.started_at, games.ended_at,
            games.white_name, games.black_name, games.corpus_id,
            eve_games.job_id, eve_games.game_index,
            eve_games.white_engine_id, eve_games.black_engine_id,
            eve_games.time_control,
            games.visibility
     FROM games
     LEFT JOIN eve_games ON eve_games.game_id = games.room_id
     WHERE games.status = 'completed'
       AND games.ended_at >= $1
       AND games.ended_at < $2
       ${modeClause}
     ORDER BY games.ended_at DESC, games.room_id DESC
     LIMIT $${limitParam}`,
    values,
  );

  const records = rows.map((row): RecentEveGameRecord => ({
    roomId: row.room_id,
    variant: row.variant,
    mode: row.mode,
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
    rated: true,
    visibility: row.visibility,
    participants: [],
  }));
  return withParticipants(records);
}

export async function getGameSummary(roomId: string): Promise<RecentEveGameRecord | null> {
  const { rows } = await getPool().query<{
    room_id: string;
    variant: string;
    mode: GameMode;
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
    visibility: GameVisibility;
  }>(
    `SELECT games.room_id, games.variant, games.mode, games.result, games.termination,
            games.ply_count, games.started_at, games.ended_at,
            games.white_name, games.black_name, games.corpus_id,
            eve_games.job_id, eve_games.game_index,
            eve_games.white_engine_id, eve_games.black_engine_id,
            eve_games.time_control,
            games.visibility
     FROM games
     LEFT JOIN eve_games ON eve_games.game_id = games.room_id
     WHERE games.room_id = $1
       AND games.status = 'completed'
     LIMIT 1`,
    [roomId],
  );
  const row = rows[0];
  if (!row) return null;
  const [record] = await withParticipants([{
    roomId: row.room_id,
    variant: row.variant,
    mode: row.mode,
    result: row.result,
    termination: row.termination,
    plyCount: row.ply_count,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    whiteName: row.white_name,
    blackName: row.black_name,
    corpusId: row.corpus_id,
    rated: true,
    jobId: row.job_id,
    gameIndex: row.game_index,
    whiteEngineId: row.white_engine_id,
    blackEngineId: row.black_engine_id,
    timeControl: row.time_control,
    visibility: row.visibility,
    participants: [],
  }]);
  return record ?? null;
}

export async function listGameDebugArtifactSummaries(gameId: string): Promise<GameDebugArtifactSummary[]> {
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
  const colors = filters.engineColors && filters.engineColors.length > 0
    ? filters.engineColors
    : null;
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

export async function recordGameEnd(roomId: string, summary: GameSummary): Promise<void> {
  const client = await getPool().connect();
  const mode = summary.mode ?? (summary.corpusId ? 'imported' : 'pvp');
  const visibility = summary.visibility ?? 'public';
  try {
    await client.query('BEGIN');
    const rated = summary.rated ?? true;
    await client.query(
      `INSERT INTO games
         (room_id, variant, result, termination, ply_count, started_at, ended_at,
          white_client, black_client, white_name, black_name, corpus_id,
          mode, status, review_status, visibility, rated,
          initial_ms, increment_ms, hidden_draft960)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'completed', $14, $15, $16, $17, $18, $19)
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
         visibility = EXCLUDED.visibility,
         rated = EXCLUDED.rated,
         initial_ms = EXCLUDED.initial_ms,
         increment_ms = EXCLUDED.increment_ms,
         hidden_draft960 = EXCLUDED.hidden_draft960,
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
        mode,
        summary.reviewStatus ?? 'unreviewed',
        visibility,
        rated,
        summary.initialMs ?? null,
        summary.incrementMs ?? null,
        summary.hiddenDraft960 ?? null,
      ],
    );
    const participants = summary.participants ?? defaultParticipantsForSummary(summary, mode, visibility);
    for (const participant of participants) {
      await client.query(
        `INSERT INTO game_participants
           (game_id, color, subject_type, subject_id, display_name, visibility)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (game_id, color) DO UPDATE SET
           subject_type = EXCLUDED.subject_type,
           subject_id = EXCLUDED.subject_id,
           display_name = EXCLUDED.display_name,
           visibility = EXCLUDED.visibility`,
        [
          roomId,
          participant.color,
          participant.subjectType,
          participant.subjectId,
          participant.displayName,
          participant.visibility,
        ],
      );
    }
    if (mode === 'pvp' && rated) {
      const bucket = bucketForGame({
        initialMs: summary.initialMs,
        incrementMs: summary.incrementMs,
        hiddenDraft960: summary.hiddenDraft960,
      });
      const whiteParticipant = participants.find((p) => p.color === 'white');
      const blackParticipant = participants.find((p) => p.color === 'black');
      if (
        bucket &&
        whiteParticipant?.subjectType === 'user' && whiteParticipant.subjectId &&
        blackParticipant?.subjectType === 'user' && blackParticipant.subjectId
      ) {
        await updateEloInTransaction(
          client,
          roomId,
          whiteParticipant.subjectId,
          blackParticipant.subjectId,
          summary.result as EloResult,
          bucket,
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateEloInTransaction(
  client: pg.PoolClient,
  roomId: string,
  whiteUserId: string,
  blackUserId: string,
  result: EloResult,
  bucket: RatingBucket,
): Promise<void> {
  // Lock-then-upsert: SELECT FOR UPDATE pins existing rows; if a side has no
  // row yet in this bucket it gets the default 1200 and is created on the
  // first UPDATE via the INSERT … ON CONFLICT path below.
  const { rows } = await client.query<{ user_id: string; elo_rating: number }>(
    `SELECT user_id, elo_rating FROM user_ratings
     WHERE user_id = ANY($1) AND variant = $2 AND time_class = $3
     FOR UPDATE`,
    [[whiteUserId, blackUserId], bucket.variant, bucket.timeClass],
  );
  const whiteBefore = rows.find((r) => r.user_id === whiteUserId)?.elo_rating ?? 1200;
  const blackBefore = rows.find((r) => r.user_id === blackUserId)?.elo_rating ?? 1200;

  const { newWhite, newBlack } = computeElo(whiteBefore, blackBefore, result);

  await upsertBucketRating(client, whiteUserId, bucket, newWhite);
  await upsertBucketRating(client, blackUserId, bucket, newBlack);

  await client.query(
    `UPDATE game_participants
     SET elo_before = $2, elo_after = $3
     WHERE game_id = $1 AND color = 'white'`,
    [roomId, whiteBefore, newWhite],
  );
  await client.query(
    `UPDATE game_participants
     SET elo_before = $2, elo_after = $3
     WHERE game_id = $1 AND color = 'black'`,
    [roomId, blackBefore, newBlack],
  );
}

async function upsertBucketRating(
  client: pg.PoolClient,
  userId: string,
  bucket: RatingBucket,
  newRating: number,
): Promise<void> {
  await client.query(
    `INSERT INTO user_ratings (user_id, variant, time_class, elo_rating, games_played, updated_at)
     VALUES ($1, $2, $3, $4, 1, now())
     ON CONFLICT (user_id, variant, time_class) DO UPDATE
       SET elo_rating   = EXCLUDED.elo_rating,
           games_played = user_ratings.games_played + 1,
           updated_at   = now()`,
    [userId, bucket.variant, bucket.timeClass, newRating],
  );
}

async function withParticipants<T extends GameRecord>(records: T[]): Promise<T[]> {
  if (records.length === 0) return records;
  const participants = await loadGameParticipants(records.map((record) => record.roomId));
  return records.map((record) => {
    const recordParticipants = participants.get(record.roomId);
    return {
      ...record,
      participants: recordParticipants && recordParticipants.length > 0
        ? recordParticipants
        : fallbackParticipantsForRecord(record),
    };
  });
}

async function loadGameParticipants(roomIds: string[]): Promise<Map<string, GameParticipant[]>> {
  const { rows } = await getPool().query<{
    game_id: string;
    color: Color;
    subject_type: GameParticipantSubjectType;
    subject_id: string | null;
    display_name: string;
    visibility: GameVisibility;
  }>(
    `SELECT game_id, color, subject_type, subject_id, display_name, visibility
     FROM game_participants
     WHERE game_id = ANY($1)
     ORDER BY game_id, CASE color WHEN 'white' THEN 0 ELSE 1 END`,
    [roomIds],
  );
  const byGame = new Map<string, GameParticipant[]>();
  for (const row of rows) {
    const participant: GameParticipant = {
      color: row.color,
      displayName: row.display_name,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      visibility: row.visibility,
    };
    byGame.set(row.game_id, [...(byGame.get(row.game_id) ?? []), participant]);
  }
  return byGame;
}

function defaultParticipantsForSummary(
  summary: GameSummary,
  mode: GameMode,
  visibility: GameVisibility,
): GameParticipant[] {
  return [
    defaultParticipantForColor('white', summary.whiteClient, summary.whiteName, mode, visibility),
    defaultParticipantForColor('black', summary.blackClient, summary.blackName, mode, visibility),
  ];
}

function fallbackParticipantsForRecord(record: GameRecord): GameParticipant[] {
  const eve = record as Partial<RecentEveGameRecord>;
  return [
    fallbackParticipantForColor('white', record.whiteName, record.mode, record.visibility, eve.whiteEngineId ?? null),
    fallbackParticipantForColor('black', record.blackName, record.mode, record.visibility, eve.blackEngineId ?? null),
  ];
}

function defaultParticipantForColor(
  color: Color,
  clientId: string | null,
  displayName: string | null,
  mode: GameMode,
  visibility: GameVisibility,
): GameParticipant {
  if (mode === 'imported' || mode === 'manual') {
    return {
      color,
      displayName: displayName ?? capitalizeColor(color),
      subjectType: mode,
      subjectId: null,
      visibility,
    };
  }
  if (clientId && isEngineIdentity(clientId)) {
    const engineVersionId = canonicalEngineVersionId(clientId);
    return {
      color,
      displayName: displayName ?? engineVersionDisplayName(engineVersionId),
      subjectType: 'engine-version',
      subjectId: engineVersionId,
      visibility,
    };
  }
  return {
    color,
    displayName: displayName ?? 'Guest',
    subjectType: 'guest',
    subjectId: null,
    visibility,
  };
}

function fallbackParticipantForColor(
  color: Color,
  displayName: string | null,
  mode: GameMode,
  visibility: GameVisibility,
  engineVersionId: string | null,
): GameParticipant {
  if (engineVersionId) {
    return {
      color,
      displayName: displayName ?? engineVersionDisplayName(engineVersionId),
      subjectType: 'engine-version',
      subjectId: engineVersionId,
      visibility,
    };
  }
  if (mode === 'imported' || mode === 'manual') {
    return {
      color,
      displayName: displayName ?? capitalizeColor(color),
      subjectType: mode,
      subjectId: null,
      visibility,
    };
  }
  return {
    color,
    displayName: displayName ?? 'Guest',
    subjectType: 'guest',
    subjectId: null,
    visibility,
  };
}

function isEngineIdentity(clientId: string): boolean {
  return clientId === 'random-engine'
    || clientId === 'engine:white'
    || clientId === 'engine:black'
    || clientId.startsWith('engine:')
    || clientId.startsWith('builtin-')
    || clientId.startsWith('python-');
}

function canonicalEngineVersionId(clientId: string): string {
  if (clientId === 'random-engine') return 'builtin-random-legal';
  return clientId;
}

function capitalizeColor(color: Color): string {
  return color === 'white' ? 'White' : 'Black';
}

type UserRow = {
  id: string;
  email: string;
  email_verified_at: Date | null;
  handle: string;
  handle_changed_at: Date | null;
  display_name: string;
  display_name_changed_at: Date | null;
  profile_visibility: UserAccount['profileVisibility'];
  account_role: AccountRole;
  elo_rating: number;
  created_at: Date;
  updated_at: Date;
};

function userFromRow(row: UserRow): UserAccount {
  return {
    id: row.id,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    handle: row.handle,
    handleChangedAt: row.handle_changed_at,
    displayName: row.display_name,
    displayNameChangedAt: row.display_name_changed_at,
    profileVisibility: row.profile_visibility,
    accountRole: row.account_role,
    eloRating: row.elo_rating,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505';
}

function getPool(): pg.Pool {
  if (!pool) throw new Error('persistence not initialized — call init(connectionString) first');
  return pool;
}
