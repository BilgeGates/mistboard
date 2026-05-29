import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveWebSocketLiveRuntime,
  type WebSocketRuntimeResolverContext,
} from './server-ws-connection.js';
import type { DarkXiangqiLiveRoom } from './server-ws-dark-xiangqi.js';

const darkXiangqiFlag = 'MISTBOARD_DARK_XIANGQI_ENABLED';

test('WebSocket runtime resolver routes existing Dark Xiangqi rooms before flag checks', async () => {
  const room = darkXiangqiRoomFixture('dxq_existing');
  const ctx = resolverContext({ room });
  const before = process.env[darkXiangqiFlag];
  delete process.env[darkXiangqiFlag];
  try {
    const runtime = await resolveWebSocketLiveRuntime(ctx, 'dxq_existing');
    assert.equal(runtime.kind, 'dark-xiangqi');
    assert.equal(runtime.kind === 'dark-xiangqi' ? runtime.room : null, room);
    assert.equal(ctx.loadCalls, 0);
  } finally {
    restoreFlag(before);
  }
});

test('WebSocket runtime resolver hydrates flagged Dark Xiangqi rooms', async () => {
  const room = darkXiangqiRoomFixture('dxq_hydrate');
  const ctx = resolverContext({ loadRoom: room });
  const before = process.env[darkXiangqiFlag];
  process.env[darkXiangqiFlag] = 'true';
  try {
    const runtime = await resolveWebSocketLiveRuntime(ctx, 'dxq_hydrate');
    assert.equal(runtime.kind, 'dark-xiangqi');
    assert.equal(runtime.kind === 'dark-xiangqi' ? runtime.room : null, room);
    assert.equal(ctx.loadCalls, 1);
  } finally {
    restoreFlag(before);
  }
});

test('WebSocket runtime resolver rejects Dark Xiangqi ids while the flag is off', async () => {
  const ctx = resolverContext({});
  const before = process.env[darkXiangqiFlag];
  delete process.env[darkXiangqiFlag];
  try {
    const runtime = await resolveWebSocketLiveRuntime(ctx, 'dxq_disabled');
    assert.deepEqual(runtime, { kind: 'dark-xiangqi-unavailable', reason: 'game spec disabled' });
    assert.equal(ctx.loadCalls, 0);
  } finally {
    restoreFlag(before);
  }
});

test('WebSocket runtime resolver keeps non-Dark-Xiangqi ids on the chess runtime', async () => {
  const ctx = resolverContext({});
  const before = process.env[darkXiangqiFlag];
  process.env[darkXiangqiFlag] = 'true';
  try {
    const runtime = await resolveWebSocketLiveRuntime(ctx, 'room-chess');
    assert.deepEqual(runtime, { kind: 'chess' });
    assert.equal(ctx.loadCalls, 0);
  } finally {
    restoreFlag(before);
  }
});

test('WebSocket runtime resolver rejects missing flagged Dark Xiangqi rooms', async () => {
  const ctx = resolverContext({});
  const before = process.env[darkXiangqiFlag];
  process.env[darkXiangqiFlag] = 'true';
  try {
    const runtime = await resolveWebSocketLiveRuntime(ctx, 'dxq_missing');
    assert.deepEqual(runtime, { kind: 'dark-xiangqi-unavailable', reason: 'room unavailable' });
    assert.equal(ctx.loadCalls, 1);
  } finally {
    restoreFlag(before);
  }
});

type ResolverTestContext = WebSocketRuntimeResolverContext & { loadCalls: number };

function resolverContext(options: {
  loadRoom?: DarkXiangqiLiveRoom | null;
  room?: DarkXiangqiLiveRoom;
}): ResolverTestContext {
  const rooms = new Map<string, DarkXiangqiLiveRoom>();
  if (options.room) rooms.set(options.room.id, options.room);
  const ctx: ResolverTestContext = {
    darkXiangqiRooms: rooms,
    getOrLoadDarkXiangqiRoom: async () => {
      ctx.loadCalls += 1;
      return options.loadRoom ?? null;
    },
    loadCalls: 0,
  };
  return ctx;
}

function darkXiangqiRoomFixture(id: string): DarkXiangqiLiveRoom {
  return { id } as DarkXiangqiLiveRoom;
}

function restoreFlag(value: string | undefined): void {
  if (value === undefined) {
    delete process.env[darkXiangqiFlag];
    return;
  }
  process.env[darkXiangqiFlag] = value;
}
