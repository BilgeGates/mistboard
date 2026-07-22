import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEngineEloMleReport,
  buildEngineEloReport,
  deriveAnchorEngineId,
  type EngineEloGameRow,
  renderEngineEloReportMarkdown,
} from './engine-elo-report.js';

test('scores Xiangqi red-wins as a win for the first-mover Eve slot', () => {
  const report = buildEngineEloReport(
    [
      {
        anchorEngineId: 'pikafish-xiangqi-level-1',
        blackEngineId: 'pikafish-xiangqi-level-3',
        gameId: 'xq-eve-1',
        jobId: 'job-xq',
        result: 'red-wins',
        status: 'completed',
        termination: 'checkmate',
        timeControl: { kind: 'standard', initial_seconds: 180, increment_seconds: 2 },
        tournamentId: 'xq-calibration',
        variant: 'xiangqi',
        whiteEngineId: 'pikafish-xiangqi-level-1',
      },
    ],
    { anchorEngineId: 'pikafish-xiangqi-level-1', minAnchorGames: 1 },
  );

  assert.equal(report.rows.find((row) => row.isAnchor)?.wins, 1);
  assert.equal(report.rows.find((row) => row.engineId.endsWith('level-3'))?.losses, 1);
});

test('builds anchor-relative Elo only from eligible rated games', () => {
  const report = buildEngineEloReport(
    [
      game({
        whiteEngineId: 'candidate',
        blackEngineId: 'python-random-legal',
        result: 'white-wins',
      }),
      game({
        whiteEngineId: 'python-random-legal',
        blackEngineId: 'candidate',
        result: 'black-wins',
      }),
      game({ whiteEngineId: 'candidate', blackEngineId: 'python-random-legal', result: 'draw' }),
      game({ whiteEngineId: 'candidate', blackEngineId: 'other', result: 'white-wins' }),
      game({
        whiteEngineId: 'candidate',
        blackEngineId: 'python-random-legal',
        result: 'draw',
        termination: 'truncated',
      }),
    ],
    { minAnchorGames: 3 },
  );

  assert.equal(report.totalRatedGames, 5);
  assert.equal(report.eligibleGames, 4);
  assert.equal(report.excludedGames, 1);
  assert.equal(report.timeControlBucket, 'tc-180+2');
  assert.equal(report.variant, 'dark-chess');

  const candidate = report.rows.find((row) => row.engineId === 'candidate');
  assert.equal(candidate?.status, 'rated');
  assert.equal(candidate?.games, 3);
  assert.equal(candidate?.score, 2.5);
  assert.equal(candidate?.wins, 2);
  assert.equal(candidate?.draws, 1);
  assert.equal(typeof candidate?.elo, 'number');

  const other = report.rows.find((row) => row.engineId === 'other');
  assert.equal(other?.status, 'no-anchor-games');
  assert.equal(other?.elo, null);
});

test('suppresses Elo below the anchor-game floor', () => {
  const report = buildEngineEloReport(
    [
      game({
        whiteEngineId: 'candidate',
        blackEngineId: 'python-random-legal',
        result: 'white-wins',
      }),
      game({
        whiteEngineId: 'python-random-legal',
        blackEngineId: 'candidate',
        result: 'black-wins',
      }),
    ],
    { minAnchorGames: 8 },
  );

  const candidate = report.rows.find((row) => row.engineId === 'candidate');
  assert.equal(candidate?.status, 'below-floor');
  assert.equal(candidate?.elo, null);
  assert.equal(candidate?.games, 2);

  const markdown = renderEngineEloReportMarkdown(report);
  assert.match(markdown, /floor: 8 anchor games/);
  assert.match(markdown, /below-floor/);
});

test('rejects mixed time-control buckets', () => {
  assert.throws(
    () =>
      buildEngineEloReport([
        game({ timeControl: { kind: 'standard', initial_seconds: 180, increment_seconds: 2 } }),
        game({ timeControl: { kind: 'standard', initial_seconds: 60, increment_seconds: 1 } }),
      ]),
    /cannot mix time-control buckets/,
  );
});

test('deriveAnchorEngineId returns the agreed anchor, null when absent or mixed', () => {
  assert.equal(
    deriveAnchorEngineId([
      game({ anchorEngineId: 'random-legal-xiangqi' }),
      game({ anchorEngineId: 'random-legal-xiangqi' }),
    ]),
    'random-legal-xiangqi',
  );
  assert.equal(deriveAnchorEngineId([game({ anchorEngineId: null })]), null);
  assert.equal(
    deriveAnchorEngineId([game({ anchorEngineId: 'a' }), game({ anchorEngineId: 'b' })]),
    null,
  );
});

function game(overrides: Partial<EngineEloGameRow> = {}): EngineEloGameRow {
  return {
    anchorEngineId: 'python-random-legal',
    blackEngineId: 'python-random-legal',
    gameId: `game-${Math.random()}`,
    jobId: 'job',
    result: 'white-wins',
    status: 'completed',
    termination: 'king-captured',
    timeControl: { kind: 'standard', initial_seconds: 180, increment_seconds: 2 },
    tournamentId: 'cup',
    variant: 'dark-chess',
    whiteEngineId: 'candidate',
    ...overrides,
  };
}

// ── Full-crosstable MLE model ────────────────────────────────────────────────

function mleGameRow(
  white: string,
  black: string,
  result: 'white-wins' | 'black-wins' | 'draw',
  index: number,
): EngineEloGameRow {
  return {
    anchorEngineId: 'floor',
    blackEngineId: black,
    gameId: `mle-${white}-${black}-${index}`,
    jobId: 'job-mle',
    result,
    status: 'completed',
    termination: 'checkmate',
    timeControl: { kind: 'none' },
    tournamentId: 'mle-test',
    variant: 'xiangqi',
    whiteEngineId: white,
  };
}

// Generate an integer crosstable from known true ratings and check the MLE
// recovers them (within tolerance set by rounding 100 games/pair).
test('MLE report recovers known ratings from a full crosstable', () => {
  const truth: Record<string, number> = { floor: 0, a: 200, b: 400, c: 700 };
  const engines = Object.keys(truth);
  const rows: EngineEloGameRow[] = [];
  const gamesPerPair = 100;
  for (let i = 0; i < engines.length; i += 1) {
    for (let j = i + 1; j < engines.length; j += 1) {
      const white = engines[i]!;
      const black = engines[j]!;
      const pWhite = 1 / (1 + 10 ** ((truth[black]! - truth[white]!) / 400));
      const whiteWins = Math.round(gamesPerPair * pWhite);
      for (let n = 0; n < gamesPerPair; n += 1) {
        rows.push(mleGameRow(white, black, n < whiteWins ? 'white-wins' : 'black-wins', n));
      }
    }
  }

  const report = buildEngineEloMleReport(rows, { anchorEngineId: 'floor', minGames: 8 });
  assert.equal(report.eligibleGames, rows.length);
  for (const engineId of engines) {
    const row = report.rows.find((entry) => entry.engineId === engineId);
    assert.ok(row, engineId);
    const elo = row.isAnchor ? 0 : (row.elo ?? Number.NaN);
    assert.ok(
      Math.abs(elo - truth[engineId]!) < 25,
      `${engineId}: recovered ${elo}, expected ~${truth[engineId]}`,
    );
  }
});

test('MLE report keeps a perfect scorer finite and ordered via the draw prior', () => {
  // 'top' sweeps everyone; the anchor loses everything. Without regularization
  // both ratings diverge; the prior keeps them finite and correctly ordered.
  const rows: EngineEloGameRow[] = [];
  const engines = ['floor', 'mid', 'top'];
  let index = 0;
  for (const [white, black, result] of [
    ['floor', 'mid', 'black-wins'],
    ['floor', 'top', 'black-wins'],
    ['mid', 'top', 'black-wins'],
  ] as const) {
    for (let n = 0; n < 6; n += 1) {
      rows.push(mleGameRow(white, black, result, index++));
    }
  }
  const report = buildEngineEloMleReport(rows, { anchorEngineId: 'floor', minGames: 8 });
  const byId = new Map(report.rows.map((row) => [row.engineId, row]));
  const midElo = byId.get('mid')?.elo;
  const topElo = byId.get('top')?.elo;
  assert.ok(midElo != null && Number.isFinite(midElo));
  assert.ok(topElo != null && Number.isFinite(topElo));
  assert.ok(topElo! > midElo! && midElo! > 0, `expected top > mid > 0, got ${topElo}, ${midElo}`);
  assert.equal(byId.get('floor')?.status, 'anchor');
  assert.equal(byId.get('floor')?.elo, 0);
  for (const engineId of engines) {
    assert.equal(byId.get(engineId)?.games, 12);
  }
});

test('MLE report floors rows on total games and excludes truncations', () => {
  const rows: EngineEloGameRow[] = [];
  let index = 0;
  for (let n = 0; n < 10; n += 1) rows.push(mleGameRow('floor', 'busy', 'black-wins', index++));
  rows.push(mleGameRow('floor', 'sparse', 'black-wins', index++));
  const truncated = {
    ...mleGameRow('floor', 'busy', 'black-wins', index++),
    termination: 'truncated',
  };
  rows.push(truncated);

  const report = buildEngineEloMleReport(rows, { anchorEngineId: 'floor', minGames: 8 });
  assert.equal(report.excludedGames, 1);
  const byId = new Map(report.rows.map((row) => [row.engineId, row]));
  assert.equal(byId.get('busy')?.status, 'rated');
  assert.equal(byId.get('sparse')?.status, 'below-floor');
  assert.equal(byId.get('sparse')?.elo, null);
});
