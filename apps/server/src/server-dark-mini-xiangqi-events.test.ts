import assert from 'node:assert/strict';
import test from 'node:test';
import { DARK_MINI_XIANGQI_SPEC_ID, type MiniXiangqiColor } from '@mistboard/game';
import {
  createDarkMiniXiangqiRuntimeRoomFromEvents,
  type DarkMiniXiangqiEvent,
  type DarkMiniXiangqiRuntimeRoom,
  type DarkMiniXiangqiSeatTokenState,
} from './dark-mini-xiangqi-runtime.js';
import {
  appendDarkMiniXiangqiEvent,
  appendDarkMiniXiangqiSeatAssigned,
  buildDarkMiniXiangqiGameSummary,
  type DarkMiniXiangqiEventWriterContext,
  type DarkMiniXiangqiEventWriterPersistence,
} from './server-dark-mini-xiangqi-events.js';
import { hashSeatToken } from './server-seat-session.js';

test('Dark Mini Xiangqi event writer appends runtime events', async () => {
  const room = roomFixture('dmxq_event');
  const ctx = writerContext();
  const event: DarkMiniXiangqiEvent = {
    type: 'move-played',
    at: 2,
    roomId: room.id,
    color: 'red',
    move: { from: 'a2', to: 'a3' },
  };

  const seq = await appendDarkMiniXiangqiEvent(room, event, ctx);

  assert.equal(seq, 1);
  assert.equal(room.events[1], event);
  assert.deepEqual(room.projection.state.board.a3, { color: 'red', role: 'soldier' });
});

test('Dark Mini Xiangqi event writer persists before mutating runtime state', async () => {
  const room = roomFixture('dmxq_order');
  const ctx = writerContext({
    persistence: persistenceFixture({
      appendRoomEvent: async () => {
        assert.equal(room.events.length, 1);
        assert.equal(room.projection.state.board.a3, undefined);
      },
    }),
  });

  await appendDarkMiniXiangqiEvent(
    room,
    {
      type: 'move-played',
      at: 2,
      roomId: room.id,
      color: 'red',
      move: { from: 'a2', to: 'a3' },
    },
    ctx,
  );

  assert.equal(room.events.length, 2);
  assert.equal(ctx.persistence.appendedEvents.length, 1);
});

test('Dark Mini Xiangqi event writer fails closed before runtime mutation on persistence errors', async () => {
  const room = roomFixture('dmxq_failure');
  const ctx = writerContext({
    persistence: persistenceFixture({
      appendRoomEvent: async () => {
        throw new Error('event write failed');
      },
    }),
  });

  await assert.rejects(
    appendDarkMiniXiangqiEvent(
      room,
      {
        type: 'move-played',
        at: 2,
        roomId: room.id,
        color: 'red',
        move: { from: 'a2', to: 'a3' },
      },
      ctx,
    ),
    /event write failed/,
  );
  await room.pendingWrites;

  assert.equal(room.events.length, 1);
  assert.equal(room.projection.state.board.a3, undefined);
});

test('Dark Mini Xiangqi event writer records private terminal summaries once', async () => {
  const room = roomFixture('dmxq_finished');
  room.seatTokens.red = seatTokenState('red', 'red-user');
  room.projection.state = {
    ...room.projection.state,
    board: {
      d1: { color: 'red', role: 'general' },
      d7: { color: 'black', role: 'general' },
    },
    status: { type: 'playing', turn: 'red' },
    positionCounts: {},
  };
  const persistence = persistenceFixture();

  await appendDarkMiniXiangqiEvent(
    room,
    {
      type: 'move-played',
      at: 2,
      roomId: room.id,
      color: 'red',
      move: { from: 'd1', to: 'd7' },
    },
    writerContext({ persistence }),
  );
  await appendDarkMiniXiangqiEvent(
    room,
    {
      type: 'move-played',
      at: 3,
      roomId: room.id,
      color: 'black',
      move: { from: 'a7', to: 'a6' },
    },
    writerContext({ persistence }),
  );

  assert.equal(room.gameEndRecorded, true);
  assert.equal(persistence.gameEnds.length, 1);
  const gameEnd = persistence.gameEnds[0];
  assert.ok(gameEnd);
  assert.equal(gameEnd.summary.variant, DARK_MINI_XIANGQI_SPEC_ID);
  assert.equal(gameEnd.summary.result, 'red-wins');
  assert.equal(gameEnd.summary.termination, 'general-captured');
  assert.equal(gameEnd.summary.visibility, 'private');
  assert.deepEqual(gameEnd.summary.participants?.[0], {
    color: 'red',
    displayName: 'Red User',
    subjectType: 'user',
    subjectId: 'red-user',
    visibility: 'private',
  });
});

test('Dark Mini Xiangqi game summary records PvE engine participants', () => {
  const room = roomFixture('dmxq_pve_finished');
  room.seatTokens.red = seatTokenState('red', 'red-user');
  room.projection.seats.black = 'python-dmx-v1.0';
  room.projection.state = {
    ...room.projection.state,
    status: { type: 'finished', winner: 'red', reason: 'general-captured' },
  };

  const summary = buildDarkMiniXiangqiGameSummary(room);

  assert.equal(summary.mode, 'pve');
  assert.equal(summary.result, 'red-wins');
  assert.deepEqual(summary.participants?.[1], {
    color: 'black',
    displayName: 'Misty (Dark Mini Xiangqi)',
    subjectType: 'engine-version',
    subjectId: 'python-dmx-v1.0',
    visibility: 'private',
  });
});

test('Dark Mini Xiangqi seat-assigned writer persists event and token before mutation', async () => {
  const room = roomFixture('dmxq_seat');
  const tokenState = seatTokenState('red', null);
  const persistence = persistenceFixture({
    appendRoomEvent: async () => {
      assert.equal(room.events.length, 1);
      assert.equal(room.seatTokens.red, undefined);
    },
    upsertRoomSeatToken: async () => {
      assert.equal(room.events.length, 1);
      assert.equal(room.seatTokens.red, undefined);
    },
  });

  const seq = await appendDarkMiniXiangqiSeatAssigned(
    room,
    {
      event: {
        type: 'seat-assigned',
        at: 2,
        roomId: room.id,
        clientId: tokenState.clientId,
        seat: 'red',
      },
      tokenState,
    },
    writerContext({ persistence }),
  );

  assert.equal(seq, 1);
  assert.deepEqual(persistence.operations, ['append', 'upsert']);
  assert.equal(room.events[1]?.type, 'seat-assigned');
  assert.equal(room.seatTokens.red, tokenState);
});

test('Dark Mini Xiangqi seat-assigned writer fails closed on token persistence errors', async () => {
  const room = roomFixture('dmxq_seat_failure');
  const tokenState = seatTokenState('black', null);
  const ctx = writerContext({
    persistence: persistenceFixture({
      upsertRoomSeatToken: async () => {
        throw new Error('token write failed');
      },
    }),
  });

  await assert.rejects(
    appendDarkMiniXiangqiSeatAssigned(
      room,
      {
        event: {
          type: 'seat-assigned',
          at: 2,
          roomId: room.id,
          clientId: tokenState.clientId,
          seat: 'black',
        },
        tokenState,
      },
      ctx,
    ),
    /token write failed/,
  );
  await room.pendingWrites;

  assert.equal(room.events.length, 1);
  assert.equal(room.seatTokens.black, undefined);
});

test('Dark Mini Xiangqi game summary rejects non-terminal rooms', () => {
  assert.throws(
    () => buildDarkMiniXiangqiGameSummary(roomFixture('dmxq_non_terminal')),
    /non-terminal/,
  );
});

type TestWriterContext = DarkMiniXiangqiEventWriterContext & {
  persistence: TestPersistence;
};

type TestPersistence = DarkMiniXiangqiEventWriterPersistence & {
  appendedEvents: Array<{ roomId: string; seq: number; event: DarkMiniXiangqiEvent }>;
  gameEnds: Array<{ roomId: string; summary: Parameters<TestPersistence['recordGameEnd']>[1] }>;
  operations: string[];
};

function writerContext(options: { persistence?: TestPersistence } = {}): TestWriterContext {
  return {
    persistence: options.persistence ?? persistenceFixture({ initialized: false }),
  };
}

function persistenceFixture(
  options: {
    appendRoomEvent?: DarkMiniXiangqiEventWriterPersistence['appendRoomEvent'];
    initialized?: boolean;
    recordGameEnd?: DarkMiniXiangqiEventWriterPersistence['recordGameEnd'];
    upsertRoomSeatToken?: DarkMiniXiangqiEventWriterPersistence['upsertRoomSeatToken'];
  } = {},
): TestPersistence {
  const persistence: TestPersistence = {
    appendedEvents: [],
    appendRoomEvent: async (roomId, seq, event) => {
      persistence.operations.push('append');
      await options.appendRoomEvent?.(roomId, seq, event);
      persistence.appendedEvents.push({ roomId, seq, event });
    },
    gameEnds: [],
    isInitialized: () => options.initialized !== false,
    operations: [],
    recordGameEnd: async (roomId, summary) => {
      persistence.operations.push('record-game-end');
      await options.recordGameEnd?.(roomId, summary);
      persistence.gameEnds.push({ roomId, summary });
    },
    upsertRoomSeatToken: async (roomId, token) => {
      persistence.operations.push('upsert');
      await options.upsertRoomSeatToken?.(roomId, token);
    },
  };
  return persistence;
}

function roomFixture(roomId: string): DarkMiniXiangqiRuntimeRoom {
  const created = createDarkMiniXiangqiRuntimeRoomFromEvents([
    { type: 'room-created', at: 1, roomId, gameSpecId: DARK_MINI_XIANGQI_SPEC_ID },
  ]);
  if (!created.ok) throw new Error(created.error);
  return created.room;
}

function seatTokenState(
  seat: MiniXiangqiColor,
  userId: string | null,
): DarkMiniXiangqiSeatTokenState {
  const now = new Date('2026-05-29T00:00:00.000Z');
  return {
    clientId: `${seat}-client`,
    issuedAt: now,
    lastSeenAt: now,
    revokedAt: null,
    seat,
    tokenHash: hashSeatToken(`${seat}-token`),
    userDisplayName: userId ? `${capitalize(seat)} User` : null,
    userHandle: userId ? `${seat}-user` : null,
    userId,
  };
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
