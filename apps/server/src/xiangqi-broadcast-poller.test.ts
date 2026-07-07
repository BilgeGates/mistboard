import assert from 'node:assert/strict';
import test from 'node:test';
import {
  nextXiangqiBroadcastPollDelayMs,
  type XiangqiBroadcastPollResult,
  xiangqiBroadcastPollSchedule,
} from './xiangqi-broadcast-poller.js';

const okResult: XiangqiBroadcastPollResult = {
  ok: true,
  sourceUrl: 'https://fixture.invalid/source.json',
  tourSlug: 'fixture',
  roundsImported: 1,
  boardsSeen: 2,
  boardsFailed: 0,
  updates: [],
};

const failedResult: XiangqiBroadcastPollResult = {
  ok: false,
  sourceUrl: 'https://fixture.invalid/source.json',
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
