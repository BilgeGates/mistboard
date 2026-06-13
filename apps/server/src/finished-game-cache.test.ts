import assert from 'node:assert/strict';
import test from 'node:test';
import { FinishedGameCache } from './finished-game-cache.js';

test('returns stored values and misses unknown keys', () => {
  const cache = new FinishedGameCache<number>();
  assert.equal(cache.get('a'), undefined);
  cache.set('a', 1);
  assert.equal(cache.get('a'), 1);
});

test('expires entries past their TTL using the injected clock', () => {
  let nowMs = 1_000;
  const cache = new FinishedGameCache<string>(256, 5_000, () => nowMs);
  cache.set('room', 'payload');
  nowMs = 5_999;
  assert.equal(cache.get('room'), 'payload');
  nowMs = 6_001;
  assert.equal(cache.get('room'), undefined);
});

test('evicts the least-recently-used entry past max size', () => {
  const cache = new FinishedGameCache<number>(2);
  cache.set('a', 1);
  cache.set('b', 2);
  // Touch 'a' so 'b' becomes the eviction target.
  assert.equal(cache.get('a'), 1);
  cache.set('c', 3);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('c'), 3);
});

test('clear drops every entry', () => {
  const cache = new FinishedGameCache<number>();
  cache.set('a', 1);
  cache.clear();
  assert.equal(cache.get('a'), undefined);
});
