import assert from 'node:assert/strict';
import test from 'node:test';
import { DARK_MINI_XIANGQI_SPEC_ID, type MiniXiangqiColor } from '@mistboard/game';
import { createDarkMiniXiangqiRuntimeRoomFromEvents } from './dark-mini-xiangqi-runtime.js';
import {
  clearDarkMiniXiangqiRuntimeTimers,
  type DarkMiniXiangqiLifecycleClient,
  type DarkMiniXiangqiLifecycleContext,
  type DarkMiniXiangqiLifecycleRoom,
  darkMiniXiangqiAbortPhaseFor,
  darkMiniXiangqiConnectedSeats,
  darkMiniXiangqiForfeitingSeat,
  scheduleDarkMiniXiangqiLifecycleTimers,
} from './server-dark-mini-xiangqi-lifecycle.js';

test('Dark Mini Xiangqi lifecycle abort phase is unavailable until both seats are assigned', () => {
  const room = roomFixture('dmxq_abort_waiting');

  assert.equal(darkMiniXiangqiAbortPhaseFor(room), null);

  room.projection.seats.red = 'red-client';
  assert.equal(darkMiniXiangqiAbortPhaseFor(room), null);

  room.projection.seats.black = 'black-client';
  assert.equal(darkMiniXiangqiAbortPhaseFor(room), 'red-1');
});

test('Dark Mini Xiangqi lifecycle abort phase advances after the opening red move', () => {
  const room = roomFixture('dmxq_abort_black');
  room.projection.seats.red = 'red-client';
  room.projection.seats.black = 'black-client';
  room.projection.state.lastMove = { from: 'a2', to: 'a3' };

  assert.equal(darkMiniXiangqiAbortPhaseFor(room), 'black-1');
});

test('Dark Mini Xiangqi lifecycle abort phase is unavailable after both first moves', () => {
  const room = roomFixture('dmxq_abort_done');
  room.projection.seats.red = 'red-client';
  room.projection.seats.black = 'black-client';
  room.projection.state.lastMove = { from: 'a2', to: 'a3' };
  room.projection.state.moveNumber = 2;

  assert.equal(darkMiniXiangqiAbortPhaseFor(room), null);
});

test('Dark Mini Xiangqi lifecycle connected seats ignores displaced clients', () => {
  assert.deepEqual(
    darkMiniXiangqiConnectedSeats([
      { displaced: false, seat: 'red' },
      { displaced: true, seat: 'black' },
    ]),
    { red: true, black: false },
  );
});

test('Dark Mini Xiangqi lifecycle chooses the missing connected seat for forfeit', () => {
  const room = roomFixture('dmxq_forfeit');
  room.projection.state.moveNumber = 2;
  room.clients = new Set([client('red')]);

  assert.equal(darkMiniXiangqiForfeitingSeat(room), 'black');

  room.clients = new Set([client('black')]);
  assert.equal(darkMiniXiangqiForfeitingSeat(room), 'red');

  room.clients = new Set([client('red'), client('black')]);
  assert.equal(darkMiniXiangqiForfeitingSeat(room), null);
});

test('Dark Mini Xiangqi lifecycle scheduling arms and clears abort timers', () => {
  const room = roomFixture('dmxq_schedule_abort');
  room.projection.seats.red = 'red-client';
  room.projection.seats.black = 'black-client';
  const ctx = lifecycleContext();

  scheduleDarkMiniXiangqiLifecycleTimers(room, ctx);
  const firstDeadline = room.abortDeadline;

  assert.equal(room.abortPhase, 'red-1');
  assert.equal(firstDeadline, 1_000 + 30_000);
  assert.notEqual(room.abortTimer, null);

  scheduleDarkMiniXiangqiLifecycleTimers(room, ctx);

  assert.equal(room.abortDeadline, firstDeadline);
  clearDarkMiniXiangqiRuntimeTimers(room);
  assert.equal(room.abortTimer, null);
});

test('Dark Mini Xiangqi lifecycle scheduling arms and clears forfeit timers', () => {
  const room = roomFixture('dmxq_schedule_forfeit');
  room.projection.state.moveNumber = 2;
  room.clients = new Set([client('red')]);
  const ctx = lifecycleContext();

  scheduleDarkMiniXiangqiLifecycleTimers(room, ctx);

  assert.equal(room.forfeitSeat, 'black');
  assert.equal(room.forfeitDeadline, 1_000 + 30_000);
  assert.notEqual(room.forfeitTimer, null);

  room.clients = new Set([client('red'), client('black')]);
  scheduleDarkMiniXiangqiLifecycleTimers(room, ctx);

  assert.equal(room.forfeitSeat, null);
  assert.equal(room.forfeitDeadline, null);
  assert.equal(room.forfeitTimer, null);
});

function roomFixture(roomId: string): DarkMiniXiangqiLifecycleRoom {
  const created = createDarkMiniXiangqiRuntimeRoomFromEvents([
    { type: 'room-created', at: 1, roomId, gameSpecId: DARK_MINI_XIANGQI_SPEC_ID },
  ]);
  if (!created.ok) throw new Error(created.error);
  const room = created.room as DarkMiniXiangqiLifecycleRoom;
  room.clients = new Set<DarkMiniXiangqiLifecycleClient>();
  return room;
}

function client(seat: MiniXiangqiColor): DarkMiniXiangqiLifecycleClient {
  return { displaced: false, seat };
}

function lifecycleContext(): DarkMiniXiangqiLifecycleContext {
  return {
    appendEvent: async () => 0,
    broadcastEventAppended: () => {},
    now: () => 1_000,
  };
}
