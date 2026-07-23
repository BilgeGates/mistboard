/**
 * Opening-explorer aggregation. The statistics this produces are published as
 * fact, so the pins here are about not lying: transpositions must merge, a
 * corrupt game must contribute nothing at all rather than a truncated prefix,
 * results must land in the bucket they actually belong to, and the fold must
 * stop at the configured depth.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { XiangqiMove } from '@mistboard/game';
import {
  accumulateGame,
  createAccumulator,
  DEFAULT_AGGREGATE_OPTIONS,
} from './xiangqi-opening-aggregate.js';

const START = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR r';

function moves(...pairs: string[]): XiangqiMove[] {
  return pairs.map((pair) => ({
    from: pair.slice(0, pair.length - 2),
    to: pair.slice(pair.length - 2),
  })) as XiangqiMove[];
}

test('folds a game into per-position move counts split by result', () => {
  const acc = createAccumulator();
  const ok = accumulateGame(acc, { id: 'g1', result: '1-0', moves: moves('h3e3', 'h10g8') });

  assert.equal(ok, true);
  const opening = acc.get(START);
  assert.ok(opening);
  const stats = opening.get('h3e3');
  assert.deepEqual(stats, {
    games: 1,
    redWins: 1,
    blackWins: 0,
    draws: 0,
    unknowns: 0,
    sampleGameIds: ['g1'],
  });
});

test('an unknown result is counted, never guessed', () => {
  const acc = createAccumulator();
  accumulateGame(acc, { id: 'g1', result: '*', moves: moves('h3e3') });

  const stats = acc.get(START)?.get('h3e3');
  assert.equal(stats?.games, 1);
  assert.equal(stats?.unknowns, 1);
  assert.equal(stats?.redWins + stats?.blackWins + stats?.draws, 0);
});

test('different move orders reaching one position share its statistics', () => {
  // Central cannon and horse, played in either order, with black answering
  // symmetrically. The position after ply 4 is identical either way, so the
  // fifth move must be counted against ONE position key, not two.
  const acc = createAccumulator();
  accumulateGame(acc, {
    id: 'g1',
    result: '1-0',
    moves: moves('h3e3', 'h10g8', 'b1c3', 'b10c8', 'h1g3'),
  });
  accumulateGame(acc, {
    id: 'g2',
    result: '0-1',
    moves: moves('b1c3', 'b10c8', 'h3e3', 'h10g8', 'h1g3'),
  });

  const transposed = [...acc.entries()].filter(([, m]) => m.get('h1g3')?.games === 2);
  assert.equal(transposed.length, 1, 'the transposition should collapse to a single position');
  const stats = transposed[0]?.[1].get('h1g3');
  assert.equal(stats?.redWins, 1);
  assert.equal(stats?.blackWins, 1);
  assert.deepEqual(stats?.sampleGameIds, ['g1', 'g2']);
});

test('an illegal move list contributes nothing, not a valid prefix', () => {
  const acc = createAccumulator();
  // First move is legal, second is not (that horse cannot reach a1).
  const ok = accumulateGame(acc, { id: 'bad', result: '1-0', moves: moves('h3e3', 'h10a1') });

  assert.equal(ok, false);
  assert.equal(acc.size, 0, 'a rejected game must leave no partial statistics behind');
});

test('stops folding at the configured depth', () => {
  const acc = createAccumulator();
  accumulateGame(
    acc,
    { id: 'g1', result: '1-0', moves: moves('h3e3', 'h10g8', 'h1g3', 'b10c8') },
    { ...DEFAULT_AGGREGATE_OPTIONS, maxPly: 2 },
  );

  assert.equal(acc.size, 2, 'two plies folded means two positions');
});

test('caps retained sample game ids', () => {
  const acc = createAccumulator();
  for (let i = 0; i < 5; i += 1) {
    accumulateGame(
      acc,
      { id: `g${i}`, result: '1-0', moves: moves('h3e3') },
      { ...DEFAULT_AGGREGATE_OPTIONS, sampleLimit: 2 },
    );
  }

  const stats = acc.get(START)?.get('h3e3');
  assert.equal(stats?.games, 5, 'every game still counts');
  assert.deepEqual(stats?.sampleGameIds, ['g0', 'g1'], 'only the cap is retained');
});
