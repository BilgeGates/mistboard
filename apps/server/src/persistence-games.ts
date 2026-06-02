import type { Color, TimeClass, XiangqiColor } from '@mistboard/game';
import { TIME_CONTROLS } from '@mistboard/game';
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

export type GameResult = 'white-wins' | 'black-wins' | 'red-wins' | 'draw';
export type GameParticipantColor = Color | XiangqiColor;
export type GameParticipantSubjectType =
  | 'guest'
  | 'user'
  | 'engine-version'
  | 'manual'
  | 'imported';

export type GameParticipant = {
  color: GameParticipantColor;
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
  playerColor: GameParticipantColor;
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

export type EngineVersionStats = {
  engineId: string;
  name: string | null;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  lastPlayedAt: string | null;
};

// Per-engine-version record across all completed engine-vs-engine games. Each
// game contributes one row per side via the UNION, so a version is credited for
// every seat it occupied. Names come from the engine_versions registry
// (LEFT JOIN, so an id with no registry row still appears under its raw id).
export async function listEngineVersionStats(): Promise<EngineVersionStats[]> {
  const { rows } = await getPool().query<{
    engine_id: string;
    name: string | null;
    games: string;
    wins: string;
    losses: string;
    draws: string;
    last_played_at: Date | null;
  }>(
    `WITH sides AS (
       SELECT eve_games.white_engine_id AS engine_id,
              CASE games.result
                WHEN 'white-wins' THEN 'win'
                WHEN 'black-wins' THEN 'loss'
                WHEN 'draw' THEN 'draw'
              END AS outcome,
              games.ended_at
       FROM eve_games
       JOIN games ON games.room_id = eve_games.game_id
       WHERE games.status = 'completed' AND eve_games.white_engine_id IS NOT NULL
       UNION ALL
       SELECT eve_games.black_engine_id AS engine_id,
              CASE games.result
                WHEN 'black-wins' THEN 'win'
                WHEN 'white-wins' THEN 'loss'
                WHEN 'draw' THEN 'draw'
              END AS outcome,
              games.ended_at
       FROM eve_games
       JOIN games ON games.room_id = eve_games.game_id
       WHERE games.status = 'completed' AND eve_games.black_engine_id IS NOT NULL
     )
     SELECT sides.engine_id,
            engine_versions.name,
            COUNT(*) AS games,
            COUNT(*) FILTER (WHERE sides.outcome = 'win') AS wins,
            COUNT(*) FILTER (WHERE sides.outcome = 'loss') AS losses,
            COUNT(*) FILTER (WHERE sides.outcome = 'draw') AS draws,
            MAX(sides.ended_at) AS last_played_at
     FROM sides
     LEFT JOIN engine_versions ON engine_versions.id = sides.engine_id
     GROUP BY sides.engine_id, engine_versions.name
     ORDER BY COUNT(*) DESC, sides.engine_id`,
  );
  return rows.map((row) => ({
    engineId: row.engine_id,
    name: row.name,
    games: Number(row.games),
    wins: Number(row.wins),
    losses: Number(row.losses),
    draws: Number(row.draws),
    lastPlayedAt: row.last_played_at ? row.last_played_at.toISOString() : null,
  }));
}

export type EngineModeRecord = {
  games: number;
  wins: number;
  losses: number;
  draws: number;
};

export type EngineProfile = {
  engineId: string;
  name: string | null;
  // vs-humans record — the headline. EvE (self-play / bakeoff) is secondary.
  pve: EngineModeRecord;
  eve: EngineModeRecord;
  recentPveGames: ProfileGameRecord[];
};

const EMPTY_ENGINE_RECORD: EngineModeRecord = { games: 0, wins: 0, losses: 0, draws: 0 };

// Per-engine-version profile. Sources from game_participants (subject_type
// 'engine-version'), the same polymorphic seat model the user profile reads —
// so it works for PvE (one engine seat) and EvE (two) alike, split by mode.
// PvE is the meaningful competitive record; EvE is internal calibration.
export async function getEngineProfile(engineId: string): Promise<EngineProfile | null> {
  const pool = getPool();

  const nameResult = await pool.query<{ name: string | null }>(
    'SELECT name FROM engine_versions WHERE id = $1',
    [engineId],
  );

  // Per-mode W/L/D from the engine's own perspective (its seat colour vs result).
  const recordResult = await pool.query<{
    mode: GameMode;
    games: string;
    wins: string;
    losses: string;
    draws: string;
  }>(
    `SELECT games.mode,
            COUNT(*) AS games,
            COUNT(*) FILTER (
              WHERE (game_participants.color = 'white' AND games.result = 'white-wins')
                 OR (game_participants.color = 'black' AND games.result = 'black-wins')
            ) AS wins,
            COUNT(*) FILTER (
              WHERE (game_participants.color = 'white' AND games.result = 'black-wins')
                 OR (game_participants.color = 'black' AND games.result = 'white-wins')
            ) AS losses,
            COUNT(*) FILTER (WHERE games.result = 'draw') AS draws
     FROM game_participants
     JOIN games ON games.room_id = game_participants.game_id
     WHERE game_participants.subject_type = 'engine-version'
       AND game_participants.subject_id = $1
       AND games.status = 'completed'
     GROUP BY games.mode`,
    [engineId],
  );

  if (recordResult.rows.length === 0 && nameResult.rows.length === 0) return null;

  const byMode = new Map<string, EngineModeRecord>();
  for (const row of recordResult.rows) {
    byMode.set(row.mode, {
      games: Number(row.games),
      wins: Number(row.wins),
      losses: Number(row.losses),
      draws: Number(row.draws),
    });
  }

  const recentResult = await pool.query<RecentEngineGameRow>(
    `SELECT games.room_id, game_participants.color AS player_color,
            games.variant, games.mode, games.result, games.termination,
            games.ply_count, games.started_at, games.ended_at,
            games.white_name, games.black_name, games.corpus_id,
            COALESCE(games.rated, true) AS rated, games.visibility
     FROM game_participants
     JOIN games ON games.room_id = game_participants.game_id
     WHERE game_participants.subject_type = 'engine-version'
       AND game_participants.subject_id = $1
       AND games.mode = 'pve'
       AND games.status = 'completed'
     ORDER BY games.ended_at DESC, games.room_id DESC
     LIMIT 15`,
    [engineId],
  );
  const recentPveGames = await attachGameParticipants(
    recentResult.rows.map(engineProfileGameFromRow),
  );

  return {
    engineId,
    name: nameResult.rows[0]?.name ?? null,
    pve: byMode.get('pve') ?? EMPTY_ENGINE_RECORD,
    eve: byMode.get('eve') ?? EMPTY_ENGINE_RECORD,
    recentPveGames,
  };
}

type RecentEngineGameRow = {
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
};

function engineProfileGameFromRow(row: RecentEngineGameRow): ProfileGameRecord {
  return {
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
  };
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

// Homepage hero pool. Aim for recent, substantial PvP — real people are the
// "alive" signal — using a watch-style filter (any real finish, since human
// games end by timeout/resignation far more than king-capture). Fall back to
// decisive engine games, one per run for variety, when there isn't enough
// quality PvP yet. Both tiers require >= 30 plies so the hero never opens on a
// short or abandoned game.
const SHOWCASE_MIN_PLY = 30;

export async function listShowcaseGames(limit = 8): Promise<RecentEveGameRecord[]> {
  const bounded = Math.max(1, Math.min(limit, 24));
  const pvp = await queryShowcasePvp(bounded);
  if (pvp.length >= bounded) return pvp;
  const engine = await queryShowcaseEngine();
  return [...pvp, ...engine].slice(0, bounded);
}

// Recent substantial PvP, watch-style: any real finish except a forfeit/abandon.
async function queryShowcasePvp(limit: number): Promise<RecentEveGameRecord[]> {
  const { rows } = await getPool().query<RecentEveGameRow>(
    `SELECT ${RECENT_EVE_SELECT_COLUMNS}
     FROM games
     LEFT JOIN eve_games ON eve_games.game_id = games.room_id
     WHERE games.status = 'completed'
       AND games.visibility = 'public'
       AND games.variant IN ('dark-chess', 'fog')
       AND games.mode = 'pvp'
       AND games.termination <> 'abandonment'
       AND games.ply_count >= $1
       AND EXISTS (
         SELECT 1 FROM events WHERE events.room_id = games.room_id LIMIT 1
       )
     ORDER BY games.ended_at DESC, games.room_id DESC
     LIMIT $2`,
    [SHOWCASE_MIN_PLY, limit],
  );
  return attachGameParticipants(rows.map(recentEveGameRecordFromRow));
}

// Decisive engine-vs-engine games, one per run (the most recent in each),
// newest run first — so the fallback shows varied matchups, not N games from one
// bakeoff. EvE only (PvE human-vs-engine is excluded by design). COALESCE keeps
// corpus-less games (e.g. live EvE) individually distinct.
async function queryShowcaseEngine(): Promise<RecentEveGameRecord[]> {
  const { rows } = await getPool().query<RecentEveGameRow>(
    `SELECT DISTINCT ON (COALESCE(games.corpus_id, games.room_id)) ${RECENT_EVE_SELECT_COLUMNS}
     FROM games
     LEFT JOIN eve_games ON eve_games.game_id = games.room_id
     WHERE games.status = 'completed'
       AND games.visibility = 'public'
       AND games.variant IN ('dark-chess', 'fog')
       AND games.mode = 'eve'
       AND games.termination IN ('king-captured', 'checkmate')
       AND games.ply_count >= $1
       AND EXISTS (
         SELECT 1 FROM events WHERE events.room_id = games.room_id LIMIT 1
       )
     ORDER BY COALESCE(games.corpus_id, games.room_id), games.ended_at DESC`,
    [SHOWCASE_MIN_PLY],
  );
  const records = await attachGameParticipants(rows.map(recentEveGameRecordFromRow));
  records.sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime());
  return records;
}

export async function listWatchUnlockedGames(
  options: WatchUnlockedGameOptions = {},
): Promise<RecentEveGameRecord[]> {
  const boundedLimit = Math.max(1, Math.min(options.limit ?? 64, 64));
  const now = options.now ?? new Date();
  const variants = watchVariantFilter(options.variants);
  const variantClause = variants ? 'AND games.variant = ANY($5::text[])' : '';
  const values: unknown[] = [MIN_TIMEOUT_SOURCE_PLY_COUNT, boundedLimit, MIN_TV_PVP_PLY_COUNT, now];
  if (variants) values.push(variants);
  const { rows } = await getPool().query<RecentEveGameRow>(
    `WITH last_events AS (
       SELECT DISTINCT ON (events.room_id)
              events.room_id,
              events.type
       FROM events
       JOIN games ON games.room_id = events.room_id
       WHERE games.status = 'completed'
       ORDER BY events.room_id, events.seq DESC
     )
     SELECT ${RECENT_EVE_SELECT_COLUMNS}
     FROM games
     LEFT JOIN eve_games ON eve_games.game_id = games.room_id
     JOIN last_events ON last_events.room_id = games.room_id
     WHERE games.status = 'completed'
       ${variantClause}
       AND games.mode IN ('pvp', 'pve', 'eve')
       AND games.ended_at <= $4
       AND NOT (games.termination = 'timeout' AND games.ply_count < $1)
       AND NOT (games.mode = 'pvp' AND games.ply_count < $3)
       AND NOT (games.mode = 'pve' AND games.ply_count < 2)
       AND (
         (games.termination IN ('checkmate', 'draw', 'king-captured') AND last_events.type = 'move-played')
         OR (games.termination = 'timeout' AND last_events.type = 'clock-expired')
         OR (games.termination = 'resignation' AND last_events.type = 'seat-resigned')
         OR (games.termination = 'abandonment' AND last_events.type = 'seat-forfeited')
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

// ── Faceted game query + aggregates (powers the admin game browser) ─────────
// queryGames / gameAggregates share one WHERE builder so a filtered result page
// and its win-rate readout describe the exact same slice of completed games.

export type GameQueryFilters = {
  variant?: string;
  mode?: GameMode;
  result?: GameResult;
  termination?: GameTermination;
  rated?: boolean;
  timeClass?: TimeClass;
  plyMin?: number;
  plyMax?: number;
  endedFrom?: Date;
  endedTo?: Date;
  offset?: number;
  limit?: number;
};

export type GameQueryPage = {
  games: RecentEveGameRecord[];
  total: number;
};

export type GameAggregates = {
  total: number;
  results: { whiteWins: number; blackWins: number; redWins: number; draws: number };
  terminations: { termination: string; count: number }[];
  plyCount: { avg: number | null; min: number | null; max: number | null };
};

export type GameFacets = {
  variants: string[];
  modes: string[];
  terminations: string[];
  results: string[];
};

// Translate filters into a parameterized WHERE clause. Every value is bound as a
// query parameter ($n) — nothing is string-interpolated — so the filter set is
// injection-safe even though it is assembled dynamically. Exported for unit
// tests of the param indexing.
export function buildGameQueryWhere(filters: GameQueryFilters): {
  clause: string;
  values: unknown[];
} {
  const conditions: string[] = [`games.status = 'completed'`];
  const values: unknown[] = [];
  const bind = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.variant) conditions.push(`games.variant = ${bind(filters.variant)}`);
  if (filters.mode) conditions.push(`games.mode = ${bind(filters.mode)}`);
  if (filters.result) conditions.push(`games.result = ${bind(filters.result)}`);
  if (filters.termination) conditions.push(`games.termination = ${bind(filters.termination)}`);
  if (typeof filters.rated === 'boolean') conditions.push(`games.rated = ${bind(filters.rated)}`);
  if (filters.timeClass) {
    const matches = TIME_CONTROLS.filter((tc) => tc.timeClass === filters.timeClass);
    const ors = matches.map(
      (tc) =>
        `(games.initial_ms = ${bind(tc.initialMs)} AND games.increment_ms = ${bind(tc.incrementMs)})`,
    );
    conditions.push(ors.length > 0 ? `(${ors.join(' OR ')})` : 'FALSE');
  }
  if (typeof filters.plyMin === 'number') {
    conditions.push(`games.ply_count >= ${bind(filters.plyMin)}`);
  }
  if (typeof filters.plyMax === 'number') {
    conditions.push(`games.ply_count <= ${bind(filters.plyMax)}`);
  }
  if (filters.endedFrom) conditions.push(`games.ended_at >= ${bind(filters.endedFrom)}`);
  if (filters.endedTo) conditions.push(`games.ended_at < ${bind(filters.endedTo)}`);
  return { clause: conditions.join('\n       AND '), values };
}

export async function queryGames(filters: GameQueryFilters): Promise<GameQueryPage> {
  const limit = Math.max(1, Math.min(filters.limit ?? 50, 200));
  const offset = Math.max(0, filters.offset ?? 0);
  const { clause, values } = buildGameQueryWhere(filters);

  const countResult = await getPool().query<{ total: number }>(
    `SELECT count(*)::int AS total FROM games WHERE ${clause}`,
    values,
  );
  const total = countResult.rows[0]?.total ?? 0;
  if (total === 0) return { games: [], total: 0 };

  const pageValues = [...values, limit, offset];
  const { rows } = await getPool().query<RecentEveGameRow>(
    `SELECT ${RECENT_EVE_SELECT_COLUMNS}
     FROM games
     LEFT JOIN eve_games ON eve_games.game_id = games.room_id
     WHERE ${clause}
     ORDER BY games.ended_at DESC, games.room_id DESC
     LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
    pageValues,
  );
  const games = await attachGameParticipants(rows.map(recentEveGameRecordFromRow));
  return { games, total };
}

export async function gameAggregates(filters: GameQueryFilters): Promise<GameAggregates> {
  const { clause, values } = buildGameQueryWhere(filters);
  const summary = await getPool().query<{
    total: number;
    white_wins: number;
    black_wins: number;
    red_wins: number;
    draws: number;
    avg_ply: string | null;
    min_ply: number | null;
    max_ply: number | null;
  }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE games.result = 'white-wins')::int AS white_wins,
            count(*) FILTER (WHERE games.result = 'black-wins')::int AS black_wins,
            count(*) FILTER (WHERE games.result = 'red-wins')::int AS red_wins,
            count(*) FILTER (WHERE games.result = 'draw')::int AS draws,
            avg(games.ply_count) AS avg_ply,
            min(games.ply_count)::int AS min_ply,
            max(games.ply_count)::int AS max_ply
     FROM games
     WHERE ${clause}`,
    values,
  );
  const terms = await getPool().query<{ termination: string; count: number }>(
    `SELECT games.termination, count(*)::int AS count
     FROM games
     WHERE ${clause}
     GROUP BY games.termination
     ORDER BY count DESC, games.termination ASC`,
    values,
  );
  const row = summary.rows[0];
  return {
    total: row?.total ?? 0,
    results: {
      whiteWins: row?.white_wins ?? 0,
      blackWins: row?.black_wins ?? 0,
      redWins: row?.red_wins ?? 0,
      draws: row?.draws ?? 0,
    },
    terminations: terms.rows.map((r) => ({ termination: r.termination, count: r.count })),
    plyCount: {
      avg: row?.avg_ply != null ? Math.round(Number(row.avg_ply)) : null,
      min: row?.min_ply ?? null,
      max: row?.max_ply ?? null,
    },
  };
}

// Distinct values present in completed games, for populating filter dropdowns
// from real data rather than a hardcoded list.
export async function gameFacets(): Promise<GameFacets> {
  const { rows } = await getPool().query<{
    variants: string[] | null;
    modes: string[] | null;
    terminations: string[] | null;
    results: string[] | null;
  }>(
    `SELECT array_agg(DISTINCT variant) AS variants,
            array_agg(DISTINCT mode) AS modes,
            array_agg(DISTINCT termination) AS terminations,
            array_agg(DISTINCT result) AS results
     FROM games
     WHERE status = 'completed'`,
  );
  const row = rows[0];
  const clean = (xs: string[] | null | undefined): string[] =>
    [...new Set((xs ?? []).filter((value): value is string => Boolean(value)))].sort();
  return {
    variants: clean(row?.variants),
    modes: clean(row?.modes),
    terminations: clean(row?.terminations),
    results: clean(row?.results),
  };
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
    color: GameParticipantColor;
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
     ORDER BY game_id, CASE color WHEN 'white' THEN 0 WHEN 'red' THEN 0 ELSE 1 END`,
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
