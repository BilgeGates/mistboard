import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import test from 'node:test';
import type { WebSocket } from 'ws';
import { darkMiniXiangqiTenant } from './dark-mini-xiangqi-tenant.js';
import type { DarkMiniXiangqiRematchContext } from './server-dark-mini-xiangqi-rematch.js';
import {
  clearDarkMiniXiangqiRuntimeTimers,
  type DarkMiniXiangqiLiveRoom,
  handleDarkMiniXiangqiWebSocketConnection,
} from './server-ws-dark-mini-xiangqi.js';
import { createTenantRuntimeRoom } from './variant-tenant/runtime.js';

const darkMiniXiangqiFlag = 'MISTBOARD_DARK_MINI_XIANGQI_ENABLED';

test('Dark Mini Xiangqi WebSocket handler assigns red and black seats with hello snapshots', async () => {
  await withFlag(async () => {
    const room = liveRoom('dmxq_ws');
    const red = new FakeSocket();
    const black = new FakeSocket();

    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      red.socket,
      request('dmxq_ws', 'red-client'),
      room,
    );
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      black.socket,
      request('dmxq_ws', 'black-client'),
      room,
    );

    const redHello = red.messages[0] as Record<string, unknown>;
    const blackHello = black.messages[0] as Record<string, unknown>;
    assert.equal(redHello.type, 'hello');
    assert.equal(redHello.seat, 'red');
    assert.equal(typeof redHello.seatToken, 'string');
    assert.equal(blackHello.type, 'hello');
    assert.equal(blackHello.seat, 'black');
    assert.equal(typeof blackHello.seatToken, 'string');
    assert.equal(room.clients.size, 2);
    assert.deepEqual(room.projection.seats, {
      red: 'red-client',
      black: 'black-client',
    });
  });
});

test('Dark Mini Xiangqi WebSocket handler rejects a third live client (production)', async () => {
  await withFlag(async () => {
    const room = liveRoom('dmxq_full');
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      new FakeSocket().socket,
      request('dmxq_full', 'red-client'),
      room,
    );
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      new FakeSocket().socket,
      request('dmxq_full', 'black-client'),
      room,
    );
    const third = new FakeSocket();

    // The tenant spectator fallback (variant-tenant/ws.ts) admits a tokenless
    // visitor to a full room only in a non-production runtime (or with an admin
    // debug token). Pin the production fail-closed path: a real third user is
    // still closed 1008. Dev spectator admission is covered by
    // variant-tenant/ws-spectator.test.ts.
    await withProductionRuntime(() =>
      handleDarkMiniXiangqiWebSocketConnection(
        testContext(),
        third.socket,
        request('dmxq_full', 'third-client'),
        room,
      ),
    );

    assert.equal(third.closedCode, 1008);
    assert.equal(third.closedReason, 'private room');
    assert.equal(third.messages.length, 0);
  });
});

test('Dark Mini Xiangqi WebSocket handler reclaims a token seat and displaces older socket', async () => {
  await withFlag(async () => {
    const room = liveRoom('dmxq_reclaim');
    const first = new FakeSocket();
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      first.socket,
      request('dmxq_reclaim', 'red-client'),
      room,
    );
    const token = (first.messages[0] as Record<string, unknown>).seatToken;
    assert.equal(typeof token, 'string');
    const returning = new FakeSocket();

    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      returning.socket,
      request('dmxq_reclaim', 'red-returning', token),
      room,
    );

    assert.equal(first.closedCode, 4000);
    assert.equal(first.closedReason, 'duplicate session');
    assert.equal((returning.messages[0] as Record<string, unknown>).seat, 'red');
    assert.equal((returning.messages[0] as Record<string, unknown>).seatToken, undefined);
    assert.equal(room.seatTokens.red?.clientId, 'red-returning');
  });
});

test('Dark Mini Xiangqi WebSocket handler appends legal moves without leaking opponent coordinates', async () => {
  await withFlag(async () => {
    const room = liveRoom('dmxq_move');
    const red = new FakeSocket();
    const black = new FakeSocket();
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      red.socket,
      request('dmxq_move', 'red-client'),
      room,
    );
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      black.socket,
      request('dmxq_move', 'black-client'),
      room,
    );
    red.messages.length = 0;
    black.messages.length = 0;

    red.emit('message', JSON.stringify({ type: 'move', from: 'a2', to: 'a3' }));
    await room.pendingWrites;
    await Promise.resolve();

    assert.equal(room.events.at(-1)?.type, 'move-played');
    assert.deepEqual(room.projection.state.lastMove, { from: 'a2', to: 'a3' });
    assert.deepEqual(room.projection.state.status, { type: 'playing', turn: 'black' });
    const redFrame = red.messages.at(-1) as Record<string, unknown>;
    const blackFrame = black.messages.at(-1) as Record<string, unknown>;
    assert.equal(redFrame.type, 'event-appended');
    assert.equal((redFrame.event as Record<string, unknown> | undefined)?.type, 'move-played');
    assert.equal(blackFrame.type, 'event-appended');
    assert.equal(blackFrame.event, undefined);
    assert.equal((blackFrame.state as Record<string, unknown>).lastMove, undefined);
  });
});

test('Dark Mini Xiangqi WebSocket handler ends the game when a seat resigns after both sides move', async () => {
  await withFlag(async () => {
    const room = liveRoom('dmxq_resign');
    const red = new FakeSocket();
    const black = new FakeSocket();
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      red.socket,
      request('dmxq_resign', 'red-client'),
      room,
    );
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      black.socket,
      request('dmxq_resign', 'black-client'),
      room,
    );

    red.emit('message', JSON.stringify({ type: 'move', from: 'a2', to: 'a3' }));
    await room.pendingWrites;
    black.emit('message', JSON.stringify({ type: 'move', from: 'a6', to: 'a5' }));
    await room.pendingWrites;
    assert.equal(room.projection.state.moveNumber, 2);

    red.messages.length = 0;
    black.messages.length = 0;
    red.emit('message', JSON.stringify({ type: 'resign' }));
    await room.pendingWrites;
    await Promise.resolve();

    assert.equal(room.events.at(-1)?.type, 'seat-resigned');
    assert.deepEqual(room.projection.state.status, {
      type: 'finished',
      winner: 'black',
      reason: 'resignation',
    });
    const redFrame = red.messages.at(-1) as Record<string, unknown>;
    const blackFrame = black.messages.at(-1) as Record<string, unknown>;
    assert.equal(redFrame.type, 'snapshot');
    assert.deepEqual((redFrame.state as Record<string, unknown>).status, {
      type: 'finished',
      winner: 'black',
      reason: 'resignation',
    });
    assert.deepEqual((blackFrame.state as Record<string, unknown>).status, {
      type: 'finished',
      winner: 'black',
      reason: 'resignation',
    });
  });
});

test('Dark Mini Xiangqi WebSocket handler ignores resignation before both sides have moved', async () => {
  await withFlag(async () => {
    const room = liveRoom('dmxq_early');
    const red = new FakeSocket();
    const black = new FakeSocket();
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      red.socket,
      request('dmxq_early', 'red-client'),
      room,
    );
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      black.socket,
      request('dmxq_early', 'black-client'),
      room,
    );

    const eventCountBefore = room.events.length;
    red.emit('message', JSON.stringify({ type: 'resign' }));
    await room.pendingWrites;
    await Promise.resolve();

    assert.equal(room.events.length, eventCountBefore);
    assert.equal(room.projection.state.status.type, 'playing');
  });
});

test('Dark Mini Xiangqi WebSocket handler aborts a pregame room for the player to move', async () => {
  await withFlag(async () => {
    const room = liveRoom('dmxq_abort');
    const red = new FakeSocket();
    const black = new FakeSocket();
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      red.socket,
      request('dmxq_abort', 'red-client'),
      room,
    );
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      black.socket,
      request('dmxq_abort', 'black-client'),
      room,
    );

    red.messages.length = 0;
    black.messages.length = 0;
    red.emit('message', JSON.stringify({ type: 'abort' }));
    await room.pendingWrites;
    await Promise.resolve();

    assert.equal(room.events.at(-1)?.type, 'game-aborted');
    assert.deepEqual(room.projection.state.status, { type: 'aborted', reason: 'user-abort' });
    const redFrame = red.messages.at(-1) as Record<string, unknown>;
    assert.deepEqual((redFrame.state as Record<string, unknown>).status, {
      type: 'aborted',
      reason: 'user-abort',
    });
  });
});

test('Dark Mini Xiangqi WebSocket handler ignores abort from the player not on the move', async () => {
  await withFlag(async () => {
    const room = liveRoom('dmxq_abort_turn');
    const red = new FakeSocket();
    const black = new FakeSocket();
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      red.socket,
      request('dmxq_abort_turn', 'red-client'),
      room,
    );
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      black.socket,
      request('dmxq_abort_turn', 'black-client'),
      room,
    );

    const eventCountBefore = room.events.length;
    black.emit('message', JSON.stringify({ type: 'abort' }));
    await room.pendingWrites;
    await Promise.resolve();

    assert.equal(room.events.length, eventCountBefore);
    assert.equal(room.projection.state.status.type, 'playing');
  });
});

test('Dark Mini Xiangqi WebSocket handler rejects abort after both sides have moved', async () => {
  await withFlag(async () => {
    const room = liveRoom('dmxq_abort_late');
    const red = new FakeSocket();
    const black = new FakeSocket();
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      red.socket,
      request('dmxq_abort_late', 'red-client'),
      room,
    );
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      black.socket,
      request('dmxq_abort_late', 'black-client'),
      room,
    );

    red.emit('message', JSON.stringify({ type: 'move', from: 'a2', to: 'a3' }));
    await room.pendingWrites;
    black.emit('message', JSON.stringify({ type: 'move', from: 'a6', to: 'a5' }));
    await room.pendingWrites;
    assert.equal(room.projection.state.moveNumber, 2);

    const eventCountBefore = room.events.length;
    red.emit('message', JSON.stringify({ type: 'abort' }));
    await room.pendingWrites;
    await Promise.resolve();

    assert.equal(room.events.length, eventCountBefore);
    assert.equal(room.projection.state.status.type, 'playing');
  });
});

test('Dark Mini Xiangqi WebSocket handler arms a forfeit timer when a seat disconnects mid-game', async () => {
  await withFlag(async () => {
    const room = liveRoom('dmxq_forfeit_arm');
    const red = new FakeSocket();
    const black = new FakeSocket();
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      red.socket,
      request('dmxq_forfeit_arm', 'red-client'),
      room,
    );
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      black.socket,
      request('dmxq_forfeit_arm', 'black-client'),
      room,
    );

    red.emit('message', JSON.stringify({ type: 'move', from: 'a2', to: 'a3' }));
    await room.pendingWrites;
    black.emit('message', JSON.stringify({ type: 'move', from: 'a6', to: 'a5' }));
    await room.pendingWrites;
    assert.equal(room.forfeitSeat, null);

    black.emit('close');

    assert.equal(room.forfeitSeat, 'black');
    assert.notEqual(room.forfeitTimer, null);
    clearDarkMiniXiangqiRuntimeTimers(room);
  });
});

test('Dark Mini Xiangqi WebSocket handler does not arm a forfeit timer during the pregame', async () => {
  await withFlag(async () => {
    const room = liveRoom('dmxq_forfeit_pregame');
    const red = new FakeSocket();
    const black = new FakeSocket();
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      red.socket,
      request('dmxq_forfeit_pregame', 'red-client'),
      room,
    );
    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      black.socket,
      request('dmxq_forfeit_pregame', 'black-client'),
      room,
    );

    black.emit('close');

    assert.equal(room.forfeitSeat, null);
    assert.equal(room.forfeitTimer, null);
    clearDarkMiniXiangqiRuntimeTimers(room);
  });
});

function testContext() {
  return {
    wsMessageLimit: 20,
    wsMessageWindowMs: 1000,
    darkMiniXiangqiRematch: stubRematchContext(),
  };
}

// These tests don't exercise rematch; a no-op context just satisfies the type.
function stubRematchContext(): DarkMiniXiangqiRematchContext {
  return {
    send: () => {},
    createRoom: async () => ({ ok: false, error: 'dark_mini_xiangqi_disabled' }),
    issueSeatToken: async (_room, seat) => ({
      rawToken: 'stub-token',
      state: {
        clientId: 'stub',
        seat,
        tokenHash: 'stub',
        userId: null,
        userHandle: null,
        userDisplayName: null,
        issuedAt: new Date(),
        lastSeenAt: new Date(),
        revokedAt: null,
      },
    }),
    buildRoomUrl: (roomId) => `/room/${roomId}`,
  };
}

function request(roomId: string, clientId: string, seatToken?: unknown): IncomingMessage {
  return {
    headers: {
      host: 'localhost',
      ...(typeof seatToken === 'string'
        ? { 'sec-websocket-protocol': `mistboard-seat.${seatToken}` }
        : {}),
    },
    url: `/room/${roomId}?room=${encodeURIComponent(roomId)}&client=${encodeURIComponent(clientId)}`,
  } as IncomingMessage;
}

function liveRoom(roomId: string): DarkMiniXiangqiLiveRoom {
  const created = createTenantRuntimeRoom(darkMiniXiangqiTenant, roomId);
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error('flagged mini room creation failed');
  return created.room as DarkMiniXiangqiLiveRoom;
}

async function withFlag(fn: () => Promise<void>): Promise<void> {
  const before = process.env[darkMiniXiangqiFlag];
  process.env[darkMiniXiangqiFlag] = 'true';
  try {
    await fn();
  } finally {
    if (before === undefined) delete process.env[darkMiniXiangqiFlag];
    else process.env[darkMiniXiangqiFlag] = before;
  }
}

// Force a production-like runtime so the tenant spectator fallback is denied and
// the private-room rejection is fail-closed (isProductionLikeRuntime keys off
// NODE_ENV). Restores the prior value so later tests keep the dev runtime.
async function withProductionRuntime(fn: () => Promise<void>): Promise<void> {
  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await fn();
  } finally {
    if (before === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = before;
  }
}

class FakeSocket {
  closedCode: number | undefined;
  closedReason: string | undefined;
  listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  messages: unknown[] = [];

  socket = {
    close: (code?: number, reason?: string) => {
      this.closedCode = code;
      this.closedReason = reason;
    },
    on: (event: string, listener: (...args: unknown[]) => void) => {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
      return this.socket;
    },
    send: (payload: string) => {
      this.messages.push(JSON.parse(payload) as unknown);
    },
  } as unknown as WebSocket;

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}
