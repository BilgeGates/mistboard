import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDarkXiangqiLiveRoom,
  type DarkXiangqiLiveRoomFactoryContext,
} from './server-dark-xiangqi-room-factory.js';
import type { DarkXiangqiLiveRoom } from './server-ws-dark-xiangqi.js';

const darkXiangqiFlag = 'MISTBOARD_DARK_XIANGQI_ENABLED';

test('Dark Xiangqi live room factory returns disabled when the launch flag is off', async () => {
  const before = process.env[darkXiangqiFlag];
  delete process.env[darkXiangqiFlag];
  try {
    const ctx = factoryContext({ ids: ['dxq_baseline'] });
    const result = await createDarkXiangqiLiveRoom(ctx);

    assert.deepEqual(result, { ok: false, error: 'dark_xiangqi_disabled' });
    assert.equal(ctx.darkXiangqiRooms.has('dxq_baseline'), false);
  } finally {
    restoreFlag(before);
  }
});

test('Dark Xiangqi live room factory creates and stores a flagged room', async () => {
  const before = process.env[darkXiangqiFlag];
  process.env[darkXiangqiFlag] = 'true';
  try {
    const ctx = factoryContext({ ids: ['dxq_created'] });
    const result = await createDarkXiangqiLiveRoom(ctx);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.room.id, 'dxq_created');
    assert.equal(ctx.darkXiangqiRooms.get('dxq_created'), result.room);
    assert.deepEqual(ctx.persistedEvents, []);
  } finally {
    restoreFlag(before);
  }
});

test('Dark Xiangqi live room factory persists the room-created event when persistence is enabled', async () => {
  const before = process.env[darkXiangqiFlag];
  process.env[darkXiangqiFlag] = 'true';
  try {
    const ctx = factoryContext({ ids: ['dxq_persisted'], persistenceEnabled: true });
    const result = await createDarkXiangqiLiveRoom(ctx);

    assert.equal(result.ok, true);
    assert.deepEqual(ctx.persistedEvents, [
      {
        roomId: 'dxq_persisted',
        seq: 0,
        eventType: 'room-created',
      },
    ]);
  } finally {
    restoreFlag(before);
  }
});

test('Dark Xiangqi live room factory persists seeded clock events for time controls', async () => {
  const before = process.env[darkXiangqiFlag];
  process.env[darkXiangqiFlag] = 'true';
  try {
    const ctx = factoryContext({ ids: ['dxq_clocked'], persistenceEnabled: true });
    const result = await createDarkXiangqiLiveRoom(ctx, {
      initialMs: 180_000,
      incrementMs: 2_000,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(ctx.persistedEvents, [
      {
        roomId: 'dxq_clocked',
        seq: 0,
        eventType: 'room-created',
      },
      {
        roomId: 'dxq_clocked',
        seq: 1,
        eventType: 'clock-started',
      },
    ]);
  } finally {
    restoreFlag(before);
  }
});

test('Dark Xiangqi live room factory fails closed on persistence errors', async () => {
  const before = process.env[darkXiangqiFlag];
  process.env[darkXiangqiFlag] = 'true';
  try {
    const ctx = factoryContext({
      ids: ['dxq_persistence_failure'],
      persistenceEnabled: true,
      persistenceError: new Error('write failed'),
    });
    const result = await createDarkXiangqiLiveRoom(ctx);

    assert.deepEqual(result, { ok: false, error: 'persistence_failure' });
    assert.equal(ctx.darkXiangqiRooms.has('dxq_persistence_failure'), false);
    assert.deepEqual(ctx.persistenceErrors, [
      {
        roomId: 'dxq_persistence_failure',
        seq: 0,
        eventType: 'room-created',
        message: 'write failed',
      },
    ]);
  } finally {
    restoreFlag(before);
  }
});

test('Dark Xiangqi live room factory avoids ids occupied by either runtime', async () => {
  const before = process.env[darkXiangqiFlag];
  process.env[darkXiangqiFlag] = 'true';
  try {
    const ctx = factoryContext({
      chessRoomIds: ['dxq_chess_taken'],
      darkXiangqiRoomIds: ['dxq_xiangqi_taken'],
      ids: ['dxq_chess_taken', 'dxq_xiangqi_taken', 'dxq_free'],
    });
    const result = await createDarkXiangqiLiveRoom(ctx);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.room.id, 'dxq_free');
    assert.equal(ctx.generatedIds, 3);
  } finally {
    restoreFlag(before);
  }
});

test('Dark Xiangqi live room factory reports collision exhaustion', async () => {
  const before = process.env[darkXiangqiFlag];
  process.env[darkXiangqiFlag] = 'true';
  try {
    const ctx = factoryContext({
      chessRoomIds: ['dxq_taken'],
      ids: ['dxq_taken', 'dxq_taken', 'dxq_taken', 'dxq_taken', 'dxq_taken'],
    });
    const result = await createDarkXiangqiLiveRoom(ctx);

    assert.deepEqual(result, { ok: false, error: 'room_id_collision' });
    assert.equal(ctx.generatedIds, 5);
    assert.equal(ctx.darkXiangqiRooms.size, 0);
  } finally {
    restoreFlag(before);
  }
});

type TestFactoryContext = DarkXiangqiLiveRoomFactoryContext & {
  generatedIds: number;
  persistedEvents: Array<{ roomId: string; seq: number; eventType: string }>;
  persistenceErrors: Array<{ roomId: string; seq: number; eventType: string; message: string }>;
};

function factoryContext(options: {
  chessRoomIds?: string[];
  darkXiangqiRoomIds?: string[];
  ids: string[];
  persistenceEnabled?: boolean;
  persistenceError?: Error;
}): TestFactoryContext {
  const chessRoomIds = new Set(options.chessRoomIds ?? []);
  const darkXiangqiRooms = new Map<string, DarkXiangqiLiveRoom>(
    (options.darkXiangqiRoomIds ?? []).map((roomId) => [
      roomId,
      { id: roomId } as DarkXiangqiLiveRoom,
    ]),
  );
  let idIndex = 0;
  const ctx: TestFactoryContext = {
    appendRoomEvent: async (roomId, seq, event) => {
      if (options.persistenceError) throw options.persistenceError;
      ctx.persistedEvents.push({ roomId, seq, eventType: event.type });
    },
    isRoomIdTaken: (roomId) => chessRoomIds.has(roomId),
    createRoomId: () => {
      ctx.generatedIds += 1;
      return options.ids[idIndex++] ?? options.ids.at(-1) ?? 'dxq_fallback';
    },
    darkXiangqiRooms,
    generatedIds: 0,
    isPersistenceEnabled: () => options.persistenceEnabled === true,
    persistedEvents: [],
    persistenceErrors: [],
    recordPersistenceError: (roomId, seq, eventType, err) => {
      ctx.persistenceErrors.push({ roomId, seq, eventType, message: err.message });
    },
  };
  return ctx;
}

function restoreFlag(value: string | undefined): void {
  if (value === undefined) {
    delete process.env[darkXiangqiFlag];
    return;
  }
  process.env[darkXiangqiFlag] = value;
}
