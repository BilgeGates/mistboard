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

test('Dark Mini Xiangqi snapshots identify PvE rooms by engine-held seats', () => {
  const before = process.env[darkMiniXiangqiKey];
  process.env[darkMiniXiangqiKey] = 'true';
  try {
    const result = createDarkMiniXiangqiRuntimeRoom('dmxq_pve');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const { room } = result;

    appendDarkMiniXiangqiRuntimeEvent(room, {
      type: 'seat-assigned',
      at: 101,
      roomId: room.id,
      clientId: 'python-dmx-v1.0',
      seat: 'black',
    });

    const redSnapshot = darkMiniXiangqiSnapshotPayload(room, {
      id: 'red-client',
      seat: 'red',
      solo: false,
    });
    assert.equal(redSnapshot.mode, 'pve');
    assert.equal(redSnapshot.pveEngineId, 'python-dmx-v1.0');
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

test('Dark Mini Xiangqi runtime seeds a frozen clock and clock-started event when timed', () => {
  const before = process.env[darkMiniXiangqiKey];
  process.env[darkMiniXiangqiKey] = 'true';
  try {
    const result = createDarkMiniXiangqiRuntimeRoom('dmxq_clock', {
      now: 1000,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const { room } = result;

    assert.equal(
      room.events.some((event) => event.type === 'clock-started'),
      true,
    );
    assert.deepEqual(room.projection.timeControl, { initialMs: 180_000, incrementMs: 2_000 });
    assert.deepEqual(room.projection.clock, {
      activeColor: null,
      incrementMs: 2_000,
      initialMs: 180_000,
      remainingMs: { black: 180_000, red: 180_000 },
      runningSince: null,
    });

    const snapshot = darkMiniXiangqiSnapshotPayload(room, {
      id: 'red-client',
      seat: 'red',
      solo: false,
    });
    assert.deepEqual(snapshot.timeControl, { initialMs: 180_000, incrementMs: 2_000 });
    assert.ok(snapshot.clock);
  } finally {
    restoreEnv(darkMiniXiangqiKey, before);
  }
});

test('Dark Mini Xiangqi runtime arms and advances the clock across the opening moves', () => {
  const before = process.env[darkMiniXiangqiKey];
  process.env[darkMiniXiangqiKey] = 'true';
  try {
    const result = createDarkMiniXiangqiRuntimeRoom('dmxq_clock_run', {
      now: 1000,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const { room } = result;

    // Red's first move adds the increment but does not arm the clock.
    appendDarkMiniXiangqiRuntimeEvent(room, {
      type: 'move-played',
      at: 1_000,
      roomId: room.id,
      color: 'red',
      move: { from: 'a2', to: 'a3' },
    });
    assert.equal(room.projection.clock?.runningSince, null);
    assert.equal(room.projection.clock?.remainingMs.red, 182_000);

    // Black's first move arms the clock for Red.
    appendDarkMiniXiangqiRuntimeEvent(room, {
      type: 'move-played',
      at: 2_000,
      roomId: room.id,
      color: 'black',
      move: { from: 'a6', to: 'a5' },
    });
    assert.deepEqual(room.projection.clock, {
      activeColor: 'red',
      incrementMs: 2_000,
      initialMs: 180_000,
      remainingMs: { black: 182_000, red: 182_000 },
      runningSince: 2_000,
    });

    // Red spends 3s, gets the increment, hands the active clock to Black.
    appendDarkMiniXiangqiRuntimeEvent(room, {
      type: 'move-played',
      at: 5_000,
      roomId: room.id,
      color: 'red',
      move: { from: 'a3', to: 'a4' },
    });
    assert.deepEqual(room.projection.clock, {
      activeColor: 'black',
      incrementMs: 2_000,
      initialMs: 180_000,
      remainingMs: { black: 182_000, red: 181_000 },
      runningSince: 5_000,
    });
  } finally {
    restoreEnv(darkMiniXiangqiKey, before);
  }
});

test('Dark Mini Xiangqi runtime ends the game on a clock-expired event', () => {
  const projection = replayDarkMiniXiangqiEvents([
    {
      type: 'room-created',
      at: 100,
      roomId: 'dmxq_flag',
      gameSpecId: 'dark-mini-xiangqi',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    },
    {
      type: 'clock-started',
      at: 100,
      roomId: 'dmxq_flag',
      clock: {
        activeColor: null,
        incrementMs: 2_000,
        initialMs: 180_000,
        remainingMs: { black: 180_000, red: 180_000 },
        runningSince: null,
      },
    },
    { type: 'move-played', at: 100, roomId: 'dmxq_flag', color: 'red', move: { from: 'a2', to: 'a3' } },
    { type: 'move-played', at: 200, roomId: 'dmxq_flag', color: 'black', move: { from: 'a6', to: 'a5' } },
    {
      type: 'clock-expired',
      at: 300,
      roomId: 'dmxq_flag',
      color: 'red',
      clock: {
        activeColor: null,
        incrementMs: 2_000,
        initialMs: 180_000,
        remainingMs: { black: 182_000, red: 0 },
        runningSince: null,
      },
    },
  ]);

  assert.deepEqual(projection.state.status, {
    type: 'finished',
    winner: 'black',
    reason: 'timeout',
  });
  assert.equal(projection.clock?.remainingMs.red, 0);
});

test('Dark Mini Xiangqi event validation accepts clock events and a timed room-created', () => {
  assert.equal(
    isDarkMiniXiangqiEventLog(
      [
        {
          type: 'room-created',
          at: 100,
          roomId: 'dmxq_cv',
          gameSpecId: 'dark-mini-xiangqi',
          timeControl: { initialMs: 180_000, incrementMs: 2_000 },
        },
        {
          type: 'clock-started',
          at: 100,
          roomId: 'dmxq_cv',
          clock: {
            activeColor: null,
            incrementMs: 2_000,
            initialMs: 180_000,
            remainingMs: { black: 180_000, red: 180_000 },
            runningSince: null,
          },
        },
      ],
      'dmxq_cv',
    ),
    true,
  );
  assert.equal(
    isDarkMiniXiangqiEventLog(
      [
        { type: 'room-created', at: 100, roomId: 'dmxq_cv', gameSpecId: 'dark-mini-xiangqi' },
        { type: 'clock-expired', at: 200, roomId: 'dmxq_cv', color: 'red', clock: { bogus: true } },
      ],
      'dmxq_cv',
    ),
    false,
  );
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

test('Dark Mini Xiangqi snapshots never send a seat the opponent last move', () => {
  const before = process.env[darkMiniXiangqiKey];
  process.env[darkMiniXiangqiKey] = 'true';
  try {
    const result = createDarkMiniXiangqiRuntimeRoom('dmxq_lastmove');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const { room } = result;
    appendDarkMiniXiangqiRuntimeEvent(room, {
      type: 'seat-assigned',
      at: 1,
      roomId: room.id,
      clientId: 'R',
      seat: 'red',
    });
    appendDarkMiniXiangqiRuntimeEvent(room, {
      type: 'seat-assigned',
      at: 2,
      roomId: room.id,
      clientId: 'B',
      seat: 'black',
    });
    appendDarkMiniXiangqiRuntimeEvent(room, {
      type: 'move-played',
      at: 3,
      roomId: room.id,
      color: 'red',
      move: { from: 'a2', to: 'a3' },
    });
    appendDarkMiniXiangqiRuntimeEvent(room, {
      type: 'move-played',
      at: 4,
      roomId: room.id,
      color: 'black',
      move: { from: 'a6', to: 'a5' },
    });

    // Black just moved: the mover (black) keeps its own lastMove, but red — the
    // opponent — must never receive it.
    const red = darkMiniXiangqiSnapshotPayload(room, { id: 'R', seat: 'red', solo: false });
    const black = darkMiniXiangqiSnapshotPayload(room, { id: 'B', seat: 'black', solo: false });
    assert.equal(red.state.lastMove, undefined);
    assert.deepEqual(black.state.lastMove, { from: 'a6', to: 'a5' });
  } finally {
    restoreEnv(darkMiniXiangqiKey, before);
  }
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
