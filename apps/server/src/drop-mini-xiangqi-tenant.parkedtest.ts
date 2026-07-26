import assert from 'node:assert/strict';
import test from 'node:test';
import { DROP_MINI_XIANGQI_SPEC_ID, type DropMiniXiangqiMove } from '@mistboard/game';
import {
  dropMiniXiangqiClientEventFor,
  dropMiniXiangqiTenant,
  isDropMiniXiangqiSquare,
} from './drop-mini-xiangqi-tenant.js';
import { DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID } from './server-drop-mini-xiangqi-engine.js';
import { replayTenantEvents } from './variant-tenant/runtime.js';
import type { TenantRoomEvent } from './variant-tenant/tenant.js';

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

function dropMiniSnapshotExtrasFor(redClient: string, blackClient: string) {
  const roomId = 'dmxqd_extras';
  const events: TenantRoomEvent<
    'red' | 'black',
    DropMiniXiangqiMove,
    typeof DROP_MINI_XIANGQI_SPEC_ID
  >[] = [
    { type: 'room-created', at: 1, roomId, gameSpecId: DROP_MINI_XIANGQI_SPEC_ID },
    { type: 'seat-assigned', at: 2, roomId, clientId: redClient, seat: 'red' },
    { type: 'seat-assigned', at: 3, roomId, clientId: blackClient, seat: 'black' },
  ];
  const projection = replayTenantEvents(dropMiniXiangqiTenant, events);
  const snapshotExtras = dropMiniXiangqiTenant.wire?.snapshotExtras;
  assert.ok(snapshotExtras, 'drop mini tenant must define wire.snapshotExtras');
  return snapshotExtras(
    {
      projection,
      rated: false,
      forfeitDeadline: null,
      forfeitSeat: null,
    } as never,
    { seat: 'black' } as never,
  );
}

test('Drop Mini Xiangqi snapshot marks a PvE room with the engine id', () => {
  assert.deepEqual(dropMiniSnapshotExtrasFor(DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID, 'human-1'), {
    roomMode: 'pve',
    pveEngineId: DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID,
    rated: false,
    forfeitDeadline: null,
  });
});

test('Drop Mini Xiangqi snapshot marks a human-vs-human room as PvP', () => {
  assert.deepEqual(dropMiniSnapshotExtrasFor('human-1', 'human-2'), {
    roomMode: 'pvp',
    rated: false,
    forfeitDeadline: null,
  });
});
