import assert from 'node:assert/strict';
import test from 'node:test';
import { buildElephantChessPuzzleQualityReport } from './elephantchess-puzzle-quality-report.js';
import {
  buildMistboardReadout,
  ELEPHANTCHESS_PILOT_RUN_ID,
  type MistboardReadoutFacts,
  type MistboardReadoutRuntime,
  readoutPeriods,
  readoutSnapshotKey,
  renderMistboardReadoutMarkdown,
  scheduledReadoutTrigger,
} from './mistboard-readout.js';
import type { PuzzleQualityAggregate } from './persistence-puzzle-quality.js';

const runtime: MistboardReadoutRuntime = {
  revision: 'abc123',
  activeGames: 0,
  databaseRequired: true,
  persistence: 'enabled',
  persistenceErrors: { count1m: 0, lastAt: null },
};

const emptyFacts: MistboardReadoutFacts = {
  product: {
    accountsCreated: 2,
    previousAccountsCreated: 1,
    completedGames: 8,
    previousCompletedGames: 5,
    completedGamesByMode: { pvp: 6, pve: 2 },
    completedGamesByVariant: [{ variant: 'xiangqi', count: 8 }],
  },
  puzzles: null,
  mining: null,
  engines: { tasks: {}, failedTasks: 0, activeWorkers: 0, staleWorkers: 0 },
};

test('readout periods use complete UTC days and a previous comparison week', () => {
  assert.deepEqual(readoutPeriods(new Date('2026-07-22T18:30:00Z')), {
    periodStart: new Date('2026-07-15T00:00:00Z'),
    periodEnd: new Date('2026-07-22T00:00:00Z'),
    previousPeriodStart: new Date('2026-07-08T00:00:00Z'),
  });
});

test('scheduled trigger emits weekly only on Monday UTC', () => {
  assert.equal(scheduledReadoutTrigger(new Date('2026-07-20T17:23:00Z')), 'weekly');
  assert.equal(scheduledReadoutTrigger(new Date('2026-07-21T17:23:00Z')), 'daily');
  assert.equal(
    readoutSnapshotKey('weekly', new Date('2026-07-20T17:23:00Z')),
    'readout:v1:weekly:2026-W30',
  );
});

test('decision fingerprint ignores snapshot identity and generation time', () => {
  const first = buildMistboardReadout({
    snapshotId: 'readout_one',
    trigger: 'manual',
    now: new Date('2026-07-22T10:00:00Z'),
    runtime,
    facts: emptyFacts,
  });
  const second = buildMistboardReadout({
    snapshotId: 'readout_two',
    trigger: 'manual',
    now: new Date('2026-07-22T20:00:00Z'),
    runtime,
    facts: emptyFacts,
  });
  assert.equal(first.decisionFingerprint, second.decisionFingerprint);
});

test('puzzle gates and qualified outliers become owned, deduplicated actions', () => {
  const puzzles = buildElephantChessPuzzleQualityReport({
    aggregates: [qualityAggregate({ sessions: 100, starts: 1_000, reveals: 60 })],
    pilotRunId: ELEPHANTCHESS_PILOT_RUN_ID,
    generatedAt: '2026-07-22T00:00:00Z',
  });
  const report = buildMistboardReadout({
    snapshotId: 'readout_gate',
    trigger: 'weekly',
    now: new Date('2026-07-20T17:23:00Z'),
    runtime,
    facts: { ...emptyFacts, puzzles },
  });

  assert.equal(report.verdict, 'action');
  assert.deepEqual(
    report.actions.map((action) => ({ code: action.code, issue: action.ownerIssue })),
    [
      { code: 'puzzle-outlier-set-changed', issue: 156 },
      { code: 'puzzle-plumbing-ready', issue: 156 },
      { code: 'puzzle-quality-gate-ready', issue: 156 },
    ],
  );
  assert.match(renderMistboardReadoutMarkdown(report), /1 sample-qualified outliers/);
});

test('collector failure produces unknown rather than healthy', () => {
  const report = buildMistboardReadout({
    snapshotId: 'readout_partial',
    trigger: 'daily',
    now: new Date('2026-07-22T17:23:00Z'),
    runtime,
    facts: {
      ...emptyFacts,
      product: null,
      collectorErrors: [{ section: 'product', code: 'collector_failed' }],
    },
  });
  assert.equal(report.verdict, 'unknown');
  assert.match(renderMistboardReadoutMarkdown(report), /Product activity unavailable/);
});

test('a cleared puzzle outlier set emits one transition action', () => {
  const previousPuzzles = buildElephantChessPuzzleQualityReport({
    aggregates: [qualityAggregate({ sessions: 100, starts: 1_000, reveals: 60 })],
    pilotRunId: ELEPHANTCHESS_PILOT_RUN_ID,
    generatedAt: '2026-07-20T00:00:00Z',
  });
  const previousReport = buildMistboardReadout({
    snapshotId: 'readout_previous_outliers',
    trigger: 'weekly',
    now: new Date('2026-07-20T17:23:00Z'),
    runtime,
    facts: { ...emptyFacts, puzzles: previousPuzzles },
  });
  const clearedPuzzles = buildElephantChessPuzzleQualityReport({
    aggregates: [qualityAggregate({ sessions: 100, starts: 1_000, reveals: 0 })],
    pilotRunId: ELEPHANTCHESS_PILOT_RUN_ID,
    generatedAt: '2026-07-21T00:00:00Z',
  });
  const clearedReport = buildMistboardReadout({
    snapshotId: 'readout_cleared_outliers',
    trigger: 'daily',
    now: new Date('2026-07-21T17:23:00Z'),
    runtime,
    facts: { ...emptyFacts, puzzles: clearedPuzzles },
    previousReport,
  });
  assert.equal(
    clearedReport.actions.filter((action) => action.code === 'puzzle-outliers-resolved').length,
    1,
  );
  assert.equal(
    clearedReport.actions.find((action) => action.code === 'puzzle-outliers-resolved')?.ownerIssue,
    156,
  );

  const nextReport = buildMistboardReadout({
    snapshotId: 'readout_after_clear',
    trigger: 'daily',
    now: new Date('2026-07-22T17:23:00Z'),
    runtime,
    facts: { ...emptyFacts, puzzles: clearedPuzzles },
    previousReport: clearedReport,
  });
  assert.equal(
    nextReport.actions.some((action) => action.code === 'puzzle-outliers-resolved'),
    false,
  );
});

test('serialized readouts exclude prohibited identity and secret keys', () => {
  const report = buildMistboardReadout({
    snapshotId: 'readout_redaction',
    trigger: 'daily',
    now: new Date('2026-07-22T17:23:00Z'),
    runtime,
    facts: emptyFacts,
  });
  const prohibited = new Set([
    'email',
    'handle',
    'ip',
    'sessionId',
    'cookie',
    'token',
    'databaseUrl',
    'failureReason',
  ]);
  const keys = collectKeys(report);
  assert.deepEqual(
    [...keys].filter((key) => prohibited.has(key)),
    [],
  );
});

function qualityAggregate(overrides: Partial<PuzzleQualityAggregate> = {}): PuzzleQualityAggregate {
  return {
    puzzleId: 'xq-pilot-1',
    variant: 'xiangqi',
    sourceKind: 'mined',
    miningCandidateId: 'candidate-1',
    miningRunId: ELEPHANTCHESS_PILOT_RUN_ID,
    sessions: 0,
    starts: 0,
    solves: 0,
    cleanSolves: 0,
    reveals: 0,
    abandons: 0,
    inProgress: 0,
    wrongAttempts: 0,
    hints: 0,
    votesUp: 0,
    votesDown: 0,
    averageCompletionSeconds: null,
    signedInAttempts: 0,
    signedInSolves: 0,
    rating: 1_600,
    ratingDeviation: 350,
    ...overrides,
  };
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      keys.add(key);
      collectKeys(item, keys);
    }
  }
  return keys;
}
