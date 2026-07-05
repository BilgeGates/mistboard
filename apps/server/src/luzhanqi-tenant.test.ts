import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  luzhanqiFormationForColor,
  LUZHANQI_SPEC_ID,
  type LuzhanqiColor,
  type LuzhanqiMove,
} from '@mistboard/game';
import {
  getLuzhanqiClientView,
  luzhanqiClientEventFor,
  luzhanqiTenant,
} from './luzhanqi-tenant.js';
import {
  createTenantRuntimeRoomFromEvents,
  replayTenantEvents,
  tenantEventsForClient,
  tenantSnapshotPayload,
} from './variant-tenant/runtime.js';
import type { TenantRoomEvent } from './variant-tenant/tenant.js';

test('Luzhanqi replay starts in setup and locks play after both private formations submit', () => {
  const roomId = 'lzq_setup';
  const red = luzhanqiFormationForColor('red');
  const black = luzhanqiFormationForColor('black');
  const events: TenantRoomEvent<LuzhanqiColor, LuzhanqiMove, typeof LUZHANQI_SPEC_ID>[] = [
    { type: 'room-created', at: 1, roomId, gameSpecId: LUZHANQI_SPEC_ID },
    { type: 'seat-assigned', at: 2, roomId, clientId: 'red-client', seat: 'red' },
    { type: 'seat-assigned', at: 3, roomId, clientId: 'black-client', seat: 'black' },
    { type: 'setup-submitted', at: 4, roomId, color: 'red', setup: red },
  ];

  const waiting = replayTenantEvents(luzhanqiTenant, events);
  assert.equal(waiting.state.status.type, 'setup');
  assert.equal(Object.keys(waiting.state.board).length, 25);

  events.push({ type: 'setup-submitted', at: 5, roomId, color: 'black', setup: black });
  const ready = replayTenantEvents(luzhanqiTenant, events);
  assert.deepEqual(ready.state.status, { type: 'playing', turn: 'red' });
  assert.equal(Object.keys(ready.state.board).length, 50);
});

test('Luzhanqi setup-submitted events redact the opponent private formation', () => {
  const roomId = 'lzq_redact';
  const red = luzhanqiFormationForColor('red');
  const event: TenantRoomEvent<LuzhanqiColor, LuzhanqiMove, typeof LUZHANQI_SPEC_ID> = {
    type: 'setup-submitted',
    at: 4,
    roomId,
    color: 'red',
    setup: red,
  };

  const own = luzhanqiClientEventFor(event, 'red', 0);
  assert.deepEqual(own, event);

  const opponent = luzhanqiClientEventFor(event, 'black', 0);
  assert.deepEqual(opponent, {
    type: 'setup-submitted',
    at: 4,
    roomId,
    color: 'red',
    setup: 'submitted',
  });
  assert.equal(JSON.stringify(opponent).includes('marshal'), false);
  assert.equal(luzhanqiClientEventFor(event, 'spectator', 0), null);
});

test('Luzhanqi client views hide enemy ranks before and after setup lock', () => {
  const roomId = 'lzq_view';
  const red = luzhanqiFormationForColor('red');
  const black = luzhanqiFormationForColor('black');
  const events: TenantRoomEvent<LuzhanqiColor, LuzhanqiMove, typeof LUZHANQI_SPEC_ID>[] = [
    { type: 'room-created', at: 1, roomId, gameSpecId: LUZHANQI_SPEC_ID },
    { type: 'setup-submitted', at: 2, roomId, color: 'red', setup: red },
    { type: 'setup-submitted', at: 3, roomId, color: 'black', setup: black },
  ];
  const projection = replayTenantEvents(luzhanqiTenant, events);

  const redView = getLuzhanqiClientView(projection.state, {
    id: 'red-client',
    seat: 'red',
    solo: false,
  });
  assert.deepEqual(redView.board.b1, { color: 'red', role: 'flag', known: true });
  assert.deepEqual(redView.board.b13, { color: 'black', known: false });

  const spectator = getLuzhanqiClientView(projection.state, {
    id: 'spectator',
    seat: 'spectator',
    solo: false,
  });
  assert.equal(Object.keys(spectator.board).length, 0);
});

test('Luzhanqi runtime snapshots never include the opponent setup payload', () => {
  const roomId = 'lzq_events';
  const events: TenantRoomEvent<LuzhanqiColor, LuzhanqiMove, typeof LUZHANQI_SPEC_ID>[] = [
    { type: 'room-created', at: 1, roomId, gameSpecId: LUZHANQI_SPEC_ID },
    { type: 'seat-assigned', at: 2, roomId, clientId: 'red-client', seat: 'red' },
    { type: 'seat-assigned', at: 3, roomId, clientId: 'black-client', seat: 'black' },
    {
      type: 'setup-submitted',
      at: 4,
      roomId,
      color: 'red',
      setup: luzhanqiFormationForColor('red'),
    },
  ];
  const hydrated = createTenantRuntimeRoomFromEvents(luzhanqiTenant, events);
  if (!hydrated.ok) throw new Error(hydrated.error);

  const blackEvents = tenantEventsForClient(luzhanqiTenant, hydrated.room, {
    id: 'black-client',
    seat: 'black',
    solo: false,
  });
  const setupEvent = blackEvents.find((event) => event.type === 'setup-submitted');
  assert.ok(setupEvent);
  assert.deepEqual(setupEvent.setup, 'submitted');
  assert.equal(JSON.stringify(blackEvents).includes('flag'), false);
});

test('Luzhanqi combat event streams and reconnect snapshots do not leak hidden ranks', () => {
  const roomId = 'lzq_combat_wire';
  const red = luzhanqiFormationForColor('red', {
    a5: 'lieutenant',
    a6: 'captain',
  });
  const black = luzhanqiFormationForColor('black', {
    a8: 'major',
    b10: 'lieutenant',
  });
  const move = { from: 'a6', to: 'a8' } as const;
  const events: TenantRoomEvent<LuzhanqiColor, LuzhanqiMove, typeof LUZHANQI_SPEC_ID>[] = [
    { type: 'room-created', at: 1, roomId, gameSpecId: LUZHANQI_SPEC_ID },
    { type: 'seat-assigned', at: 2, roomId, clientId: 'red-client', seat: 'red' },
    { type: 'seat-assigned', at: 3, roomId, clientId: 'black-client', seat: 'black' },
    { type: 'setup-submitted', at: 4, roomId, color: 'red', setup: red },
    { type: 'setup-submitted', at: 5, roomId, color: 'black', setup: black },
    { type: 'move-played', at: 6, roomId, color: 'red', move },
  ];
  const hydrated = createTenantRuntimeRoomFromEvents(luzhanqiTenant, events);
  if (!hydrated.ok) throw new Error(hydrated.error);

  const blackEvents = tenantEventsForClient(luzhanqiTenant, hydrated.room, {
    id: 'black-client',
    seat: 'black',
    solo: false,
  });
  const blackMoveEvent = blackEvents.find((event) => event.type === 'move-played');
  assert.deepEqual(blackMoveEvent, { type: 'move-played', at: 6, roomId, color: 'red', move, ply: 1 });
  assert.equal(JSON.stringify(blackMoveEvent).includes('captain'), false);

  const redSnapshot = tenantSnapshotPayload(luzhanqiTenant, hydrated.room, {
    id: 'red-client',
    seat: 'red',
    solo: false,
  });
  assert.deepEqual(redSnapshot.state.board.a8, { color: 'black', known: false });
  assert.deepEqual(
    redSnapshot.events.find((event) => event.type === 'setup-submitted' && event.color === 'black'),
    { type: 'setup-submitted', at: 5, roomId, color: 'black', setup: 'submitted' },
  );

  const blackSnapshot = tenantSnapshotPayload(luzhanqiTenant, hydrated.room, {
    id: 'black-client',
    seat: 'black',
    solo: false,
  });
  assert.deepEqual(blackSnapshot.state.board.a8, { color: 'black', role: 'major', known: true });
  assert.equal(blackSnapshot.state.board.a6, undefined);

  const spectatorSnapshot = tenantSnapshotPayload(luzhanqiTenant, hydrated.room, {
    id: 'spectator-client',
    seat: 'spectator',
    solo: false,
  });
  assert.deepEqual(spectatorSnapshot.events, []);
  assert.deepEqual(spectatorSnapshot.state.board, {});
});
