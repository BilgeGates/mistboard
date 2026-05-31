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

test('Dark Mini Xiangqi runtime hides opponent move events and lastMove coordinates', () => {
  const before = process.env[darkMiniXiangqiKey];
  process.env[darkMiniXiangqiKey] = 'true';
  try {
    const result = createDarkMiniXiangqiRuntimeRoom('dmxq_moves');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const { room } = result;

    appendDarkMiniXiangqiRuntimeEvent(room, {
      type: 'move-played',
      at: 101,
      roomId: room.id,
      color: 'red',
      move: { from: 'a2', to: 'a3' },
    });

    const redSnapshot = darkMiniXiangqiSnapshotPayload(room, {
      id: 'red-client',
      seat: 'red',
      solo: false,
    });
    const blackSnapshot = darkMiniXiangqiSnapshotPayload(room, {
      id: 'black-client',
      seat: 'black',
      solo: false,
    });

    assert.deepEqual(redSnapshot.state.lastMove, { from: 'a2', to: 'a3' });
    assert.equal(blackSnapshot.state.lastMove, undefined);
    assert.equal(
      redSnapshot.events.some((event) => event.type === 'move-played' && event.ply === 1),
      true,
    );
    assert.equal(
      blackSnapshot.events.some((event) => event.type === 'move-played'),
      false,
    );
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

test('Dark Mini Xiangqi runtime finishes the game when a seat resigns', () => {
  const projection = replayDarkMiniXiangqiEvents([
    { type: 'room-created', at: 100, roomId: 'dmxq_resign', gameSpecId: 'dark-mini-xiangqi' },
    { type: 'seat-resigned', at: 200, roomId: 'dmxq_resign', color: 'red' },
  ]);

  assert.deepEqual(projection.state.status, {
    type: 'finished',
    winner: 'black',
    reason: 'resignation',
  });
});

test('Dark Mini Xiangqi runtime ignores a resignation once the game is over', () => {
  const projection = replayDarkMiniXiangqiEvents([
    { type: 'room-created', at: 100, roomId: 'dmxq_resign2', gameSpecId: 'dark-mini-xiangqi' },
    { type: 'seat-resigned', at: 200, roomId: 'dmxq_resign2', color: 'red' },
    { type: 'seat-resigned', at: 300, roomId: 'dmxq_resign2', color: 'black' },
  ]);

  assert.deepEqual(projection.state.status, {
    type: 'finished',
    winner: 'black',
    reason: 'resignation',
  });
});

test('Dark Mini Xiangqi event validation accepts resignations and rejects malformed colors', () => {
  assert.equal(
    isDarkMiniXiangqiEventLog(
      [
        { type: 'room-created', at: 100, roomId: 'dmxq_v', gameSpecId: 'dark-mini-xiangqi' },
        { type: 'seat-resigned', at: 200, roomId: 'dmxq_v', color: 'black' },
      ],
      'dmxq_v',
    ),
    true,
  );
  assert.equal(
    isDarkMiniXiangqiEventLog(
      [
        { type: 'room-created', at: 100, roomId: 'dmxq_v', gameSpecId: 'dark-mini-xiangqi' },
        { type: 'seat-resigned', at: 200, roomId: 'dmxq_v', color: 'green' },
      ],
      'dmxq_v',
    ),
    false,
  );
});

test('Dark Mini Xiangqi runtime aborts a pregame room', () => {
  const projection = replayDarkMiniXiangqiEvents([
    { type: 'room-created', at: 100, roomId: 'dmxq_abort', gameSpecId: 'dark-mini-xiangqi' },
    { type: 'game-aborted', at: 200, roomId: 'dmxq_abort', reason: 'user-abort' },
  ]);

  assert.deepEqual(projection.state.status, { type: 'aborted', reason: 'user-abort' });
});

test('Dark Mini Xiangqi runtime ignores an abort once both sides have moved', () => {
  const projection = replayDarkMiniXiangqiEvents([
    { type: 'room-created', at: 100, roomId: 'dmxq_abort2', gameSpecId: 'dark-mini-xiangqi' },
    {
      type: 'move-played',
      at: 110,
      roomId: 'dmxq_abort2',
      color: 'red',
      move: { from: 'a2', to: 'a3' },
    },
    {
      type: 'move-played',
      at: 120,
      roomId: 'dmxq_abort2',
      color: 'black',
      move: { from: 'a6', to: 'a5' },
    },
    { type: 'game-aborted', at: 200, roomId: 'dmxq_abort2', reason: 'user-abort' },
  ]);

  assert.equal(projection.state.moveNumber, 2);
  assert.deepEqual(projection.state.status, { type: 'playing', turn: 'red' });
});

test('Dark Mini Xiangqi event validation accepts aborts and rejects unknown abort reasons', () => {
  assert.equal(
    isDarkMiniXiangqiEventLog(
      [
        { type: 'room-created', at: 100, roomId: 'dmxq_va', gameSpecId: 'dark-mini-xiangqi' },
        { type: 'game-aborted', at: 200, roomId: 'dmxq_va', reason: 'pregame-timeout' },
      ],
      'dmxq_va',
    ),
    true,
  );
  assert.equal(
    isDarkMiniXiangqiEventLog(
      [
        { type: 'room-created', at: 100, roomId: 'dmxq_va', gameSpecId: 'dark-mini-xiangqi' },
        { type: 'game-aborted', at: 200, roomId: 'dmxq_va', reason: 'made-up' },
      ],
      'dmxq_va',
    ),
    false,
  );
});

test('Dark Mini Xiangqi runtime finishes the game when a seat is forfeited', () => {
  const projection = replayDarkMiniXiangqiEvents([
    { type: 'room-created', at: 100, roomId: 'dmxq_ff', gameSpecId: 'dark-mini-xiangqi' },
    { type: 'seat-forfeited', at: 200, roomId: 'dmxq_ff', color: 'black' },
  ]);

  assert.deepEqual(projection.state.status, {
    type: 'finished',
    winner: 'red',
    reason: 'abandonment',
  });
});

test('Dark Mini Xiangqi event validation accepts forfeits and rejects malformed colors', () => {
  assert.equal(
    isDarkMiniXiangqiEventLog(
      [
        { type: 'room-created', at: 100, roomId: 'dmxq_vf', gameSpecId: 'dark-mini-xiangqi' },
        { type: 'seat-forfeited', at: 200, roomId: 'dmxq_vf', color: 'red' },
      ],
      'dmxq_vf',
    ),
    true,
  );
  assert.equal(
    isDarkMiniXiangqiEventLog(
      [
        { type: 'room-created', at: 100, roomId: 'dmxq_vf', gameSpecId: 'dark-mini-xiangqi' },
        { type: 'seat-forfeited', at: 200, roomId: 'dmxq_vf', color: 'purple' },
      ],
      'dmxq_vf',
    ),
    false,
  );
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
