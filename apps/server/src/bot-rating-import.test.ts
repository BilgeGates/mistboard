import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBotRatingSnapshotPlan,
  timeClassFromEngineTimeControlBucket,
} from './bot-rating-import.js';
import type { EngineEloReport, EngineEloRow } from './engine-elo-report.js';

test('maps engine time-control buckets to public rating time classes', () => {
  assert.equal(timeClassFromEngineTimeControlBucket('tc-60+1'), 'bullet');
  assert.equal(timeClassFromEngineTimeControlBucket('tc-180+2'), 'blitz');
  assert.equal(timeClassFromEngineTimeControlBucket('tc-300+5'), 'rapid');
  assert.equal(timeClassFromEngineTimeControlBucket('tc-120+1'), null);
  assert.equal(timeClassFromEngineTimeControlBucket('untimed'), null);
});

test('builds published bot rating drafts from rated engine Elo rows', () => {
  const plan = buildBotRatingSnapshotPlan(
    report({
      rows: [
        row({
          engineId: 'python-v2-v1.5',
          elo: 312.4,
          games: 32,
          ciWilson: 76.6,
          ciSimple: 82.1,
        }),
        row({ engineId: 'private-engine', elo: 100, games: 12 }),
        row({ engineId: 'below-floor', elo: null, games: 2, status: 'below-floor' }),
      ],
    }),
    [
      {
        id: 'misty-dark-chess',
        activeEngineId: 'python-v2-v1.5',
        defaultGameSpecId: 'dark-chess',
      },
      {
        id: 'misty-dmx',
        activeEngineId: 'python-dmx-v1.0',
        defaultGameSpecId: 'dark-mini-xiangqi',
      },
    ],
    { anchorRating: 1500, published: true, sourceRef: 'tournament:test-cup' },
  );

  assert.equal(plan.drafts.length, 1);
  assert.deepEqual(plan.drafts[0], {
    botId: 'misty-dark-chess',
    engineId: 'python-v2-v1.5',
    gameSpecId: 'dark-chess',
    timeClass: 'blitz',
    rating: 1812,
    ratingDeviation: 77,
    games: 32,
    sourceRef: 'tournament:test-cup',
    published: true,
  });
  assert.deepEqual(plan.unmatchedEngineIds, ['private-engine']);
  assert.deepEqual(plan.skippedEngineIds, ['below-floor']);
});

test('clockless reports accept an explicit time class (xiangqi EvE)', () => {
  const plan = buildBotRatingSnapshotPlan(
    report({
      variant: 'xiangqi',
      timeControlBucket: 'untimed',
      rows: [row({ engineId: 'fairy-stockfish-xiangqi-level-3', elo: 210, games: 18 })],
    }),
    [
      {
        id: 'fairy-stockfish-level-3',
        activeEngineId: 'fairy-stockfish-xiangqi-level-3',
        defaultGameSpecId: 'xiangqi',
      },
    ],
    { timeClass: 'blitz' },
  );
  assert.equal(plan.drafts.length, 1);
  assert.equal(plan.drafts[0]?.botId, 'fairy-stockfish-level-3');
  assert.equal(plan.drafts[0]?.timeClass, 'blitz');
});

test('multi-variant first-party bots match their per-variant engine, not just the default', () => {
  // fairy-stockfish-level-3 defaults to xiangqi; its fortress engine must
  // still map through the first-party engines table for a fortress report.
  const plan = buildBotRatingSnapshotPlan(
    report({
      variant: 'fortress-xiangqi',
      timeControlBucket: 'untimed',
      rows: [row({ engineId: 'fairy-stockfish-fortress-xiangqi-level-3', elo: 150, games: 16 })],
    }),
    [
      {
        id: 'fairy-stockfish-level-3',
        activeEngineId: 'fairy-stockfish-xiangqi-level-3',
        defaultGameSpecId: 'xiangqi',
      },
    ],
    { timeClass: 'rapid' },
  );
  assert.equal(plan.drafts.length, 1);
  assert.deepEqual(
    { botId: plan.drafts[0]?.botId, gameSpecId: plan.drafts[0]?.gameSpecId },
    { botId: 'fairy-stockfish-level-3', gameSpecId: 'fortress-xiangqi' },
  );
});

test('rejects ambiguous bot rating import reports', () => {
  assert.throws(
    () => buildBotRatingSnapshotPlan(report({ variant: null }), []),
    /requires a single report variant/,
  );
  assert.throws(
    () => buildBotRatingSnapshotPlan(report({ timeControlBucket: 'untimed' }), []),
    /requires an official time-control bucket/,
  );
});

function report(overrides: Partial<EngineEloReport> = {}): EngineEloReport {
  return {
    anchorEngineId: 'python-random-legal',
    eligibleGames: 16,
    excludedGames: 0,
    minAnchorGames: 8,
    rows: [row()],
    timeControlBucket: 'tc-180+2',
    totalRatedGames: 16,
    variant: 'dark-chess',
    ...overrides,
  };
}

function row(overrides: Partial<EngineEloRow> = {}): EngineEloRow {
  return {
    ciSimple: 100,
    ciWilson: 90,
    draws: 0,
    elo: 0,
    engineId: 'python-v2-v1.5',
    games: 8,
    isAnchor: false,
    losses: 0,
    score: 8,
    scoreRate: 1,
    status: 'rated',
    wins: 8,
    ...overrides,
  };
}
