// Read-only generator for the frozen ElephantChess 1,000-game puzzle-mining
// pilot manifest. Requires an explicit import-batch id so a later monthly
// corpus import cannot silently change eligibility.
//
// DATABASE_URL=... npm run pilot:elephantchess-manifest --workspace @mistboard/server -- \
//   --import-batch-id <uuid> --seed elephantchess-pilot-2026-07-v1 \
//   --out /private/path/elephantchess-pilot-v1.json

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';
import {
  buildElephantChessPilotManifest,
  type ElephantChessPilotGame,
  renderElephantChessPilotManifest,
} from './elephantchess-pilot-manifest.js';

type PilotGameRow = {
  historical_game_id: string;
  source_game_id: string;
  import_batch_id: string;
  ply_count: number;
  result: ElephantChessPilotGame['result'];
  red_elo_before: number | null;
  black_elo_before: number | null;
  time_control_category: string | null;
  rating_mode: string | null;
  red_player_id: string | null;
  black_player_id: string | null;
};

function required(value: string | undefined, flag: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${flag} is required`);
  return normalized;
}

const { values } = parseArgs({
  options: {
    'import-batch-id': { type: 'string' },
    seed: { type: 'string' },
    out: { type: 'string' },
  },
});

const importBatchId = required(values['import-batch-id'], '--import-batch-id');
const seed = required(values.seed, '--seed');
const out = resolve(required(values.out, '--out'));
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
try {
  const result = await pool.query<PilotGameRow>(
    `SELECT
       g.id AS historical_game_id,
       g.source_game_id,
       g.import_batch_id,
       g.ply_count,
       g.result,
       NULLIF(g.tags->>'redEloBefore', '')::int AS red_elo_before,
       NULLIF(g.tags->>'blackEloBefore', '')::int AS black_elo_before,
       NULLIF(g.tags->>'timeControlCategory', '') AS time_control_category,
       NULLIF(g.tags->>'ratingMode', '') AS rating_mode,
       NULLIF(g.tags->>'redPlayerId', '') AS red_player_id,
       NULLIF(g.tags->>'blackPlayerId', '') AS black_player_id
     FROM historical_xiangqi_games g
     JOIN historical_xiangqi_sources s ON s.id = g.source_id
     JOIN historical_xiangqi_import_batches b ON b.id = g.import_batch_id
     WHERE s.slug = 'elephantchess-pvp'
       AND s.license_status = 'cleared'
       AND g.import_batch_id = $1
       AND b.status = 'completed'
       AND g.source_game_id IS NOT NULL
       AND cardinality(g.quality_flags) = 0
     ORDER BY g.id`,
    [importBatchId],
  );
  const games: ElephantChessPilotGame[] = result.rows.map((row) => ({
    historicalGameId: row.historical_game_id,
    sourceGameId: row.source_game_id,
    importBatchId: row.import_batch_id,
    plyCount: row.ply_count,
    result: row.result,
    redEloBefore: row.red_elo_before,
    blackEloBefore: row.black_elo_before,
    timeControlCategory: row.time_control_category,
    ratingMode: row.rating_mode,
    redPlayerId: row.red_player_id,
    blackPlayerId: row.black_player_id,
  }));
  const manifest = buildElephantChessPilotManifest(games, { importBatchId, seed });
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, renderElephantChessPilotManifest(manifest), 'utf8');
  process.stdout.write(
    `${JSON.stringify({
      kind: 'elephantchess-pilot-manifest',
      out,
      importBatchId,
      manifestSha256: manifest.manifestSha256,
      counts: manifest.counts,
    })}\n`,
  );
} finally {
  await pool.end();
}
