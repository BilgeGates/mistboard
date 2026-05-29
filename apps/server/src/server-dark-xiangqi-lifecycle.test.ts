import assert from 'node:assert/strict';
import test from 'node:test';
import { DARK_XIANGQI_SPEC_ID, type XiangqiColor } from '@mistboard/game';
import { createDarkXiangqiRuntimeRoomFromEvents } from './dark-xiangqi-runtime.js';
import {
  clearDarkXiangqiRuntimeTimers,
  type DarkXiangqiLifecycleClient,
  type DarkXiangqiLifecycleContext,
  type DarkXiangqiLifecycleRoom,
  darkXiangqiAbortPhaseFor,
  darkXiangqiConnectedSeats,
  darkXiangqiForfeitingSeat,
  scheduleDarkXiangqiLifecycleTimers,
} from './server-dark-xiangqi-lifecycle.js';

test('Dark Xiangqi lifecycle abort phase is unavailable until both seats are assigned', () => {
  const room = roomFixture('dxq_abort_waiting');

  assert.equal(darkXiangqiAbortPhaseFor(room), null);

  room.projection.seats.red = 'red-client';
  assert.equal(darkXiangqiAbortPhaseFor(room), null);

  room.projection.seats.black = 'black-client';
  assert.equal(darkXiangqiAbortPhaseFor(room), 'red-1');
});

test('Dark Xiangqi lifecycle abort phase advances after the opening red move', () => {
  const room = roomFixture('dxq_abort_black');
  room.projection.seats.red = 'red-client';
  room.projection.seats.black = 'black-client';
  room.projection.state.lastMove = { from: 'b3', to: 'b4' };

  assert.equal(darkXiangqiAbortPhaseFor(room), 'black-1');
});

test('Dark Xiangqi lifecycle abort phase is unavailable after both first moves', () => {
  const room = roomFixture('dxq_abort_done');
  room.projection.seats.red = 'red-client';
  room.projection.seats.black = 'black-client';
  room.projection.state.lastMove = { from: 'b3', to: 'b4' };
  room.projection.state.moveNumber = 2;

  assert.equal(darkXiangqiAbortPhaseFor(room), null);
});

test('Dark Xiangqi lifecycle connected seats ignores displaced clients', () => {
  assert.deepEqual(
    darkXiangqiConnectedSeats([
      { displaced: false, seat: 'red' },
      { displaced: true, seat: 'black' },
    ]),
    { red: true, black: false },
  );
});

test('Dark Xiangqi lifecycle chooses the missing connected seat for forfeit', () => {
  const room = roomFixture('dxq_forfeit');
  room.projection.state.moveNumber = 2;
  room.clients = new Set([client('red')]);

  assert.equal(darkXiangqiForfeitingSeat(room), 'black');

  room.clients = new Set([client('black')]);
  assert.equal(darkXiangqiForfeitingSeat(room), 'red');

  room.clients = new Set([client('red'), client('black')]);
  assert.equal(darkXiangqiForfeitingSeat(room), null);
});

test('Dark Xiangqi lifecycle scheduling arms and clears abort timers', () => {
  const room = roomFixture('dxq_schedule_abort');
  room.projection.seats.red = 'red-client';
  room.projection.seats.black = 'black-client';
  const ctx = lifecycleContext();

  scheduleDarkXiangqiLifecycleTimers(room, ctx);
  const firstDeadline = room.abortDeadline;

  assert.equal(room.abortPhase, 'red-1');
  assert.equal(firstDeadline, 1_000 + 30_000);
  assert.notEqual(room.abortTimer, null);

  scheduleDarkXiangqiLifecycleTimers(room, ctx);

  assert.equal(room.abortDeadline, firstDeadline);
  clearDarkXiangqiRuntimeTimers(room);
  assert.equal(room.abortTimer, null);
});

test('Dark Xiangqi lifecycle scheduling arms and clears forfeit timers', () => {
  const room = roomFixture('dxq_schedule_forfeit');
  room.projection.state.moveNumber = 2;
  room.clients = new Set([client('red')]);
  const ctx = lifecycleContext();

  scheduleDarkXiangqiLifecycleTimers(room, ctx);

  assert.equal(room.forfeitSeat, 'black');
  assert.equal(room.forfeitDeadline, 1_000 + 30_000);
  assert.notEqual(room.forfeitTimer, null);

  room.clients = new Set([client('red'), client('black')]);
  scheduleDarkXiangqiLifecycleTimers(room, ctx);

  assert.equal(room.forfeitSeat, null);
  assert.equal(room.forfeitDeadline, null);
  assert.equal(room.forfeitTimer, null);
});

test('Dark Xiangqi lifecycle scheduling arms and clears clock timers', () => {
  const room = roomFixture('dxq_schedule_clock');
  room.projection.clock = {
    activeColor: 'red',
    incrementMs: 0,
    initialMs: 10_000,
    remainingMs: { black: 10_000, red: 2_000 },
    runningSince: 1_000,
  };
  const ctx = lifecycleContext();

  scheduleDarkXiangqiLifecycleTimers(room, ctx);

  assert.notEqual(room.clockTimer, null);
  clearDarkXiangqiRuntimeTimers(room);
  assert.equal(room.clockTimer, null);
});

function roomFixture(roomId: string): DarkXiangqiLifecycleRoom {
  const created = createDarkXiangqiRuntimeRoomFromEvents([
    { type: 'room-created', at: 1, roomId, gameSpecId: DARK_XIANGQI_SPEC_ID },
  ]);
  if (!created.ok) throw new Error(created.error);
  const room = created.room as DarkXiangqiLifecycleRoom;
  room.clients = new Set<DarkXiangqiLifecycleClient>();
  return room;
}

function client(seat: XiangqiColor): DarkXiangqiLifecycleClient {
  return { displaced: false, seat };
}

function lifecycleContext(): DarkXiangqiLifecycleContext {
  return {
    appendEvent: async () => 0,
    broadcastEventAppended: () => {},
    now: () => 1_000,
  };
}
