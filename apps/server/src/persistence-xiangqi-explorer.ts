// Storage for the standard-xiangqi opening explorer's derived move statistics
// (migration 116). Two halves:
//
//   - the read path (`lookupXiangqiOpeningMoves`), one indexed scan per
//     position, which is all the explorer API does;
//   - the rebuild path (`replaceXiangqiOpeningMoves`), which swaps the whole
//     derived table inside one transaction so a reader never sees a half-built
//     corpus.
//
// Nothing here is a source of truth. See build-xiangqi-explorer.ts for the
// aggregation itself, including the license gate on which games may feed it.

import type { XiangqiMove } from '@mistboard/game';
import { getPool, withTransaction } from './persistence-db.js';

export type XiangqiOpeningMoveRow = {
  move: XiangqiMove;
  games: number;
  redWins: number;
  blackWins: number;
  draws: number;
  unknowns: number;
  sampleGameIds: string[];
};

export type XiangqiOpeningBuildInfo = {
  gameCount: number;
  positionCount: number;
  maxPly: number;
  sourceSlugs: string[];
  builtAt: Date;
};

/** Aggregate rows keyed by "<from><to>", as the builder accumulates them. */
export type XiangqiOpeningMoveAccumulator = Map<
  string,
  Map<string, Omit<XiangqiOpeningMoveRow, 'move'>>
>;

const BUILD_ROW_ID = 'current';

export async function lookupXiangqiOpeningMoves(
  positionKey: string,
): Promise<XiangqiOpeningMoveRow[]> {
  const { rows } = await getPool().query<{
    move: string;
    games: number;
    red_wins: number;
    black_wins: number;
    draws: number;
    unknowns: number;
    sample_game_ids: string[];
  }>(
    `SELECT move, games, red_wins, black_wins, draws, unknowns, sample_game_ids
     FROM xiangqi_opening_moves
     WHERE position_key = $1
     ORDER BY games DESC, move ASC`,
    [positionKey],
  );
  return rows.flatMap((row) => {
    const move = parseMoveKey(row.move);
    if (!move) return [];
    return [
      {
        move,
        games: row.games,
        redWins: row.red_wins,
        blackWins: row.black_wins,
        draws: row.draws,
        unknowns: row.unknowns,
        sampleGameIds: row.sample_game_ids,
      },
    ];
  });
}

export async function readXiangqiOpeningBuild(): Promise<XiangqiOpeningBuildInfo | null> {
  const { rows } = await getPool().query<{
    game_count: number;
    position_count: number;
    max_ply: number;
    source_slugs: string[];
    built_at: Date;
  }>(
    `SELECT game_count, position_count, max_ply, source_slugs, built_at
     FROM xiangqi_opening_build
     WHERE id = $1`,
    [BUILD_ROW_ID],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    gameCount: row.game_count,
    positionCount: row.position_count,
    maxPly: row.max_ply,
    sourceSlugs: row.source_slugs,
    builtAt: row.built_at,
  };
}

/**
 * Swap in a freshly built corpus. The delete and the inserts share one
 * transaction: a rebuild must never leave the explorer serving a partial
 * corpus, which would silently understate every move's popularity.
 */
export async function replaceXiangqiOpeningMoves(
  accumulator: XiangqiOpeningMoveAccumulator,
  build: Omit<XiangqiOpeningBuildInfo, 'builtAt'>,
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM xiangqi_opening_moves');
    // Batched multi-row inserts: a per-row round trip over ~10^5 rows is the
    // difference between seconds and minutes on a remote database.
    const BATCH = 500;
    let batch: unknown[][] = [];
    const flush = async (): Promise<void> => {
      if (batch.length === 0) return;
      const values = batch
        .map((_, index) => {
          const base = index * 8;
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
        })
        .join(', ');
      await client.query(
        `INSERT INTO xiangqi_opening_moves
           (position_key, move, games, red_wins, black_wins, draws, unknowns, sample_game_ids)
         VALUES ${values}`,
        batch.flat(),
      );
      batch = [];
    };
    for (const [positionKey, moves] of accumulator) {
      for (const [move, stats] of moves) {
        batch.push([
          positionKey,
          move,
          stats.games,
          stats.redWins,
          stats.blackWins,
          stats.draws,
          stats.unknowns,
          stats.sampleGameIds,
        ]);
        if (batch.length >= BATCH) await flush();
      }
    }
    await flush();

    await client.query(
      `INSERT INTO xiangqi_opening_build
         (id, game_count, position_count, max_ply, source_slugs, built_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (id) DO UPDATE SET
         game_count = EXCLUDED.game_count,
         position_count = EXCLUDED.position_count,
         max_ply = EXCLUDED.max_ply,
         source_slugs = EXCLUDED.source_slugs,
         built_at = EXCLUDED.built_at`,
      [BUILD_ROW_ID, build.gameCount, build.positionCount, build.maxPly, build.sourceSlugs],
    );
  });
}

/** "h3e3" → { from: 'h3', to: 'e3' }; null on anything that is not a move key. */
function parseMoveKey(value: string): XiangqiMove | null {
  const match = value.match(/^([a-i](?:10|[1-9]))([a-i](?:10|[1-9]))$/);
  if (!match) return null;
  return { from: match[1], to: match[2] } as XiangqiMove;
}
