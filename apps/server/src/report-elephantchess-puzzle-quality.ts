import { parseArgs } from 'node:util';
import { XIANGQI_SPEC_ID } from '@mistboard/game';
import { buildElephantChessPuzzleQualityReport } from './elephantchess-puzzle-quality-report.js';
import { close, getPool, init } from './persistence-db.js';
import { listPuzzleQualityAggregates } from './persistence-puzzle-quality.js';
import {
  getXiangqiPuzzleMiningRun,
  listXiangqiPuzzleEditorialCandidates,
} from './persistence-xiangqi-puzzle-mining.js';
import { xiangqiEditorialCandidateSignals } from './xiangqi-puzzle-editorial-ranking.js';

function required(value: string | undefined, flag: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${flag} is required`);
  return normalized;
}

function nonNegativeInteger(value: string | undefined, flag: string, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return parsed;
}

const { values } = parseArgs({
  options: {
    'run-id': { type: 'string' },
    limit: { type: 'string', default: '20' },
    'min-sessions': { type: 'string', default: '10' },
    'min-votes': { type: 'string', default: '5' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  process.stdout.write(
    'Usage: npm run pilot:elephantchess-quality -- --run-id RUN_ID ' +
      '[--min-sessions 10] [--min-votes 5] [--limit 20]\n',
  );
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const runId = required(values['run-id'], '--run-id');

init(databaseUrl);
try {
  const pool = getPool();
  const [, aggregates, entries] = await Promise.all([
    getXiangqiPuzzleMiningRun(pool, runId),
    listPuzzleQualityAggregates(pool, XIANGQI_SPEC_ID),
    listXiangqiPuzzleEditorialCandidates(pool, { runId, statuses: ['published'] }),
  ]);
  const signalsByCandidateId = new Map(
    entries.map((entry) => [entry.candidate.id, xiangqiEditorialCandidateSignals(entry)]),
  );
  process.stdout.write(
    `${JSON.stringify(
      buildElephantChessPuzzleQualityReport({
        aggregates,
        pilotRunId: runId,
        signalsByCandidateId,
        limit: nonNegativeInteger(values.limit, '--limit', 20),
        perPuzzleSessions: nonNegativeInteger(values['min-sessions'], '--min-sessions', 10),
        perPuzzleVotes: nonNegativeInteger(values['min-votes'], '--min-votes', 5),
      }),
    )}\n`,
  );
} finally {
  await close();
}
