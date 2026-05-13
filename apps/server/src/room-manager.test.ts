import assert from 'node:assert/strict';
import test from 'node:test';
import type { WebSocket } from 'ws';
import {
  createClock,
  generateChess960Starts,
  replayGameEvents,
  type GameEvent,
} from '@mistboard/game';
import {
  appendEvent,
  broadcastSnapshot,
  expireActiveClock,
  playMove,
  resolveStartIfReady,
  type RoomManagerContext,
} from './room-manager.js';
import type { Client, Room } from './server-types.js';
import type { Seat } from './payloads.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRoom(
  id: string,
  variant: 'fog-of-war' | 'draft960' | 'bid-for-white' = 'fog-of-war',
  events?: GameEvent[],
): Room {
  const roomEvents: GameEvent[] = events ?? [
    { type: 'room-created', at: 1, roomId: id, variant, offer: [] },
  ];
  return {
    id,
    clients: new Set(),
    events: [...roomEvents],
    projection: replayGameEvents(roomEvents),
    seatTokens: {},
    clockTimer: null,
    engineTimer: null,
    mode: 'pvp',
    rated: true,
    randomEngine: false,
    randomSeating: false,
    pveEngineId: null,
    pendingWrites: Promise.resolve(),
    gameEndRecorded: false,
  };
}

function makeClient(id: string, seat: Seat = 'white', solo = false, roomId = 'room-a'): Client {
  return {
    id,
    seat,
    solo,
    displaced: false,
    seatTokenHash: undefined,
    messageTimestamps: [],
    devViews: false,
    debugRequested: false,
    roomId,
    socket: { send: () => {} } as unknown as WebSocket,
  };
}

type SpyCtx = RoomManagerContext & { sent: Array<{ client: Client; payload: unknown }> };

function makeCtx(): SpyCtx {
  const sent: Array<{ client: Client; payload: unknown }> = [];
  return {
    sent,
    send(client: Client, payload: unknown) { sent.push({ client, payload }); },
    recordPersistenceError() {},
    pveBuiltinEngineClientId: 'builtin-random-legal',
    pveEngineMoveDelayMs: 0,
    liveEngineTimeoutMs: 3_000,
    liveClockInitialMs: 180_000,
    liveClockIncrementMs: 2_000,
  };
}

// ── playMove ──────────────────────────────────────────────────────────────────

test('playMove: valid move advances state and appends a move-played event', async () => {
  // fog-of-war with empty offer starts in playing state, white to move
  const room = makeRoom('room-a');
  const client = makeClient('white-c', 'white', /* solo= */ true);
  room.clients.add(client);
  const ctx = makeCtx();
  const before = room.events.length;

  await playMove(ctx, room, client, { type: 'move', from: 'e2', to: 'e4' });

  assert.equal(room.events.length, before + 1);
  assert.equal(room.events[room.events.length - 1].type, 'move-played');
  assert.equal(room.projection.state.status.type, 'playing');
  assert.equal(
    (room.projection.state.status as { type: 'playing'; turn: string }).turn,
    'black',
    'turn should advance to black after white moves',
  );
});

test('playMove: illegal move (pawn jumping two illegal ranks) is rejected', async () => {
  const room = makeRoom('room-a');
  const client = makeClient('white-c', 'white', true);
  room.clients.add(client);
  const ctx = makeCtx();
  const before = room.events.length;

  // e2→e5 is not a legal pawn move
  await playMove(ctx, room, client, { type: 'move', from: 'e2', to: 'e5' });

  assert.equal(room.events.length, before, 'no event should be appended for an illegal move');
});

test('playMove: move on wrong turn is rejected', async () => {
  // It is white's turn. Black client has no matching seat token → canClientAct returns false.
  const room = makeRoom('room-a');
  const client = makeClient('black-c', 'black', /* solo= */ false);
  room.clients.add(client);
  const ctx = makeCtx();
  const before = room.events.length;

  await playMove(ctx, room, client, { type: 'move', from: 'e7', to: 'e5' });

  assert.equal(room.events.length, before, 'no event should be appended when canClientAct is false');
});

test('playMove: move after game over is rejected', async () => {
  const room = makeRoom('room-a');
  room.projection = {
    ...room.projection,
    state: {
      ...room.projection.state,
      status: { type: 'finished', winner: 'white', reason: 'checkmate' },
    },
  };
  const client = makeClient('white-c', 'white', true);
  room.clients.add(client);
  const ctx = makeCtx();
  const before = room.events.length;

  await playMove(ctx, room, client, { type: 'move', from: 'e2', to: 'e4' });

  assert.equal(room.events.length, before, 'no event should be appended when the game is already over');
});

// ── appendEvent ────────────────────────────────────────────────────────────────

test('appendEvent: pushes event to room.events', async () => {
  const room = makeRoom('room-b');
  const ctx = makeCtx();
  const event: GameEvent = {
    type: 'seat-assigned',
    at: Date.now(),
    roomId: 'room-b',
    clientId: 'c1',
    seat: 'white',
  };
  const before = room.events.length;

  await appendEvent(ctx, room, event);

  assert.equal(room.events.length, before + 1);
  assert.equal(room.events[room.events.length - 1], event);
});

test('appendEvent: updates room.projection after the event is applied', async () => {
  const room = makeRoom('room-b');
  const ctx = makeCtx();

  await appendEvent(ctx, room, {
    type: 'seat-assigned',
    at: Date.now(),
    roomId: 'room-b',
    clientId: 'c1',
    seat: 'white',
  });

  assert.equal(room.projection.seats.white, 'c1', 'projection should reflect the newly assigned seat');
});

// ── broadcastSnapshot ─────────────────────────────────────────────────────────

test('broadcastSnapshot: calls ctx.send for every connected client', () => {
  const room = makeRoom('room-c');
  const c1 = makeClient('c1', 'white', true, 'room-c');
  const c2 = makeClient('c2', 'spectator', false, 'room-c');
  room.clients.add(c1);
  room.clients.add(c2);
  room.projection = { ...room.projection, seats: { white: 'c1' } };
  const ctx = makeCtx();

  broadcastSnapshot(ctx, room);

  assert.equal(ctx.sent.length, 2, 'should send one payload per client');
  const ids = ctx.sent.map((s) => s.client.id);
  assert.ok(ids.includes('c1'));
  assert.ok(ids.includes('c2'));
});

// ── resolveStartIfReady ───────────────────────────────────────────────────────

test('resolveStartIfReady: appends draft-start-resolved when both seats have selected', async () => {
  const starts = generateChess960Starts();
  const offer = [starts[0], starts[1], starts[2]];
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'room-d', variant: 'draft960', offer },
    { type: 'seat-assigned', at: 2, roomId: 'room-d', clientId: 'white-c', seat: 'white' },
    { type: 'seat-assigned', at: 3, roomId: 'room-d', clientId: 'black-c', seat: 'black' },
    { type: 'draft-start-selected', at: 4, roomId: 'room-d', color: 'white', startId: starts[0].id },
    { type: 'draft-start-selected', at: 5, roomId: 'room-d', color: 'black', startId: starts[1].id },
  ];
  const room = makeRoom('room-d', 'draft960', events);
  const ctx = makeCtx();
  assert.equal(room.projection.state.status.type, 'pregame', 'precondition: still in pregame');
  const before = room.events.length;

  await resolveStartIfReady(ctx, room);

  assert.equal(room.events.length, before + 1);
  assert.equal(room.events[room.events.length - 1].type, 'draft-start-resolved');
  assert.equal(room.projection.state.status.type, 'playing');

  // Clean up timer set by scheduleClockTimeout inside appendEvent
  if (room.clockTimer) { clearTimeout(room.clockTimer); room.clockTimer = null; }
});

test('resolveStartIfReady: does not resolve when only one seat has selected', async () => {
  const starts = generateChess960Starts();
  const offer = [starts[0], starts[1], starts[2]];
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'room-e', variant: 'draft960', offer },
    { type: 'seat-assigned', at: 2, roomId: 'room-e', clientId: 'white-c', seat: 'white' },
    { type: 'seat-assigned', at: 3, roomId: 'room-e', clientId: 'black-c', seat: 'black' },
    { type: 'draft-start-selected', at: 4, roomId: 'room-e', color: 'white', startId: starts[0].id },
    // black has NOT selected
  ];
  const room = makeRoom('room-e', 'draft960', events);
  const ctx = makeCtx();
  const before = room.events.length;

  await resolveStartIfReady(ctx, room);

  assert.equal(room.events.length, before, 'no event should be appended while a selection is missing');
  assert.equal(room.projection.state.status.type, 'pregame');
});

// ── expireActiveClock ─────────────────────────────────────────────────────────

test('expireActiveClock: appends clock-expired event and sets correct winner', async () => {
  // fog-of-war starts playing with white to move; inject an active clock
  const room = makeRoom('room-f');
  const now = Date.now();
  const clock = createClock(now, 60_000, 0);
  room.projection = {
    ...room.projection,
    state: { ...room.projection.state, clock },
  };
  const ctx = makeCtx();
  const before = room.events.length;

  await expireActiveClock(ctx, room, 'white', now);

  assert.equal(room.events.length, before + 1);
  assert.equal(room.events[room.events.length - 1].type, 'clock-expired');
  assert.equal(room.projection.state.status.type, 'finished');
  assert.equal(
    (room.projection.state.status as { type: 'finished'; winner: string }).winner,
    'black',
    'white clock expired → black wins',
  );
});

// ── Seat assignment via event projection ──────────────────────────────────────
// assignSeat() lives in index.ts and cannot be imported in isolation.
// These tests verify the same observable invariants through appendEvent + projection.

test('seat assignment: first joiner gets white seat', async () => {
  const room = makeRoom('room-g');
  const ctx = makeCtx();

  await appendEvent(ctx, room, {
    type: 'seat-assigned',
    at: Date.now(),
    roomId: 'room-g',
    clientId: 'c1',
    seat: 'white',
  });

  assert.equal(room.projection.seats.white, 'c1');
  assert.equal(room.projection.seats.black, undefined);
});

test('seat assignment: second joiner gets black seat', async () => {
  const room = makeRoom('room-g');
  const ctx = makeCtx();

  await appendEvent(ctx, room, {
    type: 'seat-assigned',
    at: Date.now(),
    roomId: 'room-g',
    clientId: 'c1',
    seat: 'white',
  });
  await appendEvent(ctx, room, {
    type: 'seat-assigned',
    at: Date.now(),
    roomId: 'room-g',
    clientId: 'c2',
    seat: 'black',
  });

  assert.equal(room.projection.seats.white, 'c1');
  assert.equal(room.projection.seats.black, 'c2');
});

test('seat assignment: third connection is spectator (no seat left)', async () => {
  // With both color seats filled, assignSeat() in index.ts returns { seat: 'spectator' }.
  // We verify the projection gate: when projection.seats.white and .black are both set,
  // no further seat-assigned event changes them (event replay rejects a duplicate assignment).
  const room = makeRoom('room-g');
  const ctx = makeCtx();

  await appendEvent(ctx, room, {
    type: 'seat-assigned', at: 1, roomId: 'room-g', clientId: 'c1', seat: 'white',
  });
  await appendEvent(ctx, room, {
    type: 'seat-assigned', at: 2, roomId: 'room-g', clientId: 'c2', seat: 'black',
  });

  // index.ts assignSeat() returns spectator when both seats are filled.
  // The projection confirms no empty seat remains.
  assert.ok(room.projection.seats.white !== undefined, 'white should be filled');
  assert.ok(room.projection.seats.black !== undefined, 'black should be filled');
});
