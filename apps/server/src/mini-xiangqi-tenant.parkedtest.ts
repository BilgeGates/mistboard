import assert from 'node:assert/strict';
import test from 'node:test';
import type { MiniXiangqiMove } from '@mistboard/game';
import {
  isMiniXiangqiSquare,
  miniXiangqiClientEventFor,
  miniXiangqiTenant,
} from './mini-xiangqi-tenant.js';

test('Mini Xiangqi tenant parses board moves from client messages', () => {
  assert.deepEqual(miniXiangqiTenant.rules.moveFromMessage({ from: 'd1', to: 'd2' }), {
    from: 'd1',
    to: 'd2',
  });
  assert.equal(miniXiangqiTenant.rules.moveFromMessage({ from: 'd1', to: 'h2' }), null);
  assert.equal(miniXiangqiTenant.rules.moveFromMessage({ drop: 'horse', to: 'd4' }), null);
  assert.equal(isMiniXiangqiSquare('a1'), true);
  assert.equal(isMiniXiangqiSquare('h1'), false);
});

test('Mini Xiangqi tenant annotates public move events with global ply', () => {
  const event = {
    type: 'move-played',
    roomId: 'mxq_test',
    color: 'red',
    move: { from: 'd1', to: 'd2' } satisfies MiniXiangqiMove,
    at: 1_782_000_000_000,
  } as const;

  assert.deepEqual(miniXiangqiClientEventFor(event, 'spectator', 7), {
    ...event,
    ply: 7,
  });
});
