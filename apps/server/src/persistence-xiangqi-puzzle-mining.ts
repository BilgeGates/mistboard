import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { ElephantChessPilotManifest } from './elephantchess-pilot-manifest.js';
import { getPool, withTransaction } from './persistence-db.js';

export type XiangqiPuzzleMiningRunStatus =
  | 'ready'
  | 'scanning'
  | 'verifying'
  | 'auditing'
  | 'review'
  | 'completed'
  | 'failed'
  | 'canceled';

export type XiangqiPuzzleMiningRun = {
  id: string;
  importBatchId: string;
  manifestSha256: string;
  status: XiangqiPuzzleMiningRunStatus;
  selectedGames: number;
  shards: number;
  createdAt: Date;
};

export type XiangqiPuzzleMiningShardStatus = 'pending' | 'running' | 'completed' | 'failed';

export type XiangqiPuzzleMiningShard = {
  runId: string;
  shardIndex: number;
  selectionStart: number;
  selectionEnd: number;
  nextSelectionIndex: number;
  status: XiangqiPuzzleMiningShardStatus;
  attemptCount: number;
  workerId: string | null;
  claimToken: string | null;
  leaseExpiresAt: Date | null;
  lastHeartbeatAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

type RunRow = {
  id: string;
  import_batch_id: string;
  manifest_sha256: string;
  status: XiangqiPuzzleMiningRunStatus;
  selected_games: number;
  shards: number;
  created_at: Date;
};

type ShardRow = {
  run_id: string;
  shard_index: number;
  selection_start: number;
  selection_end: number;
  next_selection_index: number;
  status: XiangqiPuzzleMiningShardStatus;
  attempt_count: number;
  worker_id: string | null;
  claim_token: string | null;
  lease_expires_at: Date | null;
  last_heartbeat_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
};

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

function mapRun(row: RunRow): XiangqiPuzzleMiningRun {
  return {
    id: row.id,
    importBatchId: row.import_batch_id,
    manifestSha256: row.manifest_sha256,
    status: row.status,
    selectedGames: row.selected_games,
    shards: row.shards,
    createdAt: row.created_at,
  };
}

function mapShard(row: ShardRow): XiangqiPuzzleMiningShard {
  return {
    runId: row.run_id,
    shardIndex: row.shard_index,
    selectionStart: row.selection_start,
    selectionEnd: row.selection_end,
    nextSelectionIndex: row.next_selection_index,
    status: row.status,
    attemptCount: row.attempt_count,
    workerId: row.worker_id,
    claimToken: row.claim_token,
    leaseExpiresAt: row.lease_expires_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export function xiangqiPuzzleMiningRunId(manifestSha256: string): string {
  return `xqpmr_${createHash('sha256').update(manifestSha256).digest('hex').slice(0, 24)}`;
}

export async function initializeXiangqiPuzzleMiningRun(input: {
  manifest: ElephantChessPilotManifest;
  serializedSha256?: string | null;
  shardSize?: number;
  engineProfile?: Record<string, unknown>;
  scanProfile?: Record<string, unknown>;
  auditProfile?: Record<string, unknown>;
}): Promise<XiangqiPuzzleMiningRun> {
  const { manifest } = input;
  const shardSize = input.shardSize ?? 25;
  if (!Number.isSafeInteger(shardSize) || shardSize <= 0) {
    throw new Error('shardSize must be a positive integer');
  }
  if (manifest.games.length !== manifest.counts.selected) {
    throw new Error('manifest selected count does not match its ordered games');
  }
  const runId = xiangqiPuzzleMiningRunId(manifest.manifestSha256);
  const shardCount = Math.ceil(manifest.games.length / shardSize);

  return withTransaction(async (client) => {
    const source = await client.query<{ source_id: string }>(
      `SELECT source.id AS source_id
       FROM historical_xiangqi_sources source
       JOIN historical_xiangqi_import_batches batch ON batch.source_id = source.id
       WHERE source.slug = $1
         AND source.license_status = 'cleared'
         AND batch.id = $2
         AND batch.status = 'completed'`,
      [manifest.sourceSlug, manifest.importBatchId],
    );
    if (!source.rows[0]) {
      throw new Error(`eligible completed import batch ${manifest.importBatchId} not found`);
    }

    await client.query(
      `INSERT INTO xiangqi_puzzle_mining_runs
         (id, source_id, import_batch_id, manifest_format, eligibility_version,
          selection_seed, manifest_sha256, serialized_sha256, manifest,
          engine_profile, scan_profile, audit_profile)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::json, $10::jsonb, $11::jsonb, $12::jsonb)
       ON CONFLICT (import_batch_id, manifest_sha256) DO NOTHING`,
      [
        runId,
        source.rows[0].source_id,
        manifest.importBatchId,
        manifest.format,
        manifest.eligibilityVersion,
        manifest.seed,
        manifest.manifestSha256,
        input.serializedSha256 ?? null,
        JSON.stringify(manifest),
        JSON.stringify(input.engineProfile ?? {}),
        JSON.stringify(input.scanProfile ?? {}),
        JSON.stringify(input.auditProfile ?? {}),
      ],
    );

    const identity = await client.query<{ id: string }>(
      `SELECT id
       FROM xiangqi_puzzle_mining_runs
       WHERE id = $1 AND import_batch_id = $2
         AND manifest_format = $3 AND eligibility_version = $4
         AND selection_seed = $5 AND manifest_sha256 = $6
         AND serialized_sha256 IS NOT DISTINCT FROM $7
         AND engine_profile = $8::jsonb
         AND scan_profile = $9::jsonb
         AND audit_profile = $10::jsonb`,
      [
        runId,
        manifest.importBatchId,
        manifest.format,
        manifest.eligibilityVersion,
        manifest.seed,
        manifest.manifestSha256,
        input.serializedSha256 ?? null,
        JSON.stringify(input.engineProfile ?? {}),
        JSON.stringify(input.scanProfile ?? {}),
        JSON.stringify(input.auditProfile ?? {}),
      ],
    );
    if (!identity.rows[0]) {
      throw new Error(`mining run ${runId} already exists with different immutable settings`);
    }

    await client.query(
      `WITH manifest_game AS (
         SELECT *
         FROM json_to_recordset($2::json) AS item(
           "selectionIndex" integer,
           cohort text,
           "historicalGameId" text,
           "sourceGameId" text,
           "averageElo" integer,
           "eloQuartile" text,
           "timeControlCategory" text,
           "ratingMode" text,
           result text,
           "plyCount" integer,
           "lengthBand" text,
           "representativeStratum" text,
           "coverageBucket" text
         )
       )
       INSERT INTO xiangqi_puzzle_mining_games
         (run_id, historical_game_id, selection_index, cohort, selection_evidence)
       SELECT $1, game.id, item."selectionIndex", item.cohort,
              jsonb_build_object(
                'sourceGameId', item."sourceGameId",
                'averageElo', item."averageElo",
                'eloStratum', item."eloQuartile",
                'timeControlCategory', item."timeControlCategory",
                'ratingMode', item."ratingMode",
                'result', item.result,
                'plyCount', item."plyCount",
                'lengthBand', item."lengthBand",
                'representativeStratum', item."representativeStratum",
                'coverageBucket', item."coverageBucket"
              )
       FROM manifest_game item
       JOIN historical_xiangqi_games game
         ON game.id = item."historicalGameId"
        AND game.source_game_id = item."sourceGameId"
        AND game.import_batch_id = $3
       ON CONFLICT (run_id, historical_game_id) DO NOTHING`,
      [runId, JSON.stringify(manifest.games), manifest.importBatchId],
    );

    const membership = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM xiangqi_puzzle_mining_games WHERE run_id = $1`,
      [runId],
    );
    if (membership.rows[0]?.count !== manifest.games.length) {
      throw new Error(
        `manifest membership resolved ${membership.rows[0]?.count ?? 0} of ${manifest.games.length} games`,
      );
    }

    await client.query(
      `INSERT INTO xiangqi_puzzle_mining_shards
         (run_id, shard_index, selection_start, selection_end, next_selection_index)
       SELECT $1, shard_index, shard_index * $2,
              LEAST((shard_index + 1) * $2, $3), shard_index * $2
       FROM generate_series(0, $4 - 1) AS shard_index
       ON CONFLICT (run_id, shard_index) DO NOTHING`,
      [runId, shardSize, manifest.games.length, shardCount],
    );
    const shardLayout = await client.query<{ count: number; matches: boolean }>(
      `SELECT count(*)::int AS count,
              COALESCE(bool_and(
                selection_start = shard_index * $2
                AND selection_end = LEAST((shard_index + 1) * $2, $3)
              ), true) AS matches
       FROM xiangqi_puzzle_mining_shards
       WHERE run_id = $1`,
      [runId, shardSize, manifest.games.length],
    );
    if (shardLayout.rows[0]?.count !== shardCount || !shardLayout.rows[0]?.matches) {
      throw new Error(`mining run ${runId} already exists with a different shard layout`);
    }

    return getXiangqiPuzzleMiningRun(client, runId);
  });
}

export async function getXiangqiPuzzleMiningRun(
  db: Queryable,
  runId: string,
): Promise<XiangqiPuzzleMiningRun> {
  const { rows } = await db.query<RunRow>(
    `SELECT run.id, run.import_batch_id, run.manifest_sha256, run.status, run.created_at,
            count(DISTINCT game.historical_game_id)::int AS selected_games,
            count(DISTINCT shard.shard_index)::int AS shards
     FROM xiangqi_puzzle_mining_runs run
     LEFT JOIN xiangqi_puzzle_mining_games game ON game.run_id = run.id
     LEFT JOIN xiangqi_puzzle_mining_shards shard ON shard.run_id = run.id
     WHERE run.id = $1
     GROUP BY run.id`,
    [runId],
  );
  if (!rows[0]) throw new Error(`mining run ${runId} not found`);
  return mapRun(rows[0]);
}

export async function claimNextXiangqiPuzzleMiningShard(input: {
  runId: string;
  workerId: string;
  claimToken?: string;
  leaseMs?: number;
}): Promise<XiangqiPuzzleMiningShard | null> {
  const claimToken = input.claimToken ?? randomUUID();
  const leaseMs = input.leaseMs ?? 5 * 60_000;
  if (!input.workerId.trim()) throw new Error('workerId is required');
  if (!claimToken.trim()) throw new Error('claimToken is required');
  if (!Number.isFinite(leaseMs) || leaseMs <= 0) throw new Error('leaseMs must be positive');
  const { rows } = await getPool().query<ShardRow>(
    `WITH activated_run AS (
       UPDATE xiangqi_puzzle_mining_runs
       SET status = 'scanning', started_at = COALESCE(started_at, now()), updated_at = now()
       WHERE id = $1 AND status = 'ready'
       RETURNING id
     ), next_shard AS (
       SELECT shard.run_id, shard.shard_index
       FROM xiangqi_puzzle_mining_shards shard
       WHERE shard.run_id = $1
         AND (
           shard.status IN ('pending', 'failed')
           OR (shard.status = 'running' AND shard.lease_expires_at <= now())
         )
       ORDER BY shard.shard_index
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE xiangqi_puzzle_mining_shards shard
     SET status = 'running', worker_id = $2, claim_token = $3,
         lease_expires_at = now() + ($4::double precision * interval '1 millisecond'),
         last_heartbeat_at = now(), attempt_count = shard.attempt_count + 1,
         started_at = COALESCE(shard.started_at, now()), completed_at = NULL,
         failure = NULL, updated_at = now()
     FROM next_shard
     WHERE shard.run_id = next_shard.run_id
       AND shard.shard_index = next_shard.shard_index
     RETURNING shard.*`,
    [input.runId, input.workerId, claimToken, leaseMs],
  );
  return rows[0] ? mapShard(rows[0]) : null;
}

export async function heartbeatXiangqiPuzzleMiningShard(input: {
  runId: string;
  shardIndex: number;
  claimToken: string;
  leaseMs?: number;
}): Promise<XiangqiPuzzleMiningShard> {
  return updateClaimedShard(
    input,
    `last_heartbeat_at = now(),
     lease_expires_at = now() + ($4::double precision * interval '1 millisecond'),
     updated_at = now()`,
    [input.leaseMs ?? 5 * 60_000],
    `AND lease_expires_at > now()`,
  );
}

export async function checkpointXiangqiPuzzleMiningShard(input: {
  runId: string;
  shardIndex: number;
  claimToken: string;
  nextSelectionIndex: number;
}): Promise<XiangqiPuzzleMiningShard> {
  return updateClaimedShard(
    input,
    `next_selection_index = $4, last_heartbeat_at = now(), updated_at = now()`,
    [input.nextSelectionIndex],
    `AND lease_expires_at > now()
     AND $4 >= next_selection_index AND $4 <= selection_end`,
  );
}

export async function completeXiangqiPuzzleMiningShard(input: {
  runId: string;
  shardIndex: number;
  claimToken: string;
}): Promise<XiangqiPuzzleMiningShard> {
  return updateClaimedShard(
    input,
    `status = 'completed',
     worker_id = NULL, claim_token = NULL, lease_expires_at = NULL,
     last_heartbeat_at = now(), completed_at = now(), updated_at = now()`,
    [],
    `AND lease_expires_at > now() AND next_selection_index = selection_end`,
  );
}

export async function failXiangqiPuzzleMiningShard(input: {
  runId: string;
  shardIndex: number;
  claimToken: string;
  failure: Record<string, unknown>;
}): Promise<XiangqiPuzzleMiningShard> {
  return updateClaimedShard(
    input,
    `status = 'failed', worker_id = NULL, claim_token = NULL,
     lease_expires_at = NULL, last_heartbeat_at = now(),
     failure = $4::jsonb, updated_at = now()`,
    [JSON.stringify(input.failure)],
    `AND lease_expires_at > now()`,
  );
}

async function updateClaimedShard(
  input: { runId: string; shardIndex: number; claimToken: string },
  setSql: string,
  extraParams: unknown[],
  extraWhere = '',
): Promise<XiangqiPuzzleMiningShard> {
  const { rows } = await getPool().query<ShardRow>(
    `UPDATE xiangqi_puzzle_mining_shards
     SET ${setSql}
     WHERE run_id = $1 AND shard_index = $2
       AND claim_token = $3 AND status = 'running' ${extraWhere}
     RETURNING *`,
    [input.runId, input.shardIndex, input.claimToken, ...extraParams],
  );
  if (!rows[0]) throw new Error(`shard ${input.runId}/${input.shardIndex} is not claimed`);
  return mapShard(rows[0]);
}
