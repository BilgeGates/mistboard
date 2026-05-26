import type { Color } from '@mistboard/game';
import { engineVersionDisplayName } from './engine-registry.js';
import { getPool } from './persistence-db.js';
import type {
  GameMode,
  GameReviewStatus,
  GameTermination,
  GameVisibility,
} from './persistence-game-lifecycle.js';
import { bucketForGame } from './rating-buckets.js';
import { applyRatedGameResult, type RatedResult } from './rating-store.js';

const MIN_TIMEOUT_SOURCE_PLY_COUNT = 10;
const MIN_TV_PVP_PLY_COUNT = 30;

export type GameResult = 'white-wins' | 'black-wins' | 'draw';
export type GameParticipantSubjectType =
  | 'guest'
  | 'user'
  | 'engine-version'
  | 'manual'
  | 'imported';

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
  variants?: readonly string[];
};

export type WatchSealedGameOptions = {
  activeWindowMs?: number;
  now?: Date;
  variants?: readonly string[];
};

export type CompletedGameFilters = {
  endedFrom: Date;
  endedTo: Date;
  limit?: number;
  mode?: GameMode;
};

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
  return attachGameParticipants(rows.map(gameRecordFromRow));
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
  return attachGameParticipants(rows.map(recentEveGameRecordFromRow));
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
  return attachGameParticipants(rows.map(recentEveGameRecordFromRow));
}

export async function listWatchUnlockedGames(
  options: WatchUnlockedGameOptions = {},
): Promise<RecentEveGameRecord[]> {
  const boundedLimit = Math.max(1, Math.min(options.limit ?? 20, 50));
  const unlockWindowMs = Math.max(1, options.unlockWindowMs ?? 2 * 60 * 60 * 1000);
  const now = options.now ?? new Date();
  const unlockedSince = new Date(now.getTime() - unlockWindowMs);
  const variants = watchVariantFilter(options.variants);
  const variantClause = variants ? 'AND games.variant = ANY($6::text[])' : '';
  const values: unknown[] = [
    MIN_TIMEOUT_SOURCE_PLY_COUNT,
    boundedLimit,
    MIN_TV_PVP_PLY_COUNT,
    unlockedSince,
    now,
  ];
  if (variants) values.push(variants);
  const { rows } = await getPool().query<RecentEveGameRow>(
    `SELECT ${RECENT_EVE_SELECT_COLUMNS}
     FROM games
     LEFT JOIN eve_games ON eve_games.game_id = games.room_id
     WHERE games.status = 'completed'
       ${variantClause}
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
    values,
  );
  return attachGameParticipants(rows.map(recentEveGameRecordFromRow));
}

export async function countWatchSealedGames(options: WatchSealedGameOptions = {}): Promise<number> {
  const activeWindowMs = Math.max(1, options.activeWindowMs ?? 2 * 60 * 60 * 1000);
  const nowMs = (options.now ?? new Date()).getTime();
  const activeSinceMs = nowMs - activeWindowMs;
  const variants = watchVariantFilter(options.variants);
  const variantClause = variants ? 'AND games.variant = ANY($3::text[])' : '';
  const values: unknown[] = [activeSinceMs, nowMs];
  if (variants) values.push(variants);
  const { rows } = await getPool().query<{ count: number }>(
    `WITH last_events AS (
       SELECT DISTINCT ON (events.room_id)
              events.room_id,
              events.type,
              events.payload
       FROM events
       JOIN games ON games.room_id = events.room_id
       WHERE games.status = 'running'
       ORDER BY events.room_id, events.seq DESC
     )
     SELECT count(*)::int AS count
     FROM games
     JOIN last_events ON last_events.room_id = games.room_id
     WHERE games.status = 'running'
       ${variantClause}
       AND games.mode IN ('pvp', 'pve', 'eve')
       AND games.visibility <> 'private'
       AND last_events.type IN ('clock-started', 'draft-start-resolved', 'move-played', 'resume')
       AND (last_events.payload->>'at')::bigint >= $1
       AND (last_events.payload->>'at')::bigint <= $2`,
    values,
  );
  return rows[0]?.count ?? 0;
}

function watchVariantFilter(variants: readonly string[] | undefined): string[] | null {
  if (!variants || variants.length === 0) return null;
  const unique = [...new Set(variants.filter((variant) => variant.length > 0))];
  return unique.length > 0 ? unique : null;
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
  return attachGameParticipants(rows.map(recentEveGameRecordFromRow));
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
  const [record] = await attachGameParticipants([recentEveGameRecordFromRow(row)]);
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

export async function attachGameParticipants<T extends GameRecord>(records: T[]): Promise<T[]> {
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
