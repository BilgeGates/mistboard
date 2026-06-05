import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import test from 'node:test';
import {
  type DualChessColor,
  type DualChessMove,
  getDualChessOpenLegalMoves,
} from '@mistboard/game';
import type { WebSocket } from 'ws';
import { createDualChessRuntimeRoom } from './dual-chess-runtime.js';
import {
  clearDualChessRuntimeTimers,
  type DualChessLiveRoom,
  handleDualChessWebSocketConnection,
} from './server-ws-dual-chess.js';

const dualChessFlag = 'MISTBOARD_DUAL_CHESS_ENABLED';

test('Dual Chess WebSocket handler assigns white and red seats with hello snapshots', async () => {
  await withFlag(async () => {
    const room = liveRoom('dchess_ws');
    const white = new FakeSocket();
    const red = new FakeSocket();

    await connect(room, white, 'white-client');
    await connect(room, red, 'red-client');

    const whiteHello = white.messages[0] as Record<string, unknown>;
    const redHello = red.messages[0] as Record<string, unknown>;
    assert.equal(whiteHello.type, 'hello');
    assert.equal(whiteHello.seat, 'white');
    assert.equal(typeof whiteHello.seatToken, 'string');
    assert.equal(redHello.type, 'hello');
    assert.equal(redHello.seat, 'red');
    assert.equal(typeof redHello.seatToken, 'string');
    assert.equal(room.clients.size, 2);
    assert.deepEqual(room.projection.seats, { white: 'white-client', red: 'red-client' });
    clearDualChessRuntimeTimers(room);
  });
});

test('Dual Chess WebSocket handler rejects a third live client', async () => {
  await withFlag(async () => {
    const room = liveRoom('dchess_full');
    await connect(room, new FakeSocket(), 'white-client');
    await connect(room, new FakeSocket(), 'red-client');
    const third = new FakeSocket();

    await connect(room, third, 'third-client');

    assert.equal(third.closedCode, 1008);
    assert.equal(third.closedReason, 'private room');
    assert.equal(third.messages.length, 0);
    clearDualChessRuntimeTimers(room);
  });
});

test('Dual Chess WebSocket handler reclaims a token seat and displaces the older socket', async () => {
  await withFlag(async () => {
    const room = liveRoom('dchess_reclaim');
    const first = new FakeSocket();
    await connect(room, first, 'white-client');
    const token = (first.messages[0] as Record<string, unknown>).seatToken;
    assert.equal(typeof token, 'string');
    const returning = new FakeSocket();

    await connect(room, returning, 'white-returning', token as string);

    assert.equal(first.closedCode, 4000);
    assert.equal(first.closedReason, 'duplicate session');
    assert.equal((returning.messages[0] as Record<string, unknown>).seat, 'white');
    assert.equal((returning.messages[0] as Record<string, unknown>).seatToken, undefined);
    assert.equal(room.seatTokens.white?.clientId, 'white-returning');
    clearDualChessRuntimeTimers(room);
  });
});

test('Dual Chess WebSocket handler plays a full sequence of legal moves over the socket', async () => {
  await withFlag(async () => {
    const room = liveRoom('dchess_play');
    const white = new FakeSocket();
    const red = new FakeSocket();
    await connect(room, white, 'white-client');
    await connect(room, red, 'red-client');
    white.messages.length = 0;
    red.messages.length = 0;

    // Drive moves from the engine's own legal-move generator so the test never
    // hardcodes coordinates (the board is 6 files a-f, not a-h).
    for (let ply = 1; ply <= 4; ply += 1) {
      const moverSeat = turnOf(room);
      const move = await playNextMove(room, white, red);

      assert.equal(room.events.at(-1)?.type, 'move-played');
      assert.equal((room.events.at(-1) as { color: string }).color, moverSeat);

      // Perfect-information invariant: BOTH players receive the identical event
      // with the full move (no per-seat redaction, unlike the dark variants).
      const whiteFrame = white.messages.at(-1) as Record<string, unknown>;
      const redFrame = red.messages.at(-1) as Record<string, unknown>;
      assert.equal(whiteFrame.type, 'event-appended');
      assert.equal(redFrame.type, 'event-appended');
      const whiteEvent = whiteFrame.event as Record<string, unknown>;
      const redEvent = redFrame.event as Record<string, unknown>;
      assert.equal(whiteEvent.type, 'move-played');
      assert.equal(redEvent.type, 'move-played');
      assert.deepEqual(whiteEvent.move, { from: move.from, to: move.to });
      assert.deepEqual(redEvent.move, whiteEvent.move);
      assert.equal(whiteEvent.ply, ply);
      assert.equal(redEvent.ply, ply);
    }

    assert.equal(room.events.filter((event) => event.type === 'move-played').length, 4);
    // Two full move pairs played → back to White on turn, moveNumber 3.
    assert.deepEqual(room.projection.state.status, { type: 'playing', turn: 'white' });
    assert.equal(room.projection.state.moveNumber, 3);
    clearDualChessRuntimeTimers(room);
  });
});

test('Dual Chess WebSocket handler ends the game when a seat resigns after both sides move', async () => {
  await withFlag(async () => {
    const room = liveRoom('dchess_resign');
    const white = new FakeSocket();
    const red = new FakeSocket();
    await connect(room, white, 'white-client');
    await connect(room, red, 'red-client');

    await playNextMove(room, white, red);
    await playNextMove(room, white, red);
    assert.equal(room.projection.state.moveNumber, 2);

    white.messages.length = 0;
    red.messages.length = 0;
    white.emit('message', JSON.stringify({ type: 'resign' }));
    await room.pendingWrites;
    await Promise.resolve();

    assert.equal(room.events.at(-1)?.type, 'seat-resigned');
    assert.deepEqual(room.projection.state.status, {
      type: 'finished',
      winner: 'red',
      reason: 'resignation',
    });
    const whiteFrame = white.messages.at(-1) as Record<string, unknown>;
    const redFrame = red.messages.at(-1) as Record<string, unknown>;
    assert.equal(whiteFrame.type, 'snapshot');
    assert.deepEqual((whiteFrame.state as Record<string, unknown>).status, {
      type: 'finished',
      winner: 'red',
      reason: 'resignation',
    });
    assert.deepEqual((redFrame.state as Record<string, unknown>).status, {
      type: 'finished',
      winner: 'red',
      reason: 'resignation',
    });
    clearDualChessRuntimeTimers(room);
  });
});

test('Dual Chess WebSocket handler ignores resignation before both sides have moved', async () => {
  await withFlag(async () => {
    const room = liveRoom('dchess_resign_early');
    const white = new FakeSocket();
    const red = new FakeSocket();
    await connect(room, white, 'white-client');
    await connect(room, red, 'red-client');

    const eventCountBefore = room.events.length;
    white.emit('message', JSON.stringify({ type: 'resign' }));
    await room.pendingWrites;
    await Promise.resolve();

    assert.equal(room.events.length, eventCountBefore);
    assert.equal(room.projection.state.status.type, 'playing');
    clearDualChessRuntimeTimers(room);
  });
});

test('Dual Chess WebSocket handler aborts a pregame room for the player to move', async () => {
  await withFlag(async () => {
    const room = liveRoom('dchess_abort');
    const white = new FakeSocket();
    const red = new FakeSocket();
    await connect(room, white, 'white-client');
    await connect(room, red, 'red-client');

    white.messages.length = 0;
    red.messages.length = 0;
    // White moves first in Dual Chess, so White is the player to move at pregame.
    white.emit('message', JSON.stringify({ type: 'abort' }));
    await room.pendingWrites;
    await Promise.resolve();

    assert.equal(room.events.at(-1)?.type, 'game-aborted');
    assert.deepEqual(room.projection.state.status, { type: 'aborted', reason: 'user-abort' });
    const whiteFrame = white.messages.at(-1) as Record<string, unknown>;
    assert.deepEqual((whiteFrame.state as Record<string, unknown>).status, {
      type: 'aborted',
      reason: 'user-abort',
    });
    clearDualChessRuntimeTimers(room);
  });
});

test('Dual Chess WebSocket handler ignores abort from the player not on the move', async () => {
  await withFlag(async () => {
    const room = liveRoom('dchess_abort_turn');
    const white = new FakeSocket();
    const red = new FakeSocket();
    await connect(room, white, 'white-client');
    await connect(room, red, 'red-client');

    const eventCountBefore = room.events.length;
    // Red is not on the move at pregame; the abort must be ignored.
    red.emit('message', JSON.stringify({ type: 'abort' }));
    await room.pendingWrites;
    await Promise.resolve();

    assert.equal(room.events.length, eventCountBefore);
    assert.equal(room.projection.state.status.type, 'playing');
    clearDualChessRuntimeTimers(room);
  });
});

test('Dual Chess WebSocket handler rejects abort after both sides have moved', async () => {
  await withFlag(async () => {
    const room = liveRoom('dchess_abort_late');
    const white = new FakeSocket();
    const red = new FakeSocket();
    await connect(room, white, 'white-client');
    await connect(room, red, 'red-client');

    await playNextMove(room, white, red);
    await playNextMove(room, white, red);
    assert.equal(room.projection.state.moveNumber, 2);

    const eventCountBefore = room.events.length;
    white.emit('message', JSON.stringify({ type: 'abort' }));
    await room.pendingWrites;
    await Promise.resolve();

    assert.equal(room.events.length, eventCountBefore);
    assert.equal(room.projection.state.status.type, 'playing');
    clearDualChessRuntimeTimers(room);
  });
});

test('Dual Chess WebSocket handler arms a forfeit timer when a seat disconnects mid-game', async () => {
  await withFlag(async () => {
    const room = liveRoom('dchess_forfeit_arm');
    const white = new FakeSocket();
    const red = new FakeSocket();
    await connect(room, white, 'white-client');
    await connect(room, red, 'red-client');

    await playNextMove(room, white, red);
    await playNextMove(room, white, red);
    assert.equal(room.forfeitSeat, null);

    red.emit('close');

    assert.equal(room.forfeitSeat, 'red');
    assert.notEqual(room.forfeitTimer, null);
    clearDualChessRuntimeTimers(room);
  });
});

test('Dual Chess WebSocket handler does not arm a forfeit timer during the pregame', async () => {
  await withFlag(async () => {
    const room = liveRoom('dchess_forfeit_pregame');
    const white = new FakeSocket();
    const red = new FakeSocket();
    await connect(room, white, 'white-client');
    await connect(room, red, 'red-client');

    red.emit('close');

    assert.equal(room.forfeitSeat, null);
    assert.equal(room.forfeitTimer, null);
    clearDualChessRuntimeTimers(room);
  });
});

// ── Harness ──────────────────────────────────────────────────────────────────

function context() {
  return { wsMessageLimit: 20, wsMessageWindowMs: 1000 };
}

function turnOf(room: DualChessLiveRoom): DualChessColor {
  const status = room.projection.state.status;
  assert.ok(status.type === 'playing', 'expected an in-progress game');
  return status.turn;
}

async function connect(
  room: DualChessLiveRoom,
  fake: FakeSocket,
  clientId: string,
  seatToken?: string,
): Promise<void> {
  await handleDualChessWebSocketConnection(
    context(),
    fake.socket,
    request(room.id, clientId, seatToken),
    room,
  );
}

// Plays one legal move for whichever side is on the move, driven by the engine's
// own generator (avoids hardcoding squares on the 6-file board). Returns the move.
async function playNextMove(
  room: DualChessLiveRoom,
  white: FakeSocket,
  red: FakeSocket,
): Promise<DualChessMove> {
  const turn = turnOf(room);
  const mover = turn === 'white' ? white : red;
  const move = getDualChessOpenLegalMoves(room.projection.state).find((m) => !m.promotion);
  assert.ok(move, 'expected a non-promotion legal move');
  mover.emit('message', JSON.stringify({ type: 'move', from: move.from, to: move.to }));
  await room.pendingWrites;
  await Promise.resolve();
  return move;
}

function request(roomId: string, clientId: string, seatToken?: string): IncomingMessage {
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

function liveRoom(roomId: string): DualChessLiveRoom {
  const created = createDualChessRuntimeRoom(roomId);
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error('flagged Dual Chess room creation failed');
  return created.room as DualChessLiveRoom;
}

async function withFlag(fn: () => Promise<void>): Promise<void> {
  const before = process.env[dualChessFlag];
  process.env[dualChessFlag] = 'true';
  try {
    await fn();
  } finally {
    if (before === undefined) delete process.env[dualChessFlag];
    else process.env[dualChessFlag] = before;
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
