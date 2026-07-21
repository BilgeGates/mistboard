import { parseArgs } from 'node:util';
import { close, getPool, init } from './persistence-db.js';
import { getXiangqiPuzzleMiningRun } from './persistence-xiangqi-puzzle-mining.js';

function required(value: string | undefined, flag: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${flag} is required`);
  return normalized;
}

const { values } = parseArgs({
  options: {
    'run-id': { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  process.stdout.write(`Usage: npm run pilot:elephantchess-status -- --run-id RUN_ID\n`);
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const runId = required(values['run-id'], '--run-id');

init(databaseUrl);
try {
  const pool = getPool();
  const [run, shards, candidates, judgments] = await Promise.all([
    getXiangqiPuzzleMiningRun(pool, runId),
    pool.query<{
      status: string;
      count: number;
      remaining_games: number;
    }>(
      `SELECT status, count(*)::int AS count,
              sum(selection_end - next_selection_index)::int AS remaining_games
       FROM xiangqi_puzzle_mining_shards
       WHERE run_id = $1
       GROUP BY status
       ORDER BY status`,
      [runId],
    ),
    pool.query<{ status: string; count: number; active_audit_leases: number }>(
      `SELECT status, count(*)::int AS count,
              count(*) FILTER (
                WHERE audit_claim_token IS NOT NULL AND audit_lease_expires_at > now()
              )::int AS active_audit_leases
       FROM xiangqi_puzzle_mining_candidates
       WHERE run_id = $1
       GROUP BY status
       ORDER BY status`,
      [runId],
    ),
    pool.query<{ stage: string; verdict: string; count: number }>(
      `SELECT judgment.stage, judgment.verdict, count(*)::int AS count
       FROM xiangqi_puzzle_mining_judgments judgment
       JOIN xiangqi_puzzle_mining_candidates candidate ON candidate.id = judgment.candidate_id
       WHERE candidate.run_id = $1
       GROUP BY judgment.stage, judgment.verdict
       ORDER BY judgment.stage, judgment.verdict`,
      [runId],
    ),
  ]);
  process.stdout.write(
    `${JSON.stringify({
      kind: 'elephantchess-pilot-mining-status',
      run,
      shards: shards.rows,
      candidates: candidates.rows,
      judgments: judgments.rows,
    })}\n`,
  );
} finally {
  await close();
}
