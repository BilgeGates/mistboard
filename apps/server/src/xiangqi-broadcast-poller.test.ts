import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  interpretXiangqiBroadcastSourceBody,
  nextXiangqiBroadcastPollDelayMs,
  XIANGQI_BROADCAST_MANIFEST_MAX_SOURCES,
  XIANGQI_BROADCAST_MANIFEST_SCHEMA,
  type XiangqiBroadcastPollResult,
  xiangqiBroadcastPollSchedule,
} from './xiangqi-broadcast-poller.js';

const WXF_FIXTURE_HTML = readFileSync(
  fileURLToPath(new URL('../fixtures/wxf-dhtmlxq/2019-wxc-men-r1a-mini.html', import.meta.url)),
  'utf-8',
);

const okResult: XiangqiBroadcastPollResult = {
  ok: true,
  sourceUrl: 'https://fixture.invalid/source.json',
  dryRun: false,
  tourSlug: 'fixture',
  roundsImported: 1,
  boardsSeen: 2,
  boardsFailed: 0,
  sourcesSeen: 1,
  sourcesFailed: 0,
  updates: [],
  sources: [],
};

const failedResult: XiangqiBroadcastPollResult = {
  ok: false,
  sourceUrl: 'https://fixture.invalid/source.json',
  dryRun: false,
  kind: 'source_timeout',
  message: 'source timed out after 1000ms',
};

test('xiangqi broadcast poll schedule clamps unsafe operator inputs', () => {
  assert.deepEqual(
    xiangqiBroadcastPollSchedule({
      intervalMs: 10,
      maxIntervalMs: 10,
      backoffMultiplier: 0,
    }),
    {
      intervalMs: 250,
      maxIntervalMs: 250,
      backoffMultiplier: 1,
    },
  );
});

test('xiangqi broadcast poll backoff grows on failures and resets on success', () => {
  const schedule = xiangqiBroadcastPollSchedule({
    intervalMs: 1000,
    maxIntervalMs: 8000,
    backoffMultiplier: 2,
  });

  const firstFailureDelay = nextXiangqiBroadcastPollDelayMs({
    result: failedResult,
    previousDelayMs: schedule.intervalMs,
    schedule,
  });
  const secondFailureDelay = nextXiangqiBroadcastPollDelayMs({
    result: failedResult,
    previousDelayMs: firstFailureDelay,
    schedule,
  });
  const cappedFailureDelay = nextXiangqiBroadcastPollDelayMs({
    result: failedResult,
    previousDelayMs: 8000,
    schedule,
  });
  const successDelay = nextXiangqiBroadcastPollDelayMs({
    result: okResult,
    previousDelayMs: cappedFailureDelay,
    schedule,
  });

  assert.equal(firstFailureDelay, 2000);
  assert.equal(secondFailureDelay, 4000);
  assert.equal(cappedFailureDelay, 8000);
  assert.equal(successDelay, 1000);
});

test('source body interpreter recognizes canonical JSON snapshots', () => {
  const body = interpretXiangqiBroadcastSourceBody(
    JSON.stringify({ tour: { slug: 'fixture' }, rounds: [], boards: [] }),
  );
  assert.equal(body.kind, 'snapshot');
});

test('source body interpreter recognizes WXF DhtmlXQ pages', () => {
  const body = interpretXiangqiBroadcastSourceBody(WXF_FIXTURE_HTML);
  assert.equal(body.kind, 'wxf-dhtmlxq');
});

test('source body interpreter recognizes source manifests', () => {
  const body = interpretXiangqiBroadcastSourceBody(
    JSON.stringify({
      schema: XIANGQI_BROADCAST_MANIFEST_SCHEMA,
      sources: [
        { url: 'https://fixture.invalid/r1a.html', roundId: 'r1a' },
        { url: 'https://fixture.invalid/r1b.html', roundId: 'r1b', roundName: 'Round 1b' },
      ],
    }),
  );
  assert.equal(body.kind, 'manifest');
  assert.deepEqual(body.kind === 'manifest' ? body.manifest.sources : [], [
    { url: 'https://fixture.invalid/r1a.html', roundId: 'r1a' },
    { url: 'https://fixture.invalid/r1b.html', roundId: 'r1b', roundName: 'Round 1b' },
  ]);
});

test('source body interpreter rejects malformed manifests and bodies', () => {
  const emptySources = interpretXiangqiBroadcastSourceBody(
    JSON.stringify({ schema: XIANGQI_BROADCAST_MANIFEST_SCHEMA, sources: [] }),
  );
  assert.equal(emptySources.kind, 'malformed');

  const missingUrl = interpretXiangqiBroadcastSourceBody(
    JSON.stringify({ schema: XIANGQI_BROADCAST_MANIFEST_SCHEMA, sources: [{ roundId: 'r1' }] }),
  );
  assert.equal(missingUrl.kind, 'malformed');

  const oversized = interpretXiangqiBroadcastSourceBody(
    JSON.stringify({
      schema: XIANGQI_BROADCAST_MANIFEST_SCHEMA,
      sources: Array.from({ length: XIANGQI_BROADCAST_MANIFEST_MAX_SOURCES + 1 }, (_, index) => ({
        url: `https://fixture.invalid/page-${index}.html`,
      })),
    }),
  );
  assert.equal(oversized.kind, 'malformed');

  const badJsonShape = interpretXiangqiBroadcastSourceBody(
    JSON.stringify({ malformed: true, boards: { bad: true } }),
  );
  assert.equal(badJsonShape.kind, 'malformed');

  const notASource = interpretXiangqiBroadcastSourceBody('<html><body>plain page</body></html>');
  assert.equal(notASource.kind, 'malformed');
});
