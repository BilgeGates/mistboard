import assert from 'node:assert/strict';
import test from 'node:test';
import type { DropMiniXiangqiMove } from '@mistboard/game';
import {
  dropMiniXiangqiClientEventFor,
  dropMiniXiangqiTenant,
  isDropMiniXiangqiSquare,
} from './drop-mini-xiangqi-tenant.js';

test('Drop Mini Xiangqi tenant parses board moves and drop moves from client messages', () => {
  assert.deepEqual(dropMiniXiangqiTenant.rules.moveFromMessage({ from: 'd1', to: 'd2' }), {
    from: 'd1',
    to: 'd2',
  });
  assert.deepEqual(dropMiniXiangqiTenant.rules.moveFromMessage({ drop: 'horse', to: 'd4' }), {
    drop: 'horse',
    to: 'd4',
  });
  assert.equal(dropMiniXiangqiTenant.rules.moveFromMessage({ drop: 'general', to: 'd4' }), null);
  assert.equal(dropMiniXiangqiTenant.rules.moveFromMessage({ from: 'd1', to: 'h2' }), null);
  assert.equal(isDropMiniXiangqiSquare('a1'), true);
  assert.equal(isDropMiniXiangqiSquare('h1'), false);
});

test('Drop Mini Xiangqi tenant annotates public move events with global ply', () => {
  const event = {
    type: 'move-played',
    roomId: 'dmxqd_test',
    color: 'red',
    move: { from: 'd1', to: 'd2' } satisfies DropMiniXiangqiMove,
    at: 1_782_000_000_000,
  } as const;

  assert.deepEqual(dropMiniXiangqiClientEventFor(event, 'spectator', 7), {
    ...event,
    ply: 7,
  });
});
