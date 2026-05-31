import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import test from 'node:test';
import { clientIpForRateLimit, createAuthRateLimiter } from './auth-rate-limit.js';

test('auth rate limiter allows up to the limit then rejects within the window', () => {
  const limiter = createAuthRateLimiter(3, 60_000);
  const now = 1_000;
  assert.equal(limiter.check('ip-a', now), true);
  assert.equal(limiter.check('ip-a', now), true);
  assert.equal(limiter.check('ip-a', now), true);
  // Fourth hit in the same window is over budget.
  assert.equal(limiter.check('ip-a', now), false);
});

test('auth rate limiter keys are independent', () => {
  const limiter = createAuthRateLimiter(1, 60_000);
  const now = 1_000;
  assert.equal(limiter.check('ip-a', now), true);
  assert.equal(limiter.check('ip-a', now), false);
  // A different key has its own budget and is unaffected.
  assert.equal(limiter.check('ip-b', now), true);
});

test('auth rate limiter budget refreshes once old hits leave the window', () => {
  const limiter = createAuthRateLimiter(2, 60_000);
  assert.equal(limiter.check('ip-a', 0), true);
  assert.equal(limiter.check('ip-a', 0), true);
  assert.equal(limiter.check('ip-a', 0), false);
  // Past the window the earlier hits are pruned and the budget is available.
  assert.equal(limiter.check('ip-a', 60_001), true);
});

test('clientIpForRateLimit prefers the first x-forwarded-for hop', () => {
  const request = {
    headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    socket: { remoteAddress: '10.0.0.1' },
  } as unknown as IncomingMessage;
  assert.equal(clientIpForRateLimit(request), '203.0.113.7');
});

test('clientIpForRateLimit falls back to the socket address', () => {
  const request = {
    headers: {},
    socket: { remoteAddress: '198.51.100.4' },
  } as unknown as IncomingMessage;
  assert.equal(clientIpForRateLimit(request), '198.51.100.4');
});

test('clientIpForRateLimit returns a stable key when no address is available', () => {
  const request = {
    headers: { 'x-forwarded-for': '' },
    socket: {},
  } as unknown as IncomingMessage;
  assert.equal(clientIpForRateLimit(request), 'unknown');
});
