import assert from 'node:assert/strict';
import test from 'node:test';
import type { DualChessEvent, DualChessRuntimeRoom } from './dual-chess-runtime.js';
import {
  createDualChessLiveRoom,
  type DualChessLiveRoomFactoryContext,
} from './server-dual-chess-room-factory.js';

process.env.MISTBOARD_DUAL_CHESS_ENABLED = 'true';

function fakeCtx(opts: { persist?: boolean; failOn?: number } = {}) {
  const dualChessRooms = new Map<string, DualChessRuntimeRoom>();
  const appended: { roomId: string; seq: number; event: DualChessEvent }[] = [];
  const errors: { roomId: string; seq: number; type: string }[] = [];
  let counter = 0;
  const ctx: DualChessLiveRoomFactoryContext = {
    chessRooms: new Map(),
    darkMiniXiangqiRooms: new Map(),
    darkXiangqiRooms: new Map(),
    dualChessRooms,
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
  return { ctx, dualChessRooms, appended, errors };
}

const TC = { initialMs: 180_000, incrementMs: 2_000 };

test('creates a room, persists its bootstrap events, and registers it', async () => {
  const { ctx, dualChessRooms, appended } = fakeCtx();
  const created = await createDualChessLiveRoom(ctx, TC, 'random');
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(dualChessRooms.has(created.room.id), true);
  // room-created + clock-started were persisted.
  assert.deepEqual(
    appended.map((a) => a.event.type),
    ['room-created', 'clock-started'],
  );
});

test('persistence-disabled still registers the room without writes', async () => {
  const { ctx, dualChessRooms, appended } = fakeCtx({ persist: false });
  const created = await createDualChessLiveRoom(ctx, TC);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(dualChessRooms.has(created.room.id), true);
  assert.equal(appended.length, 0);
});

test('a persistence failure aborts creation and records the error', async () => {
  const { ctx, dualChessRooms, errors } = fakeCtx({ failOn: 1 });
  const created = await createDualChessLiveRoom(ctx, TC);
  assert.equal(created.ok, false);
  assert.equal(created.ok === false && created.error, 'persistence_failure');
  assert.equal(dualChessRooms.size, 0);
  assert.equal(errors.length, 1);
});

test('the flag gates room creation', async () => {
  process.env.MISTBOARD_DUAL_CHESS_ENABLED = 'false';
  const { ctx } = fakeCtx();
  const created = await createDualChessLiveRoom(ctx, TC);
  assert.equal(created.ok === false && created.error, 'dual_chess_disabled');
  process.env.MISTBOARD_DUAL_CHESS_ENABLED = 'true';
});
