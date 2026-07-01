import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  interleaveByVariant,
  leadWithMostRecent,
  type RecentEveGameRecord,
} from './persistence-games.js';

// Only .variant and .roomId matter to the round-robin; cast a minimal record.
const g = (roomId: string, variant: string): RecentEveGameRecord =>
  ({ roomId, variant }) as unknown as RecentEveGameRecord;

// leadWithMostRecent also reads .endedAt.
const gt = (roomId: string, endedAt: string): RecentEveGameRecord =>
  ({ roomId, endedAt: new Date(endedAt) }) as unknown as RecentEveGameRecord;

describe('showcase interleave', () => {
  test('round-robins across variants: breadth first, volume in the tail', () => {
    // Input is tier-then-recency ordered; first-appearance order is A, B, C.
    const input = [g('a1', 'A'), g('a2', 'A'), g('b1', 'B'), g('c1', 'C'), g('c2', 'C')];
    const out = interleaveByVariant(input, 5).map((r) => r.roomId);
    // One of each variant up front, then the remaining games (B already dry).
    assert.deepEqual(out, ['a1', 'b1', 'c1', 'a2', 'c2']);
  });

  test('caps at the pool size', () => {
    const input = [g('a1', 'A'), g('a2', 'A'), g('b1', 'B'), g('c1', 'C')];
    assert.deepEqual(
      interleaveByVariant(input, 3).map((r) => r.roomId),
      ['a1', 'b1', 'c1'],
    );
  });

  test('a single variant keeps its input (tier) order', () => {
    const input = [g('a1', 'A'), g('a2', 'A'), g('a3', 'A')];
    assert.deepEqual(
      interleaveByVariant(input, 10).map((r) => r.roomId),
      ['a1', 'a2', 'a3'],
    );
  });

  test('does not repeat a variant back-to-back until the others run dry', () => {
    const input = [g('a1', 'A'), g('a2', 'A'), g('a3', 'A'), g('b1', 'B')];
    // A leads, then B; A only repeats once B is exhausted.
    assert.deepEqual(
      interleaveByVariant(input, 10).map((r) => r.roomId),
      ['a1', 'b1', 'a2', 'a3'],
    );
  });

  test('empty input yields an empty pool', () => {
    assert.deepEqual(interleaveByVariant([], 5), []);
  });
});

describe('showcase recency lead', () => {
  test('moves the single most-recent game to the front, keeping the rest in place', () => {
    const input = [
      gt('a', '2026-07-01T10:00:00Z'),
      gt('b', '2026-07-01T12:00:00Z'), // newest
      gt('c', '2026-07-01T11:00:00Z'),
    ];
    assert.deepEqual(
      leadWithMostRecent(input).map((r) => r.roomId),
      ['b', 'a', 'c'],
    );
  });

  test('is a no-op when the newest is already first', () => {
    const input = [gt('a', '2026-07-01T12:00:00Z'), gt('b', '2026-07-01T09:00:00Z')];
    assert.deepEqual(
      leadWithMostRecent(input).map((r) => r.roomId),
      ['a', 'b'],
    );
  });

  test('handles 0- and 1-element pools', () => {
    assert.deepEqual(leadWithMostRecent([]), []);
    assert.equal(leadWithMostRecent([gt('a', '2026-07-01T12:00:00Z')]).length, 1);
  });
});
