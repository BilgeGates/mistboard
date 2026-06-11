import assert from 'node:assert/strict';
import test from 'node:test';
import type { DarkMiniXiangqiRuntimeRoom } from './dark-mini-xiangqi-runtime.js';
import {
  createDarkMiniXiangqiLiveRoom,
  type DarkMiniXiangqiLiveRoomFactoryContext,
} from './server-dark-mini-xiangqi-room-factory.js';

const darkMiniXiangqiFlag = 'MISTBOARD_DARK_MINI_XIANGQI_ENABLED';

test('Dark Mini Xiangqi live room factory is hidden while the flag is off', async () => {
  const before = process.env[darkMiniXiangqiFlag];
  delete process.env[darkMiniXiangqiFlag];
  try {
    const result = await createDarkMiniXiangqiLiveRoom(testContext());

    assert.deepEqual(result, { ok: false, error: 'dark_mini_xiangqi_disabled' });
  } finally {
    restoreFlag(before);
  }
});

test('Dark Mini Xiangqi live room factory creates and stores a flagged room', async () => {
  const before = process.env[darkMiniXiangqiFlag];
  process.env[darkMiniXiangqiFlag] = 'true';
  try {
    const darkMiniXiangqiRooms = new Map();
    const result = await createDarkMiniXiangqiLiveRoom(
      testContext({
        createRoomId: () => 'dmxq_created',
        darkMiniXiangqiRooms,
      }),
      undefined,
      'black',
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.room.id, 'dmxq_created');
    assert.equal(result.room.projection.creatorPreference, 'black');
    assert.equal(darkMiniXiangqiRooms.get('dmxq_created'), result.room);
  } finally {
    restoreFlag(before);
  }
});

test('Dark Mini Xiangqi live room factory persists the room-created event when enabled', async () => {
  const before = process.env[darkMiniXiangqiFlag];
  process.env[darkMiniXiangqiFlag] = 'true';
  try {
    const persisted: Array<{ roomId: string; seq: number; type: string }> = [];
    const result = await createDarkMiniXiangqiLiveRoom(
      testContext({
        appendRoomEvent: async (roomId, seq, event) => {
          persisted.push({ roomId, seq, type: event.type });
        },
        createRoomId: () => 'dmxq_persisted',
        persistenceEnabled: true,
      }),
    );

    assert.equal(result.ok, true);
    assert.deepEqual(persisted, [{ roomId: 'dmxq_persisted', seq: 0, type: 'room-created' }]);
  } finally {
    restoreFlag(before);
  }
});

test('Dark Mini Xiangqi live room factory records public running summaries for PvE', async () => {
  const before = process.env[darkMiniXiangqiFlag];
  process.env[darkMiniXiangqiFlag] = 'true';
  try {
    const persisted: Array<{ roomId: string; seq: number; type: string }> = [];
    const starts: Array<{
      roomId: string;
      summary: Parameters<DarkMiniXiangqiLiveRoomFactoryContext['recordGameStart']>[1];
    }> = [];
    const result = await createDarkMiniXiangqiLiveRoom(
      testContext({
        appendRoomEvent: async (roomId, seq, event) => {
          persisted.push({ roomId, seq, type: event.type });
        },
        createRoomId: () => 'dmxq_pve_start',
        persistenceEnabled: true,
        recordGameStart: async (roomId, summary) => {
          starts.push({ roomId, summary });
        },
      }),
      undefined,
      undefined,
      { engineId: 'python-dmx-v1.0', seat: 'black', reservationId: 'reservation-1' },
    );

    assert.equal(result.ok, true);
    assert.deepEqual(persisted, [
      { roomId: 'dmxq_pve_start', seq: 0, type: 'room-created' },
      { roomId: 'dmxq_pve_start', seq: 1, type: 'seat-assigned' },
    ]);
    assert.equal(starts.length, 1);
    assert.equal(starts[0]?.roomId, 'dmxq_pve_start');
    assert.equal(starts[0]?.summary.variant, 'dark-mini-xiangqi');
    assert.equal(starts[0]?.summary.mode, 'pve');
    assert.equal(starts[0]?.summary.visibility, 'public');
  } finally {
    restoreFlag(before);
  }
});

test('Dark Mini Xiangqi live room factory fails closed on persistence errors', async () => {
  const before = process.env[darkMiniXiangqiFlag];
  process.env[darkMiniXiangqiFlag] = 'true';
  try {
    const errors: Array<{ roomId: string; seq: number; eventType: string; message: string }> = [];
    const darkMiniXiangqiRooms = new Map();
    const result = await createDarkMiniXiangqiLiveRoom(
      testContext({
        appendRoomEvent: async () => {
          throw new Error('write failed');
        },
        createRoomId: () => 'dmxq_fail',
        darkMiniXiangqiRooms,
        persistenceEnabled: true,
        recordPersistenceError: (roomId, seq, eventType, err) => {
          errors.push({ roomId, seq, eventType, message: err.message });
        },
      }),
    );

    assert.deepEqual(result, { ok: false, error: 'persistence_failure' });
    assert.equal(darkMiniXiangqiRooms.has('dmxq_fail'), false);
    assert.deepEqual(errors, [
      { roomId: 'dmxq_fail', seq: 0, eventType: 'room-created', message: 'write failed' },
    ]);
  } finally {
    restoreFlag(before);
  }
});

test('Dark Mini Xiangqi live room factory avoids ids occupied by any runtime', async () => {
  const before = process.env[darkMiniXiangqiFlag];
  process.env[darkMiniXiangqiFlag] = 'true';
  try {
    const ids = ['dmxq_chess_taken', 'dmxq_xiangqi_taken', 'dmxq_mini_taken', 'dmxq_free'];
    const result = await createDarkMiniXiangqiLiveRoom(
      testContext({
        chessRoomIds: ['dmxq_chess_taken'],
        createRoomId: () => ids.shift() ?? 'dmxq_unreachable',
        darkMiniXiangqiRoomIds: ['dmxq_mini_taken'],
        darkXiangqiRoomIds: ['dmxq_xiangqi_taken'],
      }),
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.room.id, 'dmxq_free');
  } finally {
    restoreFlag(before);
  }
});

test('Dark Mini Xiangqi live room factory reports collision exhaustion', async () => {
  const before = process.env[darkMiniXiangqiFlag];
  process.env[darkMiniXiangqiFlag] = 'true';
  try {
    const result = await createDarkMiniXiangqiLiveRoom(
      testContext({
        chessRoomIds: ['dmxq_taken'],
        createRoomId: () => 'dmxq_taken',
      }),
    );

    assert.deepEqual(result, { ok: false, error: 'room_id_collision' });
  } finally {
    restoreFlag(before);
  }
});

function testContext(
  overrides: {
    appendRoomEvent?: DarkMiniXiangqiLiveRoomFactoryContext['appendRoomEvent'];
    chessRoomIds?: string[];
    createRoomId?: () => string;
    darkMiniXiangqiRooms?: DarkMiniXiangqiLiveRoomFactoryContext['darkMiniXiangqiRooms'];
    darkMiniXiangqiRoomIds?: string[];
    darkXiangqiRoomIds?: string[];
    persistenceEnabled?: boolean;
    recordGameStart?: DarkMiniXiangqiLiveRoomFactoryContext['recordGameStart'];
    recordPersistenceError?: DarkMiniXiangqiLiveRoomFactoryContext['recordPersistenceError'];
  } = {},
): DarkMiniXiangqiLiveRoomFactoryContext {
  const darkMiniXiangqiRooms = overrides.darkMiniXiangqiRooms ?? new Map();
  for (const roomId of overrides.darkMiniXiangqiRoomIds ?? []) {
    darkMiniXiangqiRooms.set(roomId, undefined as unknown as DarkMiniXiangqiRuntimeRoom);
  }
  const takenRoomIds = new Set([
    ...(overrides.chessRoomIds ?? []),
    ...(overrides.darkXiangqiRoomIds ?? []),
  ]);
  return {
    appendRoomEvent: overrides.appendRoomEvent ?? (async () => {}),
    createRoomId: overrides.createRoomId,
    darkMiniXiangqiRooms,
    isRoomIdTaken: (roomId) => takenRoomIds.has(roomId),
    isPersistenceEnabled: () => overrides.persistenceEnabled ?? false,
    recordGameStart: overrides.recordGameStart ?? (async () => {}),
    recordPersistenceError:
      overrides.recordPersistenceError ??
      (() => {
        throw new Error('unexpected persistence error');
      }),
  };
}

function restoreFlag(value: string | undefined): void {
  if (value === undefined) {
    delete process.env[darkMiniXiangqiFlag];
  } else {
    process.env[darkMiniXiangqiFlag] = value;
  }
}
