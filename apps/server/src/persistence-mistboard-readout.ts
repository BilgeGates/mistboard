import { randomUUID } from 'node:crypto';
import { XIANGQI_SPEC_ID } from '@mistboard/game';
import type pg from 'pg';
import { buildElephantChessPuzzleQualityReport } from './elephantchess-puzzle-quality-report.js';
import {
  buildMistboardReadout,
  ELEPHANTCHESS_PILOT_RUN_ID,
  MISTBOARD_READOUT_SCHEMA_VERSION,
  type MistboardReadoutCollectorError,
  type MistboardReadoutEngines,
  type MistboardReadoutFacts,
  type MistboardReadoutMining,
  type MistboardReadoutProduct,
  type MistboardReadoutRuntime,
  type MistboardReadoutTrigger,
  type MistboardReadoutV1,
  readoutPeriods,
  readoutSnapshotKey,
} from './mistboard-readout.js';
import { getPool } from './persistence-db.js';
import { listPuzzleQualityAggregates } from './persistence-puzzle-quality.js';
import {
  getXiangqiPuzzleMiningRun,
  listXiangqiPuzzleEditorialCandidates,
} from './persistence-xiangqi-puzzle-mining.js';
import { xiangqiEditorialCandidateSignals } from './xiangqi-puzzle-editorial-ranking.js';

type Queryable = Pick<pg.Pool, 'query'>;

export async function generateMistboardReadout(input: {
  trigger: MistboardReadoutTrigger;
  now?: Date;
  runtime: MistboardReadoutRuntime;
  dryRun?: boolean;
  db?: pg.Pool;
}): Promise<{ report: MistboardReadoutV1; reused: boolean }> {
  const db = input.db ?? getPool();
  const now = input.now ?? new Date();
  const snapshotKey = readoutSnapshotKey(input.trigger, now);

  if (input.dryRun) {
    const [facts, previousReport] = await Promise.all([
      collectMistboardReadoutFacts(db, now),
      latestMistboardReadout(db),
    ]);
    return {
      report: buildMistboardReadout({
        snapshotId: `readout_dry_${randomUUID()}`,
        trigger: input.trigger,
        now,
        runtime: input.runtime,
        facts,
        previousReport,
      }),
      reused: false,
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('mistboard:readout-generation'))`);
    if (snapshotKey) {
      const existing = await client.query<{ payload: unknown }>(
        `SELECT payload FROM ops_readout_snapshots WHERE snapshot_key = $1`,
        [snapshotKey],
      );
      if (existing.rows[0]) {
        const report = parseStoredReadout(existing.rows[0].payload);
        await client.query('COMMIT');
        return { report, reused: true };
      }
    }

    // Keep the advisory lock on this transaction while independent read-only
    // collectors use the pool. Parallel query() calls on one PoolClient rely on
    // pg's deprecated implicit queuing and will stop working in pg 9.
    const [facts, previousReport] = await Promise.all([
      collectMistboardReadoutFacts(db, now),
      latestMistboardReadout(db),
    ]);
    const report = buildMistboardReadout({
      snapshotId: `readout_${randomUUID()}`,
      trigger: input.trigger,
      now,
      runtime: input.runtime,
      facts,
      previousReport,
    });
    await client.query(
      `INSERT INTO ops_readout_snapshots
         (id, schema_version, trigger, snapshot_key, period_start, period_end,
          verdict, decision_fingerprint, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        report.snapshotId,
        report.schemaVersion,
        report.trigger,
        report.snapshotKey,
        report.periodStart,
        report.periodEnd,
        report.verdict,
        report.decisionFingerprint,
        JSON.stringify(report),
      ],
    );
    await client.query('COMMIT');
    return { report, reused: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function latestMistboardReadout(
  db: Queryable = getPool(),
): Promise<MistboardReadoutV1 | null> {
  const result = await db.query<{ payload: unknown }>(
    `SELECT payload FROM ops_readout_snapshots ORDER BY created_at DESC, id DESC LIMIT 1`,
  );
  return result.rows[0] ? parseStoredReadout(result.rows[0].payload) : null;
}

export async function collectMistboardReadoutFacts(
  db: Queryable,
  now: Date,
): Promise<MistboardReadoutFacts> {
  const collectors = await Promise.allSettled([
    collectProduct(db, now),
    collectPuzzles(db, now),
    collectMining(db),
    collectEngines(db, now),
  ] as const);
  const sections: MistboardReadoutCollectorError['section'][] = [
    'product',
    'puzzles',
    'mining',
    'engines',
  ];
  const collectorErrors = collectors.flatMap((result, index) =>
    result.status === 'rejected'
      ? [{ section: sections[index]!, code: 'collector_failed' as const }]
      : [],
  );
  return {
    product: settledValue(collectors[0]),
    puzzles: settledValue(collectors[1]),
    mining: settledValue(collectors[2]),
    engines: settledValue(collectors[3]),
    collectorErrors,
  };
}

async function collectProduct(db: Queryable, now: Date): Promise<MistboardReadoutProduct> {
  const { periodStart, periodEnd, previousPeriodStart } = readoutPeriods(now);
  const [counts, modes, variants] = await Promise.all([
    db.query<{
      accounts_created: number;
      previous_accounts_created: number;
      completed_games: number;
      previous_completed_games: number;
    }>(
      `SELECT
         (SELECT count(*) FROM users WHERE created_at >= $1 AND created_at < $2)::int
           AS accounts_created,
         (SELECT count(*) FROM users WHERE created_at >= $3 AND created_at < $1)::int
           AS previous_accounts_created,
         (SELECT count(*) FROM games
            WHERE status = 'completed' AND mode IN ('pvp', 'pve')
              AND ended_at >= $1 AND ended_at < $2)::int AS completed_games,
         (SELECT count(*) FROM games
            WHERE status = 'completed' AND mode IN ('pvp', 'pve')
              AND ended_at >= $3 AND ended_at < $1)::int AS previous_completed_games`,
      [periodStart, periodEnd, previousPeriodStart],
    ),
    db.query<{ mode: string; count: number }>(
      `SELECT mode, count(*)::int AS count
       FROM games
       WHERE status = 'completed' AND ended_at >= $1 AND ended_at < $2
       GROUP BY mode ORDER BY mode`,
      [periodStart, periodEnd],
    ),
    db.query<{ variant: string; count: number }>(
      `SELECT variant, count(*)::int AS count
       FROM games
       WHERE status = 'completed' AND mode IN ('pvp', 'pve')
         AND ended_at >= $1 AND ended_at < $2
       GROUP BY variant ORDER BY count DESC, variant`,
      [periodStart, periodEnd],
    ),
  ]);
  const row = counts.rows[0];
  return {
    accountsCreated: row?.accounts_created ?? 0,
    previousAccountsCreated: row?.previous_accounts_created ?? 0,
    completedGames: row?.completed_games ?? 0,
    previousCompletedGames: row?.previous_completed_games ?? 0,
    completedGamesByMode: Object.fromEntries(modes.rows.map((entry) => [entry.mode, entry.count])),
    completedGamesByVariant: variants.rows,
  };
}

async function collectPuzzles(db: Queryable, now: Date) {
  const [aggregates, entries] = await Promise.all([
    listPuzzleQualityAggregates(db, XIANGQI_SPEC_ID),
    listXiangqiPuzzleEditorialCandidates(db, {
      runId: ELEPHANTCHESS_PILOT_RUN_ID,
      statuses: ['published'],
    }),
  ]);
  const signalsByCandidateId = new Map(
    entries.map((entry) => [entry.candidate.id, xiangqiEditorialCandidateSignals(entry)]),
  );
  return buildElephantChessPuzzleQualityReport({
    aggregates,
    pilotRunId: ELEPHANTCHESS_PILOT_RUN_ID,
    signalsByCandidateId,
    generatedAt: now.toISOString(),
  });
}

async function collectMining(db: Queryable): Promise<MistboardReadoutMining> {
  const [run, shards, candidates] = await Promise.all([
    getXiangqiPuzzleMiningRun(db, ELEPHANTCHESS_PILOT_RUN_ID),
    db.query<{
      status: string;
      count: number;
      remaining_games: number;
      stale_leases: number;
    }>(
      `SELECT status, count(*)::int AS count,
              COALESCE(sum(selection_end - next_selection_index), 0)::int AS remaining_games,
              count(*) FILTER (
                WHERE status = 'running' AND lease_expires_at <= now()
              )::int AS stale_leases
       FROM xiangqi_puzzle_mining_shards
       WHERE run_id = $1
       GROUP BY status ORDER BY status`,
      [ELEPHANTCHESS_PILOT_RUN_ID],
    ),
    db.query<{ status: string; count: number }>(
      `SELECT status, count(*)::int AS count
       FROM xiangqi_puzzle_mining_candidates
       WHERE run_id = $1
       GROUP BY status ORDER BY status`,
      [ELEPHANTCHESS_PILOT_RUN_ID],
    ),
  ]);
  return {
    runId: run.id,
    status: run.status,
    selectedGames: run.selectedGames,
    shards: Object.fromEntries(shards.rows.map((row) => [row.status, row.count])),
    remainingGames: shards.rows.reduce((sum, row) => sum + row.remaining_games, 0),
    candidates: Object.fromEntries(candidates.rows.map((row) => [row.status, row.count])),
    staleLeases: shards.rows.reduce((sum, row) => sum + row.stale_leases, 0),
  };
}

async function collectEngines(db: Queryable, now: Date): Promise<MistboardReadoutEngines> {
  const { periodStart } = readoutPeriods(now);
  const [tasks, workers] = await Promise.all([
    db.query<{ status: string; count: number }>(
      `SELECT status, count(*)::int AS count
       FROM engine_game_tasks
       WHERE status IN ('queued', 'running') OR finished_at >= $1
       GROUP BY status ORDER BY status`,
      [periodStart],
    ),
    db.query<{ active_workers: number; stale_workers: number }>(
      `SELECT
         count(*) FILTER (
           WHERE status IN ('running', 'draining')
             AND heartbeat_at >= $1::timestamptz - interval '2 minutes'
         )::int AS active_workers,
         count(*) FILTER (
           WHERE status IN ('running', 'draining')
             AND heartbeat_at < $1::timestamptz - interval '2 minutes'
         )::int AS stale_workers
       FROM engine_worker_runs`,
      [now],
    ),
  ]);
  const taskMap = Object.fromEntries(tasks.rows.map((row) => [row.status, row.count]));
  return {
    tasks: taskMap,
    failedTasks: taskMap.failed ?? 0,
    activeWorkers: workers.rows[0]?.active_workers ?? 0,
    staleWorkers: workers.rows[0]?.stale_workers ?? 0,
  };
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

function parseStoredReadout(value: unknown): MistboardReadoutV1 {
  if (!value || typeof value !== 'object') throw new Error('stored readout payload is invalid');
  const payload = value as Partial<MistboardReadoutV1>;
  if (
    payload.kind !== 'mistboard-readout' ||
    payload.schemaVersion !== MISTBOARD_READOUT_SCHEMA_VERSION ||
    typeof payload.snapshotId !== 'string' ||
    typeof payload.decisionFingerprint !== 'string'
  ) {
    throw new Error('stored readout payload has an unsupported schema');
  }
  return payload as MistboardReadoutV1;
}
