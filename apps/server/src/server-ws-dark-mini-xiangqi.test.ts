import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import test from 'node:test';
import type { WebSocket } from 'ws';
import { createDarkMiniXiangqiRuntimeRoom } from './dark-mini-xiangqi-runtime.js';
import {
  type DarkMiniXiangqiLiveRoom,
  handleDarkMiniXiangqiWebSocketConnection,
} from './server-ws-dark-mini-xiangqi.js';

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

test('Dark Mini Xiangqi WebSocket handler rejects a third live client', async () => {
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

    await handleDarkMiniXiangqiWebSocketConnection(
      testContext(),
      third.socket,
      request('dmxq_full', 'third-client'),
      room,
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

function testContext() {
  return {
    wsMessageLimit: 20,
    wsMessageWindowMs: 1000,
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
  const created = createDarkMiniXiangqiRuntimeRoom(roomId);
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
