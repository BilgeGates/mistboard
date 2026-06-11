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
  const starts: {
    roomId: string;
    summary: Parameters<CrossroadsChessLiveRoomFactoryContext['recordGameStart']>[1];
  }[] = [];
  const errors: { roomId: string; seq: number; type: string }[] = [];
  let counter = 0;
  const ctx: CrossroadsChessLiveRoomFactoryContext = {
    crossroadsChessRooms,
    isRoomIdTaken: () => false,
    appendRoomEvent: async (roomId, seq, event) => {
      if (opts.failOn !== undefined && seq === opts.failOn) throw new Error('db down');
      appended.push({ roomId, seq, event });
    },
    createRoomId: () => `dchess_test_${counter++}`,
    isPersistenceEnabled: () => opts.persist ?? true,
    recordGameStart: async (roomId, summary) => {
      starts.push({ roomId, summary });
    },
    recordPersistenceError: (roomId, seq, type) => {
      errors.push({ roomId, seq, type });
    },
  };
  return { ctx, crossroadsChessRooms, appended, errors, starts };
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

test('PvE creation persists the engine seat and records a public running game', async () => {
  const { ctx, appended, starts } = fakeCtx();
  const created = await createCrossroadsChessLiveRoom(ctx, TC, 'white', {
    engineId: 'fairy-stockfish-crossroads-strong',
    seat: 'red',
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.deepEqual(
    appended.map((a) => a.event.type),
    ['room-created', 'clock-started', 'seat-assigned'],
  );
  assert.equal(created.room.projection.seats.red, 'fairy-stockfish-crossroads-strong');
  assert.equal(starts.length, 1);
  assert.equal(starts[0]?.summary.mode, 'pve');
  assert.equal(starts[0]?.summary.visibility, 'public');
  assert.equal(starts[0]?.summary.variant, 'crossroads-chess');
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
