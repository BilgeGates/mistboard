import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendDarkMiniXiangqiRuntimeEvent,
  createDarkMiniXiangqiRuntimeRoom,
  createDarkMiniXiangqiRuntimeRoomFromEvents,
  DARK_MINI_XIANGQI_ROOM_ID_PREFIX,
  type DarkMiniXiangqiEvent,
  darkMiniXiangqiEventsForClient,
  darkMiniXiangqiSnapshotPayload,
  isDarkMiniXiangqiEventLog,
  isDarkMiniXiangqiRoomId,
  replayDarkMiniXiangqiEvents,
} from './dark-mini-xiangqi-runtime.js';

const darkMiniXiangqiKey = 'MISTBOARD_DARK_MINI_XIANGQI_ENABLED';

test('Dark Mini Xiangqi runtime is hidden while the flag is off', () => {
  const before = process.env[darkMiniXiangqiKey];
  delete process.env[darkMiniXiangqiKey];
  try {
    assert.deepEqual(createDarkMiniXiangqiRuntimeRoom('dmxq_disabled'), {
      ok: false,
      error: 'dark_mini_xiangqi_disabled',
    });
  } finally {
    restoreEnv(darkMiniXiangqiKey, before);
  }
});

test('Dark Mini Xiangqi runtime creates a 7x7 initial projection behind the flag', () => {
  const before = process.env[darkMiniXiangqiKey];
  process.env[darkMiniXiangqiKey] = 'true';
  try {
    const result = createDarkMiniXiangqiRuntimeRoom('dmxq_created', {
      creatorPreference: 'black',
      now: 123,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.room.kind, 'dark-mini-xiangqi');
    assert.equal(result.room.gameSpecId, 'dark-mini-xiangqi');
    assert.equal(result.room.events.length, 1);
    assert.deepEqual(result.room.events[0], {
      type: 'room-created',
      at: 123,
      roomId: 'dmxq_created',
      gameSpecId: 'dark-mini-xiangqi',
      creatorPreference: 'black',
    });
    assert.equal(result.room.projection.creatorPreference, 'black');
    assert.equal(result.room.projection.state.id, 'dmxq_created');
    assert.equal(Object.keys(result.room.projection.state.board).length, 24);
  } finally {
    restoreEnv(darkMiniXiangqiKey, before);
  }
});

test('Dark Mini Xiangqi event log validation requires a matching room-created event', () => {
  const events: DarkMiniXiangqiEvent[] = [
    {
      type: 'room-created',
      at: 100,
      roomId: 'dmxq_log',
      gameSpecId: 'dark-mini-xiangqi',
    },
  ];

  assert.equal(isDarkMiniXiangqiEventLog(events, 'dmxq_log'), true);
  assert.equal(isDarkMiniXiangqiEventLog(events, 'other'), false);
  assert.equal(
    isDarkMiniXiangqiEventLog([{ ...events[0], gameSpecId: 'dark-xiangqi' }], 'dmxq_log'),
    false,
  );
});

test('Dark Mini Xiangqi runtime hydrates from an event log', () => {
  const events: DarkMiniXiangqiEvent[] = [
    {
      type: 'room-created',
      at: 100,
      roomId: 'dmxq_hydrate',
      gameSpecId: 'dark-mini-xiangqi',
      creatorPreference: 'red',
    },
  ];

  const hydrated = createDarkMiniXiangqiRuntimeRoomFromEvents(events);
  assert.equal(hydrated.ok, true);
  if (!hydrated.ok) return;
  assert.equal(hydrated.room.id, 'dmxq_hydrate');
  assert.equal(hydrated.room.projection.creatorPreference, 'red');
  assert.equal(hydrated.room.projection.state.status.type, 'playing');
  assert.equal(
    hydrated.room.projection.state.status.type === 'playing'
      ? hydrated.room.projection.state.status.turn
      : null,
    'red',
  );
});

test('Dark Mini Xiangqi runtime applies seat events and filters snapshots by recipient', () => {
  const before = process.env[darkMiniXiangqiKey];
  process.env[darkMiniXiangqiKey] = 'true';
  try {
    const result = createDarkMiniXiangqiRuntimeRoom('dmxq_seats');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const { room } = result;

    appendDarkMiniXiangqiRuntimeEvent(room, {
      type: 'seat-assigned',
      at: 101,
      roomId: room.id,
      clientId: 'red-client',
      seat: 'red',
    });
    appendDarkMiniXiangqiRuntimeEvent(room, {
      type: 'seat-assigned',
      at: 102,
      roomId: room.id,
      clientId: 'black-client',
      seat: 'black',
    });

    assert.deepEqual(room.projection.seats, {
      red: 'red-client',
      black: 'black-client',
    });

    const redEvents = darkMiniXiangqiEventsForClient(room, {
      id: 'red-client',
      seat: 'red',
      solo: false,
    });
    assert.equal(
      redEvents.some((event) => event.type === 'seat-assigned' && event.seat === 'black'),
      false,
    );

    const spectatorSnapshot = darkMiniXiangqiSnapshotPayload(room, {
      id: 'spectator',
      seat: 'spectator',
      solo: false,
    });
    assert.deepEqual(spectatorSnapshot.events, []);
    assert.deepEqual(spectatorSnapshot.state.board, {});
  } finally {
    restoreEnv(darkMiniXiangqiKey, before);
  }
});

test('Dark Mini Xiangqi runtime exposes its room id prefix predicate', () => {
  assert.equal(DARK_MINI_XIANGQI_ROOM_ID_PREFIX, 'dmxq_');
  assert.equal(isDarkMiniXiangqiRoomId('dmxq_abc'), true);
  assert.equal(isDarkMiniXiangqiRoomId('dxq_abc'), false);
});

test('Dark Mini Xiangqi replay ignores mismatched-room events', () => {
  const projection = replayDarkMiniXiangqiEvents([
    {
      type: 'room-created',
      at: 100,
      roomId: 'dmxq_a',
      gameSpecId: 'dark-mini-xiangqi',
    },
    {
      type: 'room-created',
      at: 101,
      roomId: 'dmxq_b',
      gameSpecId: 'dark-mini-xiangqi',
      creatorPreference: 'black',
    },
  ]);

  assert.equal(projection.roomId, 'dmxq_a');
  assert.equal(projection.creatorPreference, undefined);
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
