import assert from 'node:assert/strict';
import test from 'node:test';
import { DARK_XIANGQI_SPEC_ID, type XiangqiBoard, type XiangqiGameState } from '@mistboard/game';
import {
  createDarkXiangqiRuntimeRoom,
  type DarkXiangqiEvent,
  type DarkXiangqiRuntimeRoom,
  darkXiangqiSnapshotPayload,
  replayDarkXiangqiEvents,
} from './dark-xiangqi-runtime.js';

const darkXiangqiKey = 'MISTBOARD_DARK_XIANGQI_ENABLED';

test('Dark Xiangqi direct runtime creation is hidden when the flag is off', () => {
  const before = process.env[darkXiangqiKey];
  delete process.env[darkXiangqiKey];
  try {
    assert.deepEqual(createDarkXiangqiRuntimeRoom('xq-disabled', { now: 1 }), {
      ok: false,
      error: 'dark_xiangqi_disabled',
    });
  } finally {
    restoreEnv(darkXiangqiKey, before);
  }
});

test('Dark Xiangqi direct runtime creation seeds a replay-backed room when flagged on', () => {
  const before = process.env[darkXiangqiKey];
  process.env[darkXiangqiKey] = 'true';
  try {
    const result = createDarkXiangqiRuntimeRoom('xq-runtime', { now: 123 });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.room.kind, 'dark-xiangqi');
    assert.equal(result.room.gameSpecId, DARK_XIANGQI_SPEC_ID);
    assert.deepEqual(result.room.events, [
      {
        type: 'room-created',
        at: 123,
        roomId: 'xq-runtime',
        gameSpecId: DARK_XIANGQI_SPEC_ID,
      },
    ]);
    assert.equal(result.room.projection.state.id, 'xq-runtime');
    assert.deepEqual(result.room.projection.state.status, { type: 'playing', turn: 'red' });
  } finally {
    restoreEnv(darkXiangqiKey, before);
  }
});

test('Dark Xiangqi replay applies moves from the event log', () => {
  const events: DarkXiangqiEvent[] = [
    { type: 'room-created', at: 1, roomId: 'xq-replay', gameSpecId: DARK_XIANGQI_SPEC_ID },
    {
      type: 'move-played',
      at: 2,
      roomId: 'xq-replay',
      color: 'red',
      move: { from: 'b3', to: 'b4' },
    },
  ];

  const projection = replayDarkXiangqiEvents(events);

  assert.deepEqual(projection.state.board.b4, { color: 'red', role: 'cannon' });
  assert.equal(projection.state.board.b3, undefined);
  assert.deepEqual(projection.state.status, { type: 'playing', turn: 'black' });
});

test('Dark Xiangqi payload hides cannon gap squares and redacts shrouded piece identities', () => {
  const state = darkXiangqiState({
    e1: { color: 'red', role: 'general' },
    e3: { color: 'red', role: 'cannon' },
    e5: { color: 'black', role: 'advisor' },
    e8: { color: 'black', role: 'soldier' },
    a10: { color: 'black', role: 'general' },
  });
  const room = darkXiangqiRoomFixture({
    id: 'xq-redaction',
    events: [
      { type: 'room-created', at: 1, roomId: 'xq-redaction', gameSpecId: DARK_XIANGQI_SPEC_ID },
    ],
    state,
  });

  const payload = darkXiangqiSnapshotPayload(room, {
    id: 'red-client',
    seat: 'red',
    solo: false,
  });

  assert.deepEqual(payload.state.board.e5, { color: 'black', shrouded: true });
  assert.deepEqual(payload.state.board.e8, {
    piece: { color: 'black', role: 'soldier' },
    shrouded: false,
  });
  assert.equal(payload.state.board.e6, undefined);
  assert.equal(payload.state.board.e7, undefined);
  assert.equal(payload.state.visibleSquares.includes('e6'), false);
  assert.equal(payload.state.visibleSquares.includes('e7'), false);

  const json = JSON.stringify(payload);
  assert.doesNotMatch(json, /advisor/);
  assert.doesNotMatch(json, /"e6"/);
  assert.doesNotMatch(json, /"e7"/);
});

test('Dark Xiangqi payload hides opponent move events from seated players and all move events from spectators', () => {
  const events: DarkXiangqiEvent[] = [
    { type: 'room-created', at: 1, roomId: 'xq-events', gameSpecId: DARK_XIANGQI_SPEC_ID },
    {
      type: 'move-played',
      at: 2,
      roomId: 'xq-events',
      color: 'black',
      move: { from: 'i10', to: 'i9' },
    },
  ];
  const room = darkXiangqiRoomFixture({
    id: 'xq-events',
    events,
    state: darkXiangqiState({
      e1: { color: 'red', role: 'general' },
      a10: { color: 'black', role: 'general' },
      i10: { color: 'black', role: 'chariot' },
    }),
  });

  const redPayload = darkXiangqiSnapshotPayload(room, {
    id: 'red-client',
    seat: 'red',
    solo: false,
  });
  const spectatorPayload = darkXiangqiSnapshotPayload(room, {
    id: 'spectator-client',
    seat: 'spectator',
    solo: false,
  });

  assert.equal(
    redPayload.events.some((event) => event.type === 'move-played'),
    false,
  );
  assert.equal(
    spectatorPayload.events.some((event) => event.type === 'move-played'),
    false,
  );
  assert.deepEqual(spectatorPayload.state.board, {});
  assert.deepEqual(spectatorPayload.state.visibleSquares, []);

  const json = JSON.stringify(redPayload);
  assert.doesNotMatch(json, /"i10"/);
  assert.doesNotMatch(json, /"i9"/);
  assert.doesNotMatch(json, /chariot/);
});

function darkXiangqiState(board: XiangqiBoard): XiangqiGameState {
  return {
    id: 'xq-test',
    board,
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
}

function darkXiangqiRoomFixture({
  id,
  events,
  state,
}: {
  id: string;
  events: DarkXiangqiEvent[];
  state: XiangqiGameState;
}): DarkXiangqiRuntimeRoom {
  return {
    kind: 'dark-xiangqi',
    id,
    clients: new Set([
      { seat: 'red', displaced: false },
      { seat: 'black', displaced: false },
    ]),
    events,
    projection: {
      roomId: id,
      gameSpecId: DARK_XIANGQI_SPEC_ID,
      state,
      seats: { red: 'red-client', black: 'black-client' },
    },
    gameSpecId: DARK_XIANGQI_SPEC_ID,
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
