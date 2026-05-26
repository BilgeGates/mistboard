import { type Color, TIME_CONTROLS } from '@mistboard/game';
import { engineVersionDisplayName } from './engine-registry.js';
import { PROVISIONAL_RD } from './glicko.js';
import { getPool } from './persistence-db.js';
import type {
  GameMode,
  GameReviewStatus,
  GameTermination,
  GameVisibility,
} from './persistence-game-lifecycle.js';
import { bucketForGame, type RatingTimeClass, type RatingVariant } from './rating-buckets.js';
import { applyRatedGameResult, type RatedResult } from './rating-store.js';

export { close, init, isInitialized, probeDb } from './persistence-db.js';
export type {
  GameDebugArtifactInput,
  GameDebugArtifactPayload,
  GameDebugArtifactSummary,
  GameMode,
  GameReviewStatus,
  GameTermination,
  GameVisibility,
  RunningGameSummary,
  StalePausedFinalizeRecord,
} from './persistence-game-lifecycle.js';
export {
  abortRunningGame,
  abortStaleGuestPrestartGames,
  appendEvent,
  finalizeStalePausedRooms,
  getGameLifecycleStatus,
  listActiveRoomIds,
  listGameDebugArtifactPayloads,
  listGameDebugArtifactSummaries,
  loadRoom,
  recordGameDebugArtifact,
  recordGameStart,
} from './persistence-game-lifecycle.js';
export type { RoomSeatTokenRecord } from './persistence-seat-tokens.js';
export {
  loadRoomSeatTokens,
  replaceRoomSeatTokens,
  touchRoomSeatToken,
  upsertRoomSeatToken,
  verifyRoomSeatToken,
} from './persistence-seat-tokens.js';

// Build a `CASE WHEN ... THEN 'bullet' ... END` fragment from the canonical
// time-controls list so adding a TC to packages/game/src/time-controls.ts
// auto-extends the persistence layer's classifier. Values are numeric literals
// and a closed set of TimeClass string literals — no SQL injection surface.
const TIME_CLASS_CASE_SQL = `CASE\n${TIME_CONTROLS.map(
  (tc) =>
    `         WHEN games.initial_ms = ${tc.initialMs} AND games.increment_ms = ${tc.incrementMs} THEN '${tc.timeClass}'`,
).join('\n')}\n         ELSE NULL\n       END`;

const MIN_TIMEOUT_SOURCE_PLY_COUNT = 10;
const MIN_TV_PVP_PLY_COUNT = 30;

export type GameResult = 'white-wins' | 'black-wins' | 'draw';
export type GameParticipantSubjectType =
  | 'guest'
  | 'user'
  | 'engine-version'
  | 'manual'
  | 'imported';
export type AccountRole = 'player' | 'test' | 'admin';

export type GameParticipant = {
  color: Color;
  displayName: string;
  subjectType: GameParticipantSubjectType;
  subjectId: string | null;
  visibility: GameVisibility;
  // Rating before/after this game, for rated games only (null otherwise). Lets
  // the game page show the +/- delta. Optional so the many non-DB participant
  // constructors don't need to supply it.
  ratingBefore?: number | null;
  ratingAfter?: number | null;
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
  region?: string | null;
  reviewStatus?: GameReviewStatus;
  visibility?: GameVisibility;
  participants?: GameParticipant[];
  initialMs?: number | null;
  incrementMs?: number | null;
  hiddenDraft960?: boolean | null;
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
  initialMs: number | null;
  incrementMs: number | null;
};

export type WatchUnlockedGameOptions = {
  limit?: number;
  now?: Date;
  unlockWindowMs?: number;
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
  // RD still above the provisional threshold — rating not yet settled. Shown on
  // the leaderboard with a "?" marker; ranked by conservative rating so it sorts
  // low until it settles.
  provisional: boolean;
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

export type PublicProfileUser = {
  handle: string;
  displayName: string;
  profileVisibility: UserAccount['profileVisibility'];
  accountRole: AccountRole;
  createdAt: Date;
};

export type ProfileBucketRating = {
  variant: RatingVariant;
  timeClass: RatingTimeClass;
  eloRating: number | null;
  // Count of rated games only. user_ratings.games_played is incremented per
  // rated game; casual games are not counted here. Activity in casual buckets
  // is reflected by the row existing (see UserProfile.ratings filtering).
  ratedGamesPlayed: number;
  // Count of all completed games (rated + casual). Used to decide whether
  // a row should appear for a variant; not surfaced as a number in the UI.
  totalGamesPlayed: number;
  // Rating not yet settled (RD above threshold). Client shows a "?"; RD itself
  // is intentionally not exposed (confusing to players).
  provisional: boolean;
};

export type UserProfile = {
  user: PublicProfileUser;
  ratings: ProfileBucketRating[];
  games: ProfileGameRecord[];
};

export interface SiteStats {
  accounts: number;
  games: number;
  publicGames: number;
  last7dGames: number;
  gamesByResult: Record<string, number>;
  gamesByVariant: Record<string, number>;
}

// Canonical site totals from Postgres (durable, unlike the in-memory
// /api/live-stats). Admin-gated; see routes/meta.ts. count(*)::int is safe at
// our scale (well under 2^31).
export async function getSiteStats(): Promise<SiteStats> {
  const pool = getPool();
  const scalar = await pool.query<{
    accounts: number;
    games: number;
    public_games: number;
    last7d_games: number;
  }>(
    `SELECT
       (SELECT count(*) FROM users)::int AS accounts,
       (SELECT count(*) FROM games)::int AS games,
       (SELECT count(*) FROM games WHERE visibility = 'public')::int AS public_games,
       (SELECT count(*) FROM games WHERE ended_at > now() - INTERVAL '7 days')::int AS last7d_games`,
  );
  const byResult = await pool.query<{ result: string; n: number }>(
    `SELECT result, count(*)::int AS n FROM games GROUP BY result ORDER BY n DESC`,
  );
  const byVariant = await pool.query<{ variant: string; n: number }>(
    `SELECT variant, count(*)::int AS n FROM games GROUP BY variant ORDER BY n DESC`,
  );
  const row = scalar.rows[0];
  return {
    accounts: row?.accounts ?? 0,
    games: row?.games ?? 0,
    publicGames: row?.public_games ?? 0,
    last7dGames: row?.last7d_games ?? 0,
    gamesByResult: Object.fromEntries(byResult.rows.map((r) => [r.result, r.n])),
    gamesByVariant: Object.fromEntries(byVariant.rows.map((r) => [r.variant, r.n])),
  };
}

export interface FeedbackSubmissionInput {
  id: string;
  message: string;
  email: string | null;
  path: string | null;
  userId: string | null;
  userAgent: string | null;
  ipHash: string | null;
}

export async function insertFeedbackSubmission(input: FeedbackSubmissionInput): Promise<void> {
  await getPool().query(
    `INSERT INTO feedback_submissions (id, message, email, path, user_id, user_agent, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [input.id, input.message, input.email, input.path, input.userId, input.userAgent, input.ipHash],
  );
}

export async function countAnonFeedbackSubmissionsSince(
  ipHash: string,
  since: Date,
): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM feedback_submissions
      WHERE user_id IS NULL
        AND ip_hash = $1
        AND created_at > $2`,
    [ipHash, since],
  );
  return Number(result.rows[0]?.count ?? '0');
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
      if (
        current.handleChangedAt &&
        at.getTime() - current.handleChangedAt.getTime() < handleCooldownMs
      ) {
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

export async function revokeAccountSession(
  sessionId: string,
  tokenHash: string,
  at: Date,
): Promise<void> {
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
  const games = gameRows.map(
    (row): ProfileGameRecord => ({
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
    }),
  );

  const { rows: ratingRows } = await getPool().query<{
    variant: RatingVariant;
    time_class: RatingTimeClass;
    elo_rating: number;
    rating_deviation: number;
    games_played: number;
  }>(
    `SELECT variant, time_class, elo_rating, rating_deviation, games_played
     FROM user_ratings
     WHERE user_id = $1`,
    [user.id],
  );
  const ratingByBucket = new Map<
    string,
    { eloRating: number; gamesPlayed: number; ratingDeviation: number }
  >();
  for (const row of ratingRows) {
    ratingByBucket.set(`${row.variant}:${row.time_class}`, {
      eloRating: row.elo_rating,
      gamesPlayed: row.games_played,
      ratingDeviation: row.rating_deviation,
    });
  }

  // Bucketed game counts derived from time control, so the rating section
  // shows activity per bucket even pre-rated-flip when user_ratings is empty.
  const { rows: bucketCountRows } = await getPool().query<{
    variant: RatingVariant;
    time_class: RatingTimeClass;
    games_played: string;
  }>(
    `SELECT
       CASE WHEN COALESCE(games.hidden_draft960, false)
            THEN 'fog_draft960' ELSE 'fog' END AS variant,
       ${TIME_CLASS_CASE_SQL} AS time_class,
       COUNT(*)::text AS games_played
     FROM game_participants
     JOIN games ON games.room_id = game_participants.game_id
     WHERE game_participants.subject_type = 'user'
       AND game_participants.subject_id = $1
       AND games.status = 'completed'
       ${visibilityClause}
     GROUP BY 1, 2`,
    [user.id],
  );
  const bucketGameCounts = new Map<string, number>();
  for (const row of bucketCountRows) {
    if (!row.time_class) continue;
    bucketGameCounts.set(`${row.variant}:${row.time_class}`, Number(row.games_played));
  }

  const bucketKeys = new Set<string>([...ratingByBucket.keys(), ...bucketGameCounts.keys()]);
  const ratings: ProfileBucketRating[] = [];
  for (const key of bucketKeys) {
    const [variant, timeClass] = key.split(':') as [RatingVariant, RatingTimeClass];
    const rating = ratingByBucket.get(key);
    const totalGames = bucketGameCounts.get(key) ?? 0;
    if (totalGames === 0 && !rating) continue;
    ratings.push({
      variant,
      timeClass,
      eloRating: rating?.eloRating ?? null,
      ratedGamesPlayed: rating?.gamesPlayed ?? 0,
      totalGamesPlayed: totalGames,
      provisional: rating ? rating.ratingDeviation > PROVISIONAL_RD : false,
    });
  }

  return {
    user: {
      handle: user.handle,
      displayName: user.displayName,
      profileVisibility: user.profileVisibility,
      accountRole: user.accountRole,
      createdAt: user.createdAt,
    },
    ratings,
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
    rating_deviation: number;
    games_played: number;
  }>(
    // Rank by conservative rating (rating - 2*RD): a high-uncertainty player
    // can't top the board on noise, so a one-game fluke sorts low. Provisional
    // players (RD above threshold) are shown — marked with "?" client-side — so
    // the board isn't barren at low liquidity; their low conservative rating
    // keeps them out of the top until they settle. Only never-played rows hide.
    `SELECT RANK() OVER (ORDER BY (r.elo_rating - 2 * r.rating_deviation) DESC) AS rank,
            u.handle, u.display_name, r.elo_rating, r.rating_deviation, r.games_played
     FROM user_ratings r
     JOIN users u ON u.id = r.user_id
     WHERE r.variant = $1 AND r.time_class = $2
       AND u.profile_visibility IN ('public', 'unlisted')
       AND r.games_played > 0
     ORDER BY (r.elo_rating - 2 * r.rating_deviation) DESC
     LIMIT $3`,
    [query.variant, query.timeClass, bounded],
  );
  return rows.map((row) => ({
    rank: Number(row.rank),
    handle: row.handle,
    displayName: row.display_name,
    eloRating: row.elo_rating,
    gamesPlayed: row.games_played,
    provisional: row.rating_deviation > PROVISIONAL_RD,
  }));
}

// ── Game row types + mappers ──────────────────────────────────────────────
// Five list-style queries (listCorpusGames, listRecentEveGames,
// listRecentPublicGames, listCompletedGames, getGameSummary) all return rows
// that map 1:1 into GameRecord/RecentEveGameRecord. Define the row shape and
// the mapper once.

type GameRow = {
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
};

type RecentEveGameRow = GameRow & {
  job_id: string | null;
  game_index: number | null;
  white_engine_id: string | null;
  black_engine_id: string | null;
  time_control: Record<string, unknown> | null;
  initial_ms: number | null;
  increment_ms: number | null;
};

// `games.` prefix because every recent-eve query LEFT JOINs eve_games.
const RECENT_EVE_SELECT_COLUMNS = `games.room_id, games.variant, games.mode, games.result, games.termination,
            games.ply_count, games.started_at, games.ended_at,
            games.white_name, games.black_name, games.corpus_id,
            games.initial_ms, games.increment_ms,
            eve_games.job_id, eve_games.game_index,
            eve_games.white_engine_id, eve_games.black_engine_id,
            eve_games.time_control,
            games.visibility`;

function gameRecordFromRow(row: GameRow): GameRecord {
  return {
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
  };
}

function recentEveGameRecordFromRow(row: RecentEveGameRow): RecentEveGameRecord {
  return {
    ...gameRecordFromRow(row),
    jobId: row.job_id,
    gameIndex: row.game_index,
    whiteEngineId: row.white_engine_id,
    blackEngineId: row.black_engine_id,
    timeControl: row.time_control,
    initialMs: row.initial_ms,
    incrementMs: row.increment_ms,
  };
}

export async function listCorpusGames(corpusId: string, limit = 100): Promise<GameRecord[]> {
  const { rows } = await getPool().query<GameRow>(
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
  return withParticipants(rows.map(gameRecordFromRow));
}

export async function listRecentEveGames(limit = 12): Promise<RecentEveGameRecord[]> {
  const { rows } = await getPool().query<RecentEveGameRow>(
    `SELECT ${RECENT_EVE_SELECT_COLUMNS}
     FROM games
     LEFT JOIN eve_games ON eve_games.game_id = games.room_id
     WHERE games.mode = 'eve'
       AND games.status = 'completed'
       AND NOT (games.termination = 'timeout' AND games.ply_count < $1)
     ORDER BY games.ended_at DESC, games.room_id DESC
    LIMIT $2`,
    [MIN_TIMEOUT_SOURCE_PLY_COUNT, limit],
  );
  return withParticipants(rows.map(recentEveGameRecordFromRow));
}

export async function listRecentPublicGames(limit = 10): Promise<RecentEveGameRecord[]> {
  const boundedLimit = Math.max(1, Math.min(limit, 50));
  const { rows } = await getPool().query<RecentEveGameRow>(
    `SELECT ${RECENT_EVE_SELECT_COLUMNS}
     FROM games
     LEFT JOIN eve_games ON eve_games.game_id = games.room_id
     WHERE games.status = 'completed'
       AND NOT (games.termination = 'timeout' AND games.ply_count < $1)
       AND NOT (games.mode = 'pvp' AND games.ply_count < $3)
       AND NOT (games.mode = 'pve' AND games.ply_count < 2)
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
    [MIN_TIMEOUT_SOURCE_PLY_COUNT, boundedLimit, MIN_TV_PVP_PLY_COUNT],
  );
  return withParticipants(rows.map(recentEveGameRecordFromRow));
}

export async function listWatchUnlockedGames(
  options: WatchUnlockedGameOptions = {},
): Promise<RecentEveGameRecord[]> {
  const boundedLimit = Math.max(1, Math.min(options.limit ?? 20, 50));
  const unlockWindowMs = Math.max(1, options.unlockWindowMs ?? 2 * 60 * 60 * 1000);
  const now = options.now ?? new Date();
  const unlockedSince = new Date(now.getTime() - unlockWindowMs);
  const { rows } = await getPool().query<RecentEveGameRow>(
    `SELECT ${RECENT_EVE_SELECT_COLUMNS}
     FROM games
     LEFT JOIN eve_games ON eve_games.game_id = games.room_id
     WHERE games.status = 'completed'
       AND games.mode IN ('pvp', 'pve', 'eve')
       AND games.ended_at >= $4
       AND games.ended_at <= $5
       AND NOT (games.termination = 'timeout' AND games.ply_count < $1)
       AND NOT (games.mode = 'pvp' AND games.ply_count < $3)
       AND NOT (games.mode = 'pve' AND games.ply_count < 2)
       AND EXISTS (
         SELECT 1
         FROM events
         WHERE events.room_id = games.room_id
         LIMIT 1
       )
       AND (
         games.visibility = 'public'
         OR (games.mode IN ('pve', 'eve') AND games.visibility <> 'private')
       )
     ORDER BY games.ended_at DESC, games.room_id DESC
     LIMIT $2`,
    [MIN_TIMEOUT_SOURCE_PLY_COUNT, boundedLimit, MIN_TV_PVP_PLY_COUNT, unlockedSince, now],
  );
  return withParticipants(rows.map(recentEveGameRecordFromRow));
}

export async function countWatchSealedGames(): Promise<number> {
  const { rows } = await getPool().query<{ count: number }>(
    `SELECT count(*)::int AS count
     FROM games
     WHERE status = 'running'
       AND mode IN ('pvp', 'pve', 'eve')
       AND visibility <> 'private'`,
  );
  return rows[0]?.count ?? 0;
}

export async function listCompletedGames(
  filters: CompletedGameFilters,
): Promise<RecentEveGameRecord[]> {
  const limit = Math.max(1, Math.min(filters.limit ?? 100, 250));
  const values: unknown[] = [filters.endedFrom, filters.endedTo];
  const modeClause = filters.mode ? 'AND games.mode = $3' : '';
  if (filters.mode) values.push(filters.mode);
  values.push(limit);
  const limitParam = values.length;

  const { rows } = await getPool().query<RecentEveGameRow>(
    `SELECT ${RECENT_EVE_SELECT_COLUMNS}
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
  return withParticipants(rows.map(recentEveGameRecordFromRow));
}

export async function getGameSummary(roomId: string): Promise<RecentEveGameRecord | null> {
  const { rows } = await getPool().query<RecentEveGameRow>(
    `SELECT ${RECENT_EVE_SELECT_COLUMNS}
     FROM games
     LEFT JOIN eve_games ON eve_games.game_id = games.room_id
     WHERE games.room_id = $1
       AND games.status = 'completed'
     LIMIT 1`,
    [roomId],
  );
  const row = rows[0];
  if (!row) return null;
  const [record] = await withParticipants([recentEveGameRecordFromRow(row)]);
  return record ?? null;
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
          initial_ms, increment_ms, hidden_draft960, region)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'completed', $14, $15, $16, $17, $18, $19, $20)
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
         region = EXCLUDED.region,
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
        summary.region ?? 'global',
      ],
    );
    const participants =
      summary.participants ?? defaultParticipantsForSummary(summary, mode, visibility);
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
        whiteParticipant?.subjectType === 'user' &&
        whiteParticipant.subjectId &&
        blackParticipant?.subjectType === 'user' &&
        blackParticipant.subjectId
      ) {
        await applyRatedGameResult(
          client,
          roomId,
          whiteParticipant.subjectId,
          blackParticipant.subjectId,
          summary.result as RatedResult,
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

async function withParticipants<T extends GameRecord>(records: T[]): Promise<T[]> {
  if (records.length === 0) return records;
  const participants = await loadGameParticipants(records.map((record) => record.roomId));
  return records.map((record) => {
    const recordParticipants = participants.get(record.roomId);
    return {
      ...record,
      participants:
        recordParticipants && recordParticipants.length > 0
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
    elo_before: number | null;
    elo_after: number | null;
  }>(
    `SELECT game_id, color, subject_type, subject_id, display_name, visibility,
            elo_before, elo_after
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
      // Only present for rated games; omitted (not null) for unrated so callers
      // and tests that don't care see the original participant shape.
      ...(row.elo_before != null ? { ratingBefore: row.elo_before } : {}),
      ...(row.elo_after != null ? { ratingAfter: row.elo_after } : {}),
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
    fallbackParticipantForColor(
      'white',
      record.whiteName,
      record.mode,
      record.visibility,
      eve.whiteEngineId ?? null,
    ),
    fallbackParticipantForColor(
      'black',
      record.blackName,
      record.mode,
      record.visibility,
      eve.blackEngineId ?? null,
    ),
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
  return (
    clientId === 'random-engine' ||
    clientId === 'engine:white' ||
    clientId === 'engine:black' ||
    clientId.startsWith('engine:') ||
    clientId.startsWith('builtin-') ||
    clientId.startsWith('python-')
  );
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
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  );
}
