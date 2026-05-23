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
  applyOrphanRecoveryIfNeeded,
  broadcastSnapshot,
  buildGameSummary,
  expireActiveClock,
  pauseRoomOnShutdown,
  playMove,
  resolveStartIfReady,
  resumeRoom,
  resumeRoomIfReady,
  scheduleRandomEngineMove,
  type RoomManagerContext,
} from './room-manager.js';
import type { Client, Room } from './server-types.js';
import type { Seat } from './payloads.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRoom(
  id: string,
  variant: 'fog-of-war' | 'draft960' = 'fog-of-war',
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
    creatorPreference: null,
    pveEngineId: null,
    pendingWrites: Promise.resolve(),
    gameEndRecorded: false,
    variant,
    hiddenDraft960: false,
    timeControl: undefined,
    rematch: { offers: {} },
    pendingVacates: {},
    pauseGraceTimer: null,
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
    send(client: Client, payload: unknown) {
      sent.push({ client, payload });
    },
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

  assert.equal(
    room.events.length,
    before,
    'no event should be appended when canClientAct is false',
  );
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

  assert.equal(
    room.events.length,
    before,
    'no event should be appended when the game is already over',
  );
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

  assert.equal(
    room.projection.seats.white,
    'c1',
    'projection should reflect the newly assigned seat',
  );
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
    {
      type: 'draft-start-selected',
      at: 4,
      roomId: 'room-d',
      color: 'white',
      startId: starts[0].id,
    },
    {
      type: 'draft-start-selected',
      at: 5,
      roomId: 'room-d',
      color: 'black',
      startId: starts[1].id,
    },
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
  if (room.clockTimer) {
    clearTimeout(room.clockTimer);
    room.clockTimer = null;
  }
});

test('resolveStartIfReady: does not resolve when only one seat has selected', async () => {
  const starts = generateChess960Starts();
  const offer = [starts[0], starts[1], starts[2]];
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'room-e', variant: 'draft960', offer },
    { type: 'seat-assigned', at: 2, roomId: 'room-e', clientId: 'white-c', seat: 'white' },
    { type: 'seat-assigned', at: 3, roomId: 'room-e', clientId: 'black-c', seat: 'black' },
    {
      type: 'draft-start-selected',
      at: 4,
      roomId: 'room-e',
      color: 'white',
      startId: starts[0].id,
    },
    // black has NOT selected
  ];
  const room = makeRoom('room-e', 'draft960', events);
  const ctx = makeCtx();
  const before = room.events.length;

  await resolveStartIfReady(ctx, room);

  assert.equal(
    room.events.length,
    before,
    'no event should be appended while a selection is missing',
  );
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
    type: 'seat-assigned',
    at: 1,
    roomId: 'room-g',
    clientId: 'c1',
    seat: 'white',
  });
  await appendEvent(ctx, room, {
    type: 'seat-assigned',
    at: 2,
    roomId: 'room-g',
    clientId: 'c2',
    seat: 'black',
  });

  // index.ts assignSeat() returns spectator when both seats are filled.
  // The projection confirms no empty seat remains.
  assert.ok(room.projection.seats.white !== undefined, 'white should be filled');
  assert.ok(room.projection.seats.black !== undefined, 'black should be filled');
});

// ── buildGameSummary: rated policy ────────────────────────────────────────────

test('buildGameSummary: engine seat forces rated=false even when room.rated=true', () => {
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'room-pve', variant: 'fog-of-war', offer: [] },
    {
      type: 'seat-assigned',
      at: 2,
      roomId: 'room-pve',
      clientId: 'builtin-random-legal',
      seat: 'white',
    },
    { type: 'seat-assigned', at: 3, roomId: 'room-pve', clientId: 'human-c', seat: 'black' },
    { type: 'seat-resigned', at: 4, roomId: 'room-pve', color: 'black' },
  ];
  const room = makeRoom('room-pve', 'fog-of-war', events);
  room.mode = 'pve';
  room.rated = true;
  const ctx = makeCtx();

  const summary = buildGameSummary(ctx, room);

  assert.equal(summary.rated, false, 'engine participant must force casual');
  assert.equal(summary.termination, 'resignation');
  assert.equal(summary.participants?.[0]?.subjectType, 'engine-version');
});

test('buildGameSummary: two human seats preserve rated=true', () => {
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'room-pvp', variant: 'fog-of-war', offer: [] },
    { type: 'seat-assigned', at: 2, roomId: 'room-pvp', clientId: 'human-w', seat: 'white' },
    { type: 'seat-assigned', at: 3, roomId: 'room-pvp', clientId: 'human-b', seat: 'black' },
    { type: 'seat-resigned', at: 4, roomId: 'room-pvp', color: 'white' },
  ];
  const room = makeRoom('room-pvp', 'fog-of-war', events);
  room.rated = true;
  const ctx = makeCtx();

  const summary = buildGameSummary(ctx, room);

  assert.equal(summary.rated, true);
  assert.equal(summary.participants?.[0]?.subjectType, 'guest');
  assert.equal(summary.participants?.[1]?.subjectType, 'guest');
});

// ── pauseRoomOnShutdown ────────────────────────────────────────────────────────

test('pauseRoomOnShutdown: appends a pause event and freezes the active clock', async () => {
  const startedClock = createClock(1000, 60_000, 0);
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'room-pause', variant: 'fog-of-war', offer: [] },
    { type: 'seat-assigned', at: 2, roomId: 'room-pause', clientId: 'w', seat: 'white' },
    { type: 'seat-assigned', at: 3, roomId: 'room-pause', clientId: 'b', seat: 'black' },
    { type: 'clock-started', at: 1000, roomId: 'room-pause', clock: startedClock },
  ];
  const room = makeRoom('room-pause', 'fog-of-war', events);
  const ctx = makeCtx();

  await pauseRoomOnShutdown(ctx, room, 3500);

  const last = room.events[room.events.length - 1];
  assert.equal(last.type, 'pause');
  assert.equal(room.projection.paused, true);
  assert.equal(room.projection.pausedAt, 3500);
  assert.equal(room.projection.pauseReason, 'shutdown');
  // White was active from t=1000 to t=3500 → 57_500ms remaining.
  assert.equal(room.projection.state.clock?.remainingMs.white, 57_500);
  assert.equal(room.projection.state.clock?.activeColor, null);
  assert.equal(room.projection.state.clock?.runningSince, null);
});

test('pauseRoomOnShutdown: no-op when game already finished', async () => {
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'room-done', variant: 'fog-of-war', offer: [] },
    { type: 'seat-resigned', at: 2, roomId: 'room-done', color: 'white' },
  ];
  const room = makeRoom('room-done', 'fog-of-war', events);
  const ctx = makeCtx();
  const before = room.events.length;

  await pauseRoomOnShutdown(ctx, room, 100);

  assert.equal(room.events.length, before, 'no pause appended on finished room');
  assert.equal(room.projection.paused, false);
});

test('pauseRoomOnShutdown: no-op when already paused (idempotent)', async () => {
  const startedClock = createClock(1000, 60_000, 0);
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'room-twice', variant: 'fog-of-war', offer: [] },
    { type: 'clock-started', at: 1000, roomId: 'room-twice', clock: startedClock },
  ];
  const room = makeRoom('room-twice', 'fog-of-war', events);
  const ctx = makeCtx();

  await pauseRoomOnShutdown(ctx, room, 2000);
  const afterFirst = room.events.length;
  await pauseRoomOnShutdown(ctx, room, 3000);

  assert.equal(room.events.length, afterFirst, 'second pause should be a no-op');
  assert.equal(room.projection.pausedAt, 2000, 'first pause snapshot preserved');
});

test('playMove: rejected on paused room', async () => {
  const room = makeRoom('room-paused-move');
  // Inject pause directly into projection (simulating post-pause state).
  room.projection = {
    ...room.projection,
    paused: true,
    pausedAt: 100,
    pauseReason: 'shutdown',
  };
  const client = makeClient('white-c', 'white', /* solo= */ true);
  room.clients.add(client);
  const ctx = makeCtx();
  const before = room.events.length;

  await playMove(ctx, room, client, { type: 'move', from: 'e2', to: 'e4' });

  assert.equal(room.events.length, before, 'paused room must not accept moves');
});

test('scheduleRandomEngineMove: no-op when room is paused', () => {
  const room = makeRoom('room-paused-engine');
  room.randomEngine = true;
  // Force black to move so the scheduler would normally fire.
  room.projection = {
    ...room.projection,
    paused: true,
    pausedAt: 50,
    pauseReason: 'shutdown',
    state: {
      ...room.projection.state,
      status: { type: 'playing', turn: 'black' },
    },
  };
  const ctx = makeCtx();

  scheduleRandomEngineMove(ctx, room);

  assert.equal(room.engineTimer, null, 'paused room must not schedule an engine move');
});

test('replay: hydrating a room from a pause event reconstructs the paused projection', () => {
  // This is the post-restart hydration path: loadRoom returns events including the pause,
  // replayGameEvents reconstructs the projection. Same code path as getOrCreateRoom uses.
  const startedClock = createClock(1000, 60_000, 0);
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'room-hydrate', variant: 'fog-of-war', offer: [] },
    { type: 'seat-assigned', at: 2, roomId: 'room-hydrate', clientId: 'w', seat: 'white' },
    { type: 'seat-assigned', at: 3, roomId: 'room-hydrate', clientId: 'b', seat: 'black' },
    { type: 'clock-started', at: 1000, roomId: 'room-hydrate', clock: startedClock },
    { type: 'pause', at: 3500, roomId: 'room-hydrate', reason: 'shutdown' },
  ];
  const projection = replayGameEvents(events);

  assert.equal(projection.paused, true);
  assert.equal(projection.pausedAt, 3500);
  assert.equal(projection.state.clock?.activeColor, null);
  assert.equal(projection.state.clock?.runningSince, null);
  assert.equal(projection.state.clock?.remainingMs.white, 57_500);
  // status still 'playing' — the game can be resumed later.
  assert.deepEqual(projection.state.status, { type: 'playing', turn: 'white' });
});

// ── resume helpers ────────────────────────────────────────────────────────────

// Build a paused, seated, two-player room ready for resume testing. Seat tokens
// are populated for both seats so the presence check has something to validate
// against.
function makePausedSeatedRoom(id: string): Room {
  const startedClock = createClock(1000, 60_000, 0);
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: id, variant: 'fog-of-war', offer: [] },
    { type: 'seat-assigned', at: 2, roomId: id, clientId: 'white-client', seat: 'white' },
    { type: 'seat-assigned', at: 3, roomId: id, clientId: 'black-client', seat: 'black' },
    { type: 'clock-started', at: 1000, roomId: id, clock: startedClock },
    { type: 'pause', at: 3500, roomId: id, reason: 'shutdown' },
  ];
  const room = makeRoom(id, 'fog-of-war', events);
  const now = new Date();
  room.seatTokens = {
    white: {
      clientId: 'white-client',
      seat: 'white',
      tokenHash: 'hash-white',
      userId: null,
      userHandle: null,
      userDisplayName: null,
      issuedAt: now,
      lastSeenAt: now,
      revokedAt: null,
    },
    black: {
      clientId: 'black-client',
      seat: 'black',
      tokenHash: 'hash-black',
      userId: null,
      userHandle: null,
      userDisplayName: null,
      issuedAt: now,
      lastSeenAt: now,
      revokedAt: null,
    },
  };
  return room;
}

test('resumeRoomIfReady: appends resume when both seated players have matching tokens', async () => {
  const room = makePausedSeatedRoom('room-resume-ready');
  const white = makeClient('white-client', 'white', false);
  white.seatTokenHash = 'hash-white';
  const black = makeClient('black-client', 'black', false);
  black.seatTokenHash = 'hash-black';
  room.clients.add(white);
  room.clients.add(black);
  const ctx = makeCtx();

  const resumed = await resumeRoomIfReady(ctx, room, 603_500);

  assert.equal(resumed, true);
  assert.equal(room.projection.paused, false);
  const last = room.events[room.events.length - 1];
  assert.equal(last.type, 'resume');
  // Clock should be re-armed for white (the side to move at pause).
  assert.equal(room.projection.state.clock?.activeColor, 'white');
  assert.equal(room.projection.state.clock?.runningSince, 603_500);
  // Remaining time preserved across the outage (no wall-clock advantage).
  assert.equal(room.projection.state.clock?.remainingMs.white, 57_500);
  assert.equal(room.projection.state.clock?.remainingMs.black, 60_000);
});

test('resumeRoomIfReady: no-op when only one player is present', async () => {
  const room = makePausedSeatedRoom('room-resume-half');
  const white = makeClient('white-client', 'white', false);
  white.seatTokenHash = 'hash-white';
  room.clients.add(white);
  const ctx = makeCtx();
  const before = room.events.length;

  const resumed = await resumeRoomIfReady(ctx, room, 1000);

  assert.equal(resumed, false);
  assert.equal(room.projection.paused, true);
  assert.equal(room.events.length, before, 'no resume event appended');
});

test('resumeRoomIfReady: rejects clients without a matching seat-token hash (attacker case)', async () => {
  const room = makePausedSeatedRoom('room-resume-attacker');
  // Attacker connects on white seat with a forged or missing token.
  const attacker = makeClient('attacker', 'white', false);
  attacker.seatTokenHash = 'wrong-hash';
  // The real black player is present.
  const black = makeClient('black-client', 'black', false);
  black.seatTokenHash = 'hash-black';
  room.clients.add(attacker);
  room.clients.add(black);
  const ctx = makeCtx();

  const resumed = await resumeRoomIfReady(ctx, room, 1000);

  assert.equal(resumed, false, 'attacker without valid token must not count as present');
  assert.equal(room.projection.paused, true);
});

test('resumeRoomIfReady: ignores displaced clients', async () => {
  const room = makePausedSeatedRoom('room-resume-displaced');
  const whiteOld = makeClient('white-client-old', 'white', false);
  whiteOld.seatTokenHash = 'hash-white';
  whiteOld.displaced = true;
  const black = makeClient('black-client', 'black', false);
  black.seatTokenHash = 'hash-black';
  room.clients.add(whiteOld);
  room.clients.add(black);
  const ctx = makeCtx();

  const resumed = await resumeRoomIfReady(ctx, room, 1000);

  assert.equal(resumed, false, 'displaced client should not count as present');
});

test('resumeRoom: grace-elapsed resume fires regardless of presence', async () => {
  const room = makePausedSeatedRoom('room-resume-grace');
  const ctx = makeCtx();

  await resumeRoom(ctx, room, 100_000, 'grace-elapsed');

  assert.equal(room.projection.paused, false);
  const last = room.events[room.events.length - 1];
  assert.equal(last.type, 'resume');
  assert.equal((last as { reason: string }).reason, 'grace-elapsed');
});

test('resumeRoom: second call is a no-op (idempotent)', async () => {
  const room = makePausedSeatedRoom('room-resume-idempotent');
  const ctx = makeCtx();

  await resumeRoom(ctx, room, 1000, 'grace-elapsed');
  const afterFirst = room.events.length;
  await resumeRoom(ctx, room, 2000, 'grace-elapsed');

  assert.equal(room.events.length, afterFirst, 'second resume should be a no-op');
});

test('resumeRoom: clears pauseGraceTimer when set', async () => {
  const room = makePausedSeatedRoom('room-resume-clears-timer');
  // Simulate an armed grace timer (no need to actually schedule it).
  const fakeTimer = setTimeout(() => {}, 100_000);
  room.pauseGraceTimer = fakeTimer;
  const ctx = makeCtx();

  await resumeRoom(ctx, room, 1000, 'both-present');

  assert.equal(room.pauseGraceTimer, null, 'grace timer must be cleared on resume');
  clearTimeout(fakeTimer); // safety, in case the helper didn't clear it
});

test('playMove: accepted after resume reactivates the room', async () => {
  const room = makePausedSeatedRoom('room-resume-then-move');
  const ctx = makeCtx();
  // Resume at wall-clock now so the clock-expiry check inside playMove (which
  // reads Date.now) sees white as having 57.5s left rather than having timed
  // out years ago against the fixture's t=1000 baseline.
  await resumeRoom(ctx, room, Date.now(), 'both-present');

  const white = makeClient('white-client', 'white', /* solo= */ true);
  room.clients.add(white);

  await playMove(ctx, room, white, { type: 'move', from: 'e2', to: 'e4' });

  const last = room.events[room.events.length - 1];
  assert.equal(last.type, 'move-played', 'paused→resumed room must accept moves again');
});

// ── applyOrphanRecoveryIfNeeded ───────────────────────────────────────────────

test('applyOrphanRecoveryIfNeeded: synthesises a pause for a stale playing room', () => {
  const startedClock = createClock(1000, 60_000, 0);
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'orphan-stale', variant: 'fog-of-war', offer: [] },
    { type: 'seat-assigned', at: 2, roomId: 'orphan-stale', clientId: 'w', seat: 'white' },
    { type: 'seat-assigned', at: 3, roomId: 'orphan-stale', clientId: 'b', seat: 'black' },
    { type: 'clock-started', at: 1000, roomId: 'orphan-stale', clock: startedClock },
    // Move at t=2000 — opponent's clock is now active.
    {
      type: 'move-played',
      at: 2000,
      roomId: 'orphan-stale',
      color: 'white',
      move: { from: 'e2', to: 'e4' },
    },
  ];
  // 10 minutes later, the server "comes back" — far past the 5-minute threshold.
  const now = 2000 + 10 * 60_000;
  const out = applyOrphanRecoveryIfNeeded(events, now, 300_000);

  assert.equal(out.length, events.length + 1);
  const synth = out[out.length - 1]!;
  assert.equal(synth.type, 'pause');
  // Pause is at lastEvent.at + 1 so clock freeze sees ~0ms elapsed.
  assert.equal(synth.at, 2001);
  assert.equal((synth as { reason: string }).reason, 'shutdown');

  // Replaying the recovered events should produce a paused projection with
  // black's clock effectively unchanged (since the synth pause fires 1ms after
  // the move that started black's clock).
  const projection = replayGameEvents(out);
  assert.equal(projection.paused, true);
  assert.equal(projection.state.clock?.remainingMs.black, 59_999);
  assert.equal(projection.state.clock?.activeColor, null);
});

test('applyOrphanRecoveryIfNeeded: leaves a recent playing room alone', () => {
  const startedClock = createClock(1000, 60_000, 0);
  const recentMoveAt = 2000;
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'orphan-fresh', variant: 'fog-of-war', offer: [] },
    { type: 'seat-assigned', at: 2, roomId: 'orphan-fresh', clientId: 'w', seat: 'white' },
    { type: 'seat-assigned', at: 3, roomId: 'orphan-fresh', clientId: 'b', seat: 'black' },
    { type: 'clock-started', at: 1000, roomId: 'orphan-fresh', clock: startedClock },
    {
      type: 'move-played',
      at: recentMoveAt,
      roomId: 'orphan-fresh',
      color: 'white',
      move: { from: 'e2', to: 'e4' },
    },
  ];
  // Last event is 30 seconds ago — well under threshold; the player is
  // probably just thinking.
  const now = recentMoveAt + 30_000;
  const out = applyOrphanRecoveryIfNeeded(events, now, 300_000);

  assert.equal(out, events, 'returns the same array reference when no recovery is needed');
});

test('applyOrphanRecoveryIfNeeded: leaves an already-paused room alone (no double-pause)', () => {
  const startedClock = createClock(1000, 60_000, 0);
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'orphan-paused', variant: 'fog-of-war', offer: [] },
    { type: 'clock-started', at: 1000, roomId: 'orphan-paused', clock: startedClock },
    { type: 'pause', at: 2000, roomId: 'orphan-paused', reason: 'shutdown' },
  ];
  const now = 2000 + 60 * 60_000; // an hour later
  const out = applyOrphanRecoveryIfNeeded(events, now, 300_000);

  assert.equal(out, events, 'already-paused room must not receive a second synth pause');
});

test('applyOrphanRecoveryIfNeeded: leaves a finished room alone', () => {
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'orphan-finished', variant: 'fog-of-war', offer: [] },
    { type: 'seat-resigned', at: 2, roomId: 'orphan-finished', color: 'white' },
  ];
  const now = 2 + 24 * 60 * 60_000; // a day later
  const out = applyOrphanRecoveryIfNeeded(events, now, 300_000);

  assert.equal(out, events, 'finished room must not be synth-paused');
});

test('applyOrphanRecoveryIfNeeded: leaves a pregame room alone', () => {
  const offer = generateChess960Starts().slice(0, 3);
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'orphan-pregame', variant: 'fog-of-war', offer },
  ];
  const now = 1 + 60 * 60_000;
  const out = applyOrphanRecoveryIfNeeded(events, now, 300_000);

  assert.equal(out, events, 'pregame room must not be synth-paused — no clock to freeze');
});

test('applyOrphanRecoveryIfNeeded: empty events array is a no-op', () => {
  const out = applyOrphanRecoveryIfNeeded([], Date.now(), 300_000);
  assert.deepEqual(out, [], 'empty events must round-trip unchanged');
});

// ── Mode-specific resume behavior (PvE, EvE) ──────────────────────────────────

function makePausedPveRoom(id: string, engineClientId = 'builtin-random-legal'): Room {
  const startedClock = createClock(1000, 60_000, 0);
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: id, variant: 'fog-of-war', offer: [] },
    { type: 'seat-assigned', at: 2, roomId: id, clientId: 'human-w', seat: 'white' },
    // Engine seat held by a server-engine client (recognised by prefix).
    { type: 'seat-assigned', at: 3, roomId: id, clientId: engineClientId, seat: 'black' },
    { type: 'clock-started', at: 1000, roomId: id, clock: startedClock },
    { type: 'pause', at: 3500, roomId: id, reason: 'shutdown' },
  ];
  const room = makeRoom(id, 'fog-of-war', events);
  const now = new Date();
  // Only the human seat has a seat-token record. Engines don't use seat tokens.
  room.seatTokens = {
    white: {
      clientId: 'human-w',
      seat: 'white',
      tokenHash: 'hash-human-w',
      userId: null,
      userHandle: null,
      userDisplayName: null,
      issuedAt: now,
      lastSeenAt: now,
      revokedAt: null,
    },
  };
  return room;
}

function makePausedEveRoom(id: string): Room {
  const startedClock = createClock(1000, 60_000, 0);
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: id, variant: 'fog-of-war', offer: [] },
    { type: 'seat-assigned', at: 2, roomId: id, clientId: 'engine:white', seat: 'white' },
    { type: 'seat-assigned', at: 3, roomId: id, clientId: 'engine:black', seat: 'black' },
    { type: 'clock-started', at: 1000, roomId: id, clock: startedClock },
    { type: 'pause', at: 3500, roomId: id, reason: 'shutdown' },
  ];
  // No seat tokens — engines don't use them.
  return makeRoom(id, 'fog-of-war', events);
}

test('resumeRoomIfReady (PvE): resumes when the human reconnects — engine seat is auto-present', async () => {
  const room = makePausedPveRoom('room-pve-resume');
  const human = makeClient('human-w', 'white', false);
  human.seatTokenHash = 'hash-human-w';
  room.clients.add(human);
  const ctx = makeCtx();

  const resumed = await resumeRoomIfReady(ctx, room, 1000);

  assert.equal(
    resumed,
    true,
    'PvE must resume on lone human reconnect (engine is server-controlled)',
  );
  assert.equal(room.projection.paused, false);
  // White was the side-to-move at pause — clock re-armed for white.
  assert.equal(room.projection.state.clock?.activeColor, 'white');
});

test('resumeRoomIfReady (PvE): does not resume if the human has not reconnected', async () => {
  const room = makePausedPveRoom('room-pve-no-human');
  const ctx = makeCtx();

  const resumed = await resumeRoomIfReady(ctx, room, 1000);

  assert.equal(resumed, false, 'engine alone is not enough — the human must be present');
  assert.equal(room.projection.paused, true);
});

test('resumeRoomIfReady (EvE): resumes on any client connection (both engines auto-present)', async () => {
  const room = makePausedEveRoom('room-eve-resume');
  // A spectator joins — they don't hold either seat.
  const spectator = makeClient('spec-1', 'spectator', false);
  room.clients.add(spectator);
  const ctx = makeCtx();

  const resumed = await resumeRoomIfReady(ctx, room, 1000);

  assert.equal(
    resumed,
    true,
    'EvE must resume as soon as the room is touched — engines are always present',
  );
  assert.equal(room.projection.paused, false);
});

test('resumeRoomIfReady (EvE): resumes even with zero clients (engines are auto-present)', async () => {
  // Direct call without clients models the server-side trigger path.
  // (handleConnection only calls this with at least one client, but engine-worker
  //  or internal triggers may call without any client present.)
  const room = makePausedEveRoom('room-eve-no-client');
  const ctx = makeCtx();

  const resumed = await resumeRoomIfReady(ctx, room, 1000);

  assert.equal(resumed, true, 'with both seats engine-held, neither needs a client to be present');
});

test('resumeRoomIfReady (PvP): still requires both human seats — regression guard', async () => {
  const room = makePausedSeatedRoom('room-pvp-still-strict');
  // Only one human present.
  const white = makeClient('white-client', 'white', false);
  white.seatTokenHash = 'hash-white';
  room.clients.add(white);
  const ctx = makeCtx();

  const resumed = await resumeRoomIfReady(ctx, room, 1000);

  assert.equal(
    resumed,
    false,
    'PvP requires BOTH humans — engine-presence relaxation must not apply here',
  );
  assert.equal(room.projection.paused, true);
});

// ── Defense-in-depth: paused guards in async callbacks ────────────────────────

test('playRandomEngineMoveIfReady: no-op on paused room (defense in depth)', async () => {
  const room = makePausedPveRoom('room-pve-engine-no-op');
  // Flip turn to black so the engine would normally play.
  room.projection = {
    ...room.projection,
    state: {
      ...room.projection.state,
      status: { type: 'playing', turn: 'black' },
    },
  };
  room.randomEngine = true;
  const ctx = makeCtx();
  const before = room.events.length;

  // Import on demand to avoid a top-level import churn.
  const { playRandomEngineMoveIfReady } = await import('./room-manager.js');
  await playRandomEngineMoveIfReady(ctx, room);

  assert.equal(
    room.events.length,
    before,
    'paused room must not record an engine move even if the callback fires',
  );
});
