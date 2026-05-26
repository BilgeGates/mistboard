import { getPool } from './persistence-db.js';

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
