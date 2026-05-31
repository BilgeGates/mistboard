import { TIME_CONTROLS } from '@mistboard/game';
import { PROVISIONAL_RD } from './glicko.js';
import { getPool } from './persistence-db.js';
import type { GameMode, GameTermination, GameVisibility } from './persistence-game-lifecycle.js';
import type { GameParticipantColor, GameResult, ProfileGameRecord } from './persistence-games.js';
import { attachGameParticipants } from './persistence-games.js';
import type { RatingTimeClass, RatingVariant } from './rating-buckets.js';

// Build a `CASE WHEN ... THEN 'bullet' ... END` fragment from the canonical
// time-controls list so adding a TC to packages/game/src/time-controls.ts
// auto-extends the persistence layer's classifier. Values are numeric literals
// and a closed set of TimeClass string literals — no SQL injection surface.
const TIME_CLASS_CASE_SQL = `CASE\n${TIME_CONTROLS.map(
  (tc) =>
    `         WHEN games.initial_ms = ${tc.initialMs} AND games.increment_ms = ${tc.incrementMs} THEN '${tc.timeClass}'`,
).join('\n')}\n         ELSE NULL\n       END`;

export type AccountRole = 'player' | 'test' | 'admin';

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
  // Atomic attempt-and-check. Every guess against a live, non-exhausted
  // challenge burns one attempt; a correct guess additionally marks the
  // challenge consumed and returns the email. A wrong guess increments
  // attempt_count without matching code_hash, so once attempt_count reaches
  // max_attempts the row no longer satisfies the WHERE clause and the
  // challenge is dead well before its TTL — closing the brute-force window on
  // the 8-digit code. Single statement so concurrent confirms can't race past
  // the cap.
  const { rows } = await getPool().query<{ email: string }>(
    `UPDATE email_login_challenges
     SET attempt_count = attempt_count + 1,
         consumed_at = CASE WHEN code_hash = $2 THEN $3 ELSE consumed_at END
     WHERE id = $1
       AND consumed_at IS NULL
       AND expires_at > $3
       AND attempt_count < max_attempts
     RETURNING CASE WHEN consumed_at = $3 THEN email ELSE NULL END AS email`,
    [id, codeHash, at],
  );
  return rows[0]?.email ? { email: rows[0].email } : null;
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
    player_color: GameParticipantColor;
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
    games: await attachGameParticipants(games),
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
