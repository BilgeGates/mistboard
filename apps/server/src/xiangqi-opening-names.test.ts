/**
 * Named openings for the explorer header. The pins that matter: an established
 * name resolves for the real position a game reaches, a name is mirror-invariant
 * (a line and its mirror are one opening), and a pending name never leaks out
 * before it is confirmed.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyStandardXiangqiMove,
  createInitialXiangqiState,
  standardXiangqiPositionKey,
  type XiangqiMove,
} from '@mistboard/game';
import { canonicalPosition } from './xiangqi-opening-mirror.js';
import { allOpeningNames, openingNameForCanonicalKey } from './xiangqi-opening-names.js';

function nameAfter(...pairs: Array<[string, string]>): { en: string; zh: string } | null {
  let state = createInitialXiangqiState('t');
  for (const [from, to] of pairs) {
    state = applyStandardXiangqiMove(state, { from, to } as XiangqiMove);
  }
  const key = canonicalPosition(standardXiangqiPositionKey(state)).key;
  return openingNameForCanonicalKey(key);
}

test('names the Central Cannon from the position a game actually reaches', () => {
  assert.deepEqual(nameAfter(['b3', 'e3']), { en: 'Central Cannon', zh: '中炮' });
});

test('the central cannon from either side is one opening', () => {
  // 炮二平五 and 炮八平五 are mirror images. Both must resolve to the same name,
  // which is the whole reason the table is keyed by the canonical position.
  const right = nameAfter(['b3', 'e3']);
  const left = nameAfter(['h3', 'e3']);
  assert.deepEqual(right, left);
  assert.deepEqual(left, { en: 'Central Cannon', zh: '中炮' });
});

test('names the other established first-move openings', () => {
  assert.deepEqual(nameAfter(['c1', 'e3']), { en: 'Elephant Opening', zh: '飞相局' });
  assert.deepEqual(nameAfter(['b1', 'c3']), { en: 'Horse Opening', zh: '起马局' });
  assert.deepEqual(nameAfter(['c4', 'c5']), { en: 'Pawn Opening', zh: '仙人指路' });
});

test('a pending name is data but never served', () => {
  const pending = allOpeningNames().filter((name) => name.status === 'pending');
  assert.ok(pending.length > 0, 'this test is meaningless if nothing is pending');
  for (const name of pending) {
    assert.equal(
      openingNameForCanonicalKey(name.key),
      null,
      `${name.en} is pending and must not resolve until confirmed`,
    );
  }
});

test('an unnamed position resolves to null', () => {
  assert.equal(nameAfter(['b1', 'c3'], ['b10', 'c8'], ['h1', 'g3'], ['h10', 'g8']), null);
});

test('every stored key is already mirror-canonical', () => {
  // A key that is not its own canonical form could never be hit by the route,
  // which always looks up the canonical key — a silent dead entry.
  for (const name of allOpeningNames()) {
    assert.equal(
      canonicalPosition(name.key).key,
      name.key,
      `${name.en} is keyed by a non-canonical position and would never resolve`,
    );
  }
});
