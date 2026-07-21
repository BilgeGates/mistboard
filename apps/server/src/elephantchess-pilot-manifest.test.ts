import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildElephantChessPilotManifest,
  type ElephantChessPilotGame,
  renderElephantChessPilotManifest,
  verifyElephantChessPilotManifest,
} from './elephantchess-pilot-manifest.js';

const BATCH = 'batch-elephant-2026-06';

function game(index: number, correspondence = false): ElephantChessPilotGame {
  const timeControls = ['BLITZ', 'RAPID', 'CLASSICAL'];
  const results: ElephantChessPilotGame['result'][] = ['1-0', '0-1', '1/2-1/2'];
  return {
    historicalGameId: `historical-${index.toString().padStart(5, '0')}`,
    sourceGameId: `source-${index.toString().padStart(5, '0')}`,
    importBatchId: BATCH,
    plyCount: 24 + (index % 130),
    result: results[index % results.length] as ElephantChessPilotGame['result'],
    redEloBefore: index % 17 === 0 ? null : 1000 + (index % 1200),
    blackEloBefore: index % 19 === 0 ? null : 1050 + ((index * 7) % 1150),
    timeControlCategory: correspondence ? 'CORRESPONDENCE' : (timeControls[index % 3] as string),
    ratingMode: index % 11 === 0 ? null : index % 2 === 0 ? 'rated' : 'casual',
    redPlayerId: `red-${index % 180}`,
    blackPlayerId: `black-${index % 170}`,
  };
}

function corpus(live: number, correspondence: number): ElephantChessPilotGame[] {
  return [
    ...Array.from({ length: live }, (_, index) => game(index)),
    ...Array.from({ length: correspondence }, (_, index) => game(live + index, true)),
  ];
}

test('builds the frozen 800/100/100 pilot deterministically', () => {
  const games = corpus(1_100, 120);
  const options = { importBatchId: BATCH, seed: 'pilot-seed-v1' };
  const manifest = buildElephantChessPilotManifest(games, options);
  const reversed = buildElephantChessPilotManifest([...games].reverse(), options);

  assert.equal(manifest.counts.selected, 1_000);
  assert.equal(manifest.counts.representativeLive, 800);
  assert.equal(manifest.counts.coverageLive, 100);
  assert.equal(manifest.counts.correspondence, 100);
  assert.equal(manifest.games.length, 1_000);
  assert.equal(new Set(manifest.games.map((item) => item.historicalGameId)).size, 1_000);
  assert.equal(manifest.manifestSha256.length, 64);
  assert.equal(
    renderElephantChessPilotManifest(manifest),
    renderElephantChessPilotManifest(reversed),
  );
});

test('returns an undersized correspondence quota to representative live', () => {
  const manifest = buildElephantChessPilotManifest(corpus(1_100, 40), {
    importBatchId: BATCH,
    seed: 'pilot-seed-v1',
  });
  assert.equal(manifest.counts.representativeLive, 860);
  assert.equal(manifest.counts.coverageLive, 100);
  assert.equal(manifest.counts.correspondence, 40);
  assert.equal(manifest.counts.selected, 1_000);
});

test('coverage cohort spans result, length, rating, Elo, and time-control buckets', () => {
  const manifest = buildElephantChessPilotManifest(corpus(1_100, 120), {
    importBatchId: BATCH,
    seed: 'coverage-seed',
  });
  const coverage = manifest.games.filter((item) => item.cohort === 'coverage-live');
  assert.ok(new Set(coverage.map((item) => item.result)).size >= 3);
  assert.ok(new Set(coverage.map((item) => item.lengthBand)).size >= 4);
  assert.ok(new Set(coverage.map((item) => item.ratingMode)).size >= 3);
  assert.ok(new Set(coverage.map((item) => item.eloQuartile)).size >= 4);
  assert.ok(new Set(coverage.map((item) => item.timeControlCategory)).size >= 3);
});

test('keeps exact 1000-vs-1000 defaults out of the Elo quartile population', () => {
  const games = corpus(1_100, 120).map((item, index) =>
    index < 360
      ? { ...item, redEloBefore: 1_000, blackEloBefore: 1_000 }
      : {
          ...item,
          redEloBefore: 940 + (index % 180),
          blackEloBefore: 950 + ((index * 3) % 170),
        },
  );
  const manifest = buildElephantChessPilotManifest(games, {
    importBatchId: BATCH,
    seed: 'default-rating-seed',
  });

  assert.equal(manifest.eloStratification.defaultRatingValue, 1_000);
  assert.equal(manifest.eloStratification.quartilePopulation, 'at-least-one-non-default-rating');
  assert.ok(new Set(manifest.eloStratification.quartileCuts).size > 1);
  const defaultRow = manifest.distributions.eloQuartile.find(
    (row) => row.bucket === 'DEFAULT_1000',
  );
  assert.equal(defaultRow?.eligible, 360);
  assert.ok((defaultRow?.selected ?? 0) > 0);
  for (const quartile of ['Q1', 'Q2', 'Q3', 'Q4']) {
    assert.ok(
      manifest.distributions.eloQuartile.some((row) => row.bucket === quartile && row.eligible > 0),
    );
  }
});

test('rejects insufficient, duplicate, and cross-batch inputs', () => {
  assert.throws(
    () =>
      buildElephantChessPilotManifest(corpus(800, 20), {
        importBatchId: BATCH,
        seed: 'pilot-seed-v1',
      }),
    /needs 1000 eligible games/,
  );

  const duplicates = corpus(1_100, 120);
  duplicates[1] = {
    ...(duplicates[1] as ElephantChessPilotGame),
    historicalGameId: duplicates[0]!.historicalGameId,
  };
  assert.throws(
    () =>
      buildElephantChessPilotManifest(duplicates, { importBatchId: BATCH, seed: 'pilot-seed-v1' }),
    /duplicate historical game id/,
  );

  const wrongBatch = corpus(1_100, 120);
  wrongBatch[0] = { ...(wrongBatch[0] as ElephantChessPilotGame), importBatchId: 'other-batch' };
  assert.throws(
    () =>
      buildElephantChessPilotManifest(wrongBatch, { importBatchId: BATCH, seed: 'pilot-seed-v1' }),
    /unexpected import batch/,
  );
});

test('verifies the internal content hash and ordered membership', () => {
  const manifest = buildElephantChessPilotManifest(corpus(1_100, 120), {
    importBatchId: BATCH,
    seed: 'verified-manifest',
  });
  assert.deepEqual(verifyElephantChessPilotManifest(manifest), manifest);
  assert.throws(
    () => verifyElephantChessPilotManifest({ ...manifest, seed: 'tampered' }),
    /content hash mismatch/,
  );
  assert.throws(
    () =>
      verifyElephantChessPilotManifest({
        ...manifest,
        games: manifest.games.map((item, index) =>
          index === 0 ? { ...item, selectionIndex: 1 } : item,
        ),
      }),
    /selection index .* out of order/,
  );
});
