import assert from 'node:assert/strict';
import test from 'node:test';
import { DARK_XIANGQI_SPEC_ID, type XiangqiColor } from '@mistboard/game';
import {
  createDarkXiangqiRuntimeRoomFromEvents,
  type DarkXiangqiEvent,
  type DarkXiangqiRuntimeRoom,
  type DarkXiangqiSeatTokenState,
} from './dark-xiangqi-runtime.js';
import {
  appendDarkXiangqiEvent,
  appendDarkXiangqiSeatAssigned,
  buildDarkXiangqiGameSummary,
  type DarkXiangqiEventWriterContext,
  type DarkXiangqiEventWriterPersistence,
} from './server-dark-xiangqi-events.js';
import { hashSeatToken } from './server-seat-session.js';

test('Dark Xiangqi event writer appends runtime events and schedules lifecycle timers', async () => {
  const room = roomFixture('dxq_event');
  const ctx = writerContext();
  const event: DarkXiangqiEvent = {
    type: 'move-played',
    at: 2,
    roomId: room.id,
    color: 'red',
    move: { from: 'b3', to: 'b4' },
  };

  const seq = await appendDarkXiangqiEvent(room, event, ctx);

  assert.equal(seq, 1);
  assert.equal(room.events[1], event);
  assert.deepEqual(room.projection.state.board.b4, { color: 'red', role: 'cannon' });
  assert.equal(ctx.scheduleCalls, 1);
});

test('Dark Xiangqi event writer persists before mutating runtime state', async () => {
  const room = roomFixture('dxq_order');
  const ctx = writerContext({
    persistence: persistenceFixture({
      appendRoomEvent: async (_roomId, _seq, _event) => {
        assert.equal(room.events.length, 1);
        assert.equal(room.projection.state.board.b4, undefined);
      },
    }),
  });

  await appendDarkXiangqiEvent(
    room,
    {
      type: 'move-played',
      at: 2,
      roomId: room.id,
      color: 'red',
      move: { from: 'b3', to: 'b4' },
    },
    ctx,
  );

  assert.equal(room.events.length, 2);
  assert.equal(ctx.persistence.appendedEvents.length, 1);
});

test('Dark Xiangqi event writer fails closed before runtime mutation on persistence errors', async () => {
  const room = roomFixture('dxq_failure');
  const ctx = writerContext({
    persistence: persistenceFixture({
      appendRoomEvent: async () => {
        throw new Error('event write failed');
      },
    }),
  });

  await assert.rejects(
    appendDarkXiangqiEvent(
      room,
      {
        type: 'move-played',
        at: 2,
        roomId: room.id,
        color: 'red',
        move: { from: 'b3', to: 'b4' },
      },
      ctx,
    ),
    /event write failed/,
  );
  await room.pendingWrites;

  assert.equal(room.events.length, 1);
  assert.equal(room.projection.state.board.b4, undefined);
  assert.equal(ctx.scheduleCalls, 0);
});

test('Dark Xiangqi event writer records private terminal summaries once', async () => {
  const room = roomFixture('dxq_finished');
  room.seatTokens.red = seatTokenState('red', 'red-user');
  const persistence = persistenceFixture();
  const ctx = writerContext({ persistence });

  await appendDarkXiangqiEvent(
    room,
    {
      type: 'seat-resigned',
      at: 2,
      roomId: room.id,
      color: 'red',
    },
    ctx,
  );
  await appendDarkXiangqiEvent(
    room,
    {
      type: 'seat-forfeited',
      at: 3,
      roomId: room.id,
      color: 'black',
    },
    ctx,
  );

  assert.equal(room.gameEndRecorded, true);
  assert.equal(persistence.gameEnds.length, 1);
  const gameEnd = persistence.gameEnds[0];
  assert.ok(gameEnd);
  assert.equal(gameEnd.summary.result, 'black-wins');
  assert.equal(gameEnd.summary.termination, 'resignation');
  assert.equal(gameEnd.summary.visibility, 'private');
  assert.ok(gameEnd.summary.participants);
  assert.deepEqual(gameEnd.summary.participants[0], {
    color: 'red',
    displayName: 'Red User',
    subjectType: 'user',
    subjectId: 'red-user',
    visibility: 'private',
  });
});

test('Dark Xiangqi event writer marks aborted games terminal without summaries', async () => {
  const room = roomFixture('dxq_aborted');
  const persistence = persistenceFixture();

  await appendDarkXiangqiEvent(
    room,
    {
      type: 'game-aborted',
      at: 2,
      roomId: room.id,
      reason: 'pregame-timeout',
    },
    writerContext({ persistence }),
  );

  assert.equal(room.gameEndRecorded, true);
  assert.equal(persistence.gameEnds.length, 0);
});

test('Dark Xiangqi event writer records timeout summaries with native result colors', async () => {
  const room = roomFixture('dxq_timeout');
  const persistence = persistenceFixture();

  await appendDarkXiangqiEvent(
    room,
    {
      type: 'clock-expired',
      at: 2,
      roomId: room.id,
      color: 'red',
      clock: {
        activeColor: null,
        incrementMs: 0,
        initialMs: 10_000,
        remainingMs: { black: 10_000, red: 0 },
        runningSince: null,
      },
    },
    writerContext({ persistence }),
  );

  assert.equal(persistence.gameEnds.length, 1);
  assert.equal(persistence.gameEnds[0]?.summary.result, 'black-wins');
  assert.equal(persistence.gameEnds[0]?.summary.termination, 'timeout');
});

test('Dark Xiangqi seat-assigned writer persists event and token before mutation', async () => {
  const room = roomFixture('dxq_seat');
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
  const ctx = writerContext({ persistence });

  const seq = await appendDarkXiangqiSeatAssigned(
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
    ctx,
  );

  assert.equal(seq, 1);
  assert.deepEqual(persistence.operations, ['append', 'upsert']);
  assert.equal(room.events[1]?.type, 'seat-assigned');
  assert.equal(room.seatTokens.red, tokenState);
  assert.equal(ctx.scheduleCalls, 1);
});

test('Dark Xiangqi seat-assigned writer fails closed on token persistence errors', async () => {
  const room = roomFixture('dxq_seat_failure');
  const tokenState = seatTokenState('black', null);
  const ctx = writerContext({
    persistence: persistenceFixture({
      upsertRoomSeatToken: async () => {
        throw new Error('token write failed');
      },
    }),
  });

  await assert.rejects(
    appendDarkXiangqiSeatAssigned(
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
  assert.equal(ctx.scheduleCalls, 0);
});

test('Dark Xiangqi game summary rejects non-terminal rooms', () => {
  assert.throws(() => buildDarkXiangqiGameSummary(roomFixture('dxq_non_terminal')), /non-terminal/);
});

type TestWriterContext = DarkXiangqiEventWriterContext & {
  persistence: TestPersistence;
  scheduleCalls: number;
};

type TestPersistence = DarkXiangqiEventWriterPersistence & {
  aborts: Array<{ roomId: string; abortedReason: string; termination: string }>;
  appendedEvents: Array<{ roomId: string; seq: number; event: DarkXiangqiEvent }>;
  gameEnds: Array<{ roomId: string; summary: Parameters<TestPersistence['recordGameEnd']>[1] }>;
  operations: string[];
};

function writerContext(options: { persistence?: TestPersistence } = {}): TestWriterContext {
  const ctx: TestWriterContext = {
    persistence: options.persistence ?? persistenceFixture({ initialized: false }),
    scheduleCalls: 0,
    scheduleLifecycleTimers: () => {
      ctx.scheduleCalls += 1;
    },
  };
  return ctx;
}

function persistenceFixture(
  options: {
    appendRoomEvent?: DarkXiangqiEventWriterPersistence['appendRoomEvent'];
    initialized?: boolean;
    recordGameEnd?: DarkXiangqiEventWriterPersistence['recordGameEnd'];
    upsertRoomSeatToken?: DarkXiangqiEventWriterPersistence['upsertRoomSeatToken'];
  } = {},
): TestPersistence {
  const persistence: TestPersistence = {
    abortRunningGame: async (roomId, opts) => {
      persistence.operations.push('abort-running-game');
      persistence.aborts.push({
        roomId,
        abortedReason: opts.abortedReason,
        termination: opts.termination,
      });
      return true;
    },
    aborts: [],
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

function roomFixture(roomId: string): DarkXiangqiRuntimeRoom {
  const created = createDarkXiangqiRuntimeRoomFromEvents([
    { type: 'room-created', at: 1, roomId, gameSpecId: DARK_XIANGQI_SPEC_ID },
  ]);
  if (!created.ok) throw new Error(created.error);
  return created.room;
}

function seatTokenState(seat: XiangqiColor, userId: string | null): DarkXiangqiSeatTokenState {
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
