import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  CrossroadsChessEvent,
  CrossroadsChessRuntimeRoom,
} from './crossroads-chess-runtime.js';
import {
  type CrossroadsChessLiveRoomFactoryContext,
  createCrossroadsChessLiveRoom,
} from './server-crossroads-chess-room-factory.js';

process.env.MISTBOARD_CROSSROADS_CHESS_ENABLED = 'true';

function fakeCtx(opts: { persist?: boolean; failOn?: number } = {}) {
  const crossroadsChessRooms = new Map<string, CrossroadsChessRuntimeRoom>();
  const appended: { roomId: string; seq: number; event: CrossroadsChessEvent }[] = [];
  const errors: { roomId: string; seq: number; type: string }[] = [];
  let counter = 0;
  const ctx: CrossroadsChessLiveRoomFactoryContext = {
    chessRooms: new Map(),
    darkMiniXiangqiRooms: new Map(),
    darkXiangqiRooms: new Map(),
    crossroadsChessRooms,
    appendRoomEvent: async (roomId, seq, event) => {
      if (opts.failOn !== undefined && seq === opts.failOn) throw new Error('db down');
      appended.push({ roomId, seq, event });
    },
    createRoomId: () => `dchess_test_${counter++}`,
    isPersistenceEnabled: () => opts.persist ?? true,
    recordPersistenceError: (roomId, seq, type) => {
      errors.push({ roomId, seq, type });
    },
  };
  return { ctx, crossroadsChessRooms, appended, errors };
}

const TC = { initialMs: 180_000, incrementMs: 2_000 };

test('creates a room, persists its bootstrap events, and registers it', async () => {
  const { ctx, crossroadsChessRooms, appended } = fakeCtx();
  const created = await createCrossroadsChessLiveRoom(ctx, TC, 'random');
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(crossroadsChessRooms.has(created.room.id), true);
  // room-created + clock-started were persisted.
  assert.deepEqual(
    appended.map((a) => a.event.type),
    ['room-created', 'clock-started'],
  );
});

test('persistence-disabled still registers the room without writes', async () => {
  const { ctx, crossroadsChessRooms, appended } = fakeCtx({ persist: false });
  const created = await createCrossroadsChessLiveRoom(ctx, TC);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(crossroadsChessRooms.has(created.room.id), true);
  assert.equal(appended.length, 0);
});

test('a persistence failure aborts creation and records the error', async () => {
  const { ctx, crossroadsChessRooms, errors } = fakeCtx({ failOn: 1 });
  const created = await createCrossroadsChessLiveRoom(ctx, TC);
  assert.equal(created.ok, false);
  assert.equal(created.ok === false && created.error, 'persistence_failure');
  assert.equal(crossroadsChessRooms.size, 0);
  assert.equal(errors.length, 1);
});

test('the flag gates room creation', async () => {
  process.env.MISTBOARD_CROSSROADS_CHESS_ENABLED = 'false';
  const { ctx } = fakeCtx();
  const created = await createCrossroadsChessLiveRoom(ctx, TC);
  assert.equal(created.ok === false && created.error, 'crossroads_chess_disabled');
  process.env.MISTBOARD_CROSSROADS_CHESS_ENABLED = 'true';
});
