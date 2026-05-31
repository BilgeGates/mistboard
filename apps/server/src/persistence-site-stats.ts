import { getPool } from './persistence-db.js';
import type { GameMode } from './persistence-game-lifecycle.js';

export interface SiteStats {
  accounts: number;
  games: number;
  publicGames: number;
  last7dGames: number;
  gamesByResult: Record<string, number>;
  gamesByVariant: Record<string, number>;
}

export type PublicStatsMode = Extract<GameMode, 'pvp' | 'pve' | 'eve'>;

export interface PublicStatsDay {
  date: string;
  completedGames: number;
  cumulativeGames: number;
}

export interface PublicSiteStats {
  generatedAt: string;
  totalCompletedGames: number;
  last30dCompletedGames: number;
  publicGames: number;
  modeTotals: Record<PublicStatsMode, number>;
  dailyCompletedGames: PublicStatsDay[];
}

export type PublicSiteStatsOptions = {
  now?: Date;
};

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

export async function getPublicSiteStats(
  options: PublicSiteStatsOptions = {},
): Promise<PublicSiteStats> {
  const now = options.now ?? new Date();
  const pool = getPool();
  const scalar = await pool.query<{
    total_completed_games: number;
    last30d_completed_games: number;
    public_games: number;
  }>(
    `SELECT
       count(*) FILTER (
         WHERE status = 'completed'
           AND mode IN ('pvp', 'pve')
       )::int AS total_completed_games,
       count(*) FILTER (
         WHERE status = 'completed'
           AND mode IN ('pvp', 'pve')
           AND ended_at > $1::timestamptz - INTERVAL '30 days'
       )::int AS last30d_completed_games,
       count(*) FILTER (
         WHERE status = 'completed'
           AND mode IN ('pvp', 'pve')
           AND visibility = 'public'
       )::int AS public_games
     FROM games`,
    [now],
  );

  const byMode = await pool.query<{ mode: PublicStatsMode; n: number }>(
    `SELECT mode, count(*)::int AS n
     FROM games
     WHERE status = 'completed'
       AND mode IN ('pvp', 'pve', 'eve')
     GROUP BY mode`,
  );

  const daily = await pool.query<{ day: Date | string; n: number }>(
    `WITH bounds AS (
       SELECT
         min(ended_at)::date AS first_day,
         $1::timestamptz::date AS today
       FROM games
       WHERE status = 'completed'
         AND mode IN ('pvp', 'pve')
     ),
     days AS (
       SELECT generate_series(bounds.first_day, bounds.today, INTERVAL '1 day')::date AS day
       FROM bounds
       WHERE bounds.first_day IS NOT NULL
     ),
     completed AS (
       SELECT ended_at::date AS day, count(*)::int AS n
       FROM games
       WHERE status = 'completed'
         AND mode IN ('pvp', 'pve')
       GROUP BY day
     )
     SELECT days.day, COALESCE(completed.n, 0)::int AS n
     FROM days
     LEFT JOIN completed ON completed.day = days.day
     ORDER BY days.day ASC`,
    [now],
  );

  let cumulativeGames = 0;
  const dailyCompletedGames = daily.rows.map((row) => {
    cumulativeGames += row.n;
    return {
      date: isoDate(row.day),
      completedGames: row.n,
      cumulativeGames,
    };
  });

  const row = scalar.rows[0];
  return {
    generatedAt: now.toISOString(),
    totalCompletedGames: row?.total_completed_games ?? 0,
    last30dCompletedGames: row?.last30d_completed_games ?? 0,
    publicGames: row?.public_games ?? 0,
    modeTotals: {
      pvp: 0,
      pve: 0,
      eve: 0,
      ...Object.fromEntries(byMode.rows.map((r) => [r.mode, r.n])),
    },
    dailyCompletedGames,
  };
}

function isoDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}
