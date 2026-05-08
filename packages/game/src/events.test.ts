import assert from 'node:assert/strict';
import test from 'node:test';
import { pickDraft960Offer } from './chess960.js';
import { advanceClock, createClock, expireClock } from './clocks.js';
import { replayGameEvents, type GameEvent } from './events.js';

test('replays Draft960 pregame events into a resolved starting position', () => {
  const offer = pickDraft960Offer(42);
  const resolvedStart = offer[0];
  const events: GameEvent[] = [
    {
      type: 'room-created',
      at: 1,
      roomId: 'replay-room',
      variant: 'draft960',
      offer,
    },
    {
      type: 'seat-assigned',
      at: 2,
      roomId: 'replay-room',
      clientId: 'white-client',
      seat: 'white',
    },
    {
      type: 'seat-assigned',
      at: 3,
      roomId: 'replay-room',
      clientId: 'black-client',
      seat: 'black',
    },
    {
      type: 'draft-start-selected',
      at: 4,
      roomId: 'replay-room',
      color: 'white',
      startId: resolvedStart.id,
    },
    {
      type: 'draft-start-selected',
      at: 5,
      roomId: 'replay-room',
      color: 'black',
      startId: resolvedStart.id,
    },
    {
      type: 'draft-start-resolved',
      at: 6,
      roomId: 'replay-room',
      startId: resolvedStart.id,
    },
  ];

  const projection = replayGameEvents(events);

  assert.deepEqual(projection.seats, {
    white: 'white-client',
    black: 'black-client',
  });
  assert.deepEqual(projection.selections, {
    white: resolvedStart.id,
    black: resolvedStart.id,
  });
  assert.equal(projection.resolvedStartId, resolvedStart.id);
  assert.deepEqual(projection.state.status, { type: 'playing', turn: 'white' });
  assert.deepEqual(
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((file) => projection.state.board[`${file}1` as keyof typeof projection.state.board]?.role),
    resolvedStart.backRank,
  );
});

test('replays move events through the Draft960 rules adapter', () => {
  const offer = pickDraft960Offer(7);
  const start = offer[0];
  const events: GameEvent[] = [
    {
      type: 'room-created',
      at: 1,
      roomId: 'move-room',
      variant: 'draft960',
      offer,
    },
    {
      type: 'draft-start-selected',
      at: 2,
      roomId: 'move-room',
      color: 'white',
      startId: start.id,
    },
    {
      type: 'draft-start-selected',
      at: 3,
      roomId: 'move-room',
      color: 'black',
      startId: start.id,
    },
    {
      type: 'draft-start-resolved',
      at: 4,
      roomId: 'move-room',
      startId: start.id,
    },
    {
      type: 'move-played',
      at: 5,
      roomId: 'move-room',
      color: 'white',
      move: { from: 'e2', to: 'e4' },
    },
  ];

  const projection = replayGameEvents(events);

  assert.equal(projection.state.board.e2, undefined);
  assert.deepEqual(projection.state.board.e4, { color: 'white', role: 'pawn' });
  assert.deepEqual(projection.state.status, { type: 'playing', turn: 'black' });
  assert.deepEqual(projection.state.lastMove, { from: 'e2', to: 'e4' });
});

test('vacates Fog of War seats before the first move', () => {
  const events: GameEvent[] = [
    {
      type: 'room-created',
      at: 1,
      roomId: 'fresh-fog-room',
      variant: 'fog-of-war',
      offer: [],
    },
    {
      type: 'seat-assigned',
      at: 2,
      roomId: 'fresh-fog-room',
      clientId: 'white-client',
      seat: 'white',
    },
    {
      type: 'seat-vacated',
      at: 3,
      roomId: 'fresh-fog-room',
      clientId: 'white-client',
      seat: 'white',
    },
  ];

  const projection = replayGameEvents(events);

  assert.deepEqual(projection.seats, {});
});

test('keeps Fog of War seats after play starts', () => {
  const events: GameEvent[] = [
    {
      type: 'room-created',
      at: 1,
      roomId: 'active-fog-room',
      variant: 'fog-of-war',
      offer: [],
    },
    {
      type: 'seat-assigned',
      at: 2,
      roomId: 'active-fog-room',
      clientId: 'white-client',
      seat: 'white',
    },
    {
      type: 'move-played',
      at: 3,
      roomId: 'active-fog-room',
      color: 'white',
      move: { from: 'e2', to: 'e4' },
    },
    {
      type: 'seat-vacated',
      at: 4,
      roomId: 'active-fog-room',
      clientId: 'white-client',
      seat: 'white',
    },
  ];

  const projection = replayGameEvents(events);

  assert.deepEqual(projection.seats, { white: 'white-client' });
});

test('replays clock snapshots on start and move events', () => {
  const offer = pickDraft960Offer(8);
  const start = offer[0];
  const startedClock = createClock(4);
  const movedClock = advanceClock(startedClock, 1504, 'white', { type: 'playing', turn: 'black' });
  const events: GameEvent[] = [
    {
      type: 'room-created',
      at: 1,
      roomId: 'clock-room',
      variant: 'draft960',
      offer,
    },
    {
      type: 'draft-start-resolved',
      at: 4,
      roomId: 'clock-room',
      clock: startedClock,
      startId: start.id,
    },
    {
      type: 'move-played',
      at: 1504,
      roomId: 'clock-room',
      color: 'white',
      clock: movedClock,
      move: { from: 'e2', to: 'e4' },
    },
  ];

  const projection = replayGameEvents(events);

  assert.equal(projection.state.clock?.activeColor, 'black');
  assert.equal(projection.state.clock?.remainingMs.white, 298500);
  assert.equal(projection.state.clock?.remainingMs.black, 300000);
  assert.equal(projection.state.clock?.runningSince, 1504);
});

test('replays timeout events into a finished game', () => {
  const offer = pickDraft960Offer(9);
  const start = offer[0];
  const startedClock = createClock(4, 1000, 0);
  const expiredClock = expireClock(startedClock, 1004, 'white');
  assert.ok(expiredClock);
  const events: GameEvent[] = [
    {
      type: 'room-created',
      at: 1,
      roomId: 'timeout-room',
      variant: 'draft960',
      offer,
    },
    {
      type: 'draft-start-resolved',
      at: 4,
      roomId: 'timeout-room',
      clock: startedClock,
      startId: start.id,
    },
    {
      type: 'clock-expired',
      at: 1004,
      roomId: 'timeout-room',
      clock: expiredClock,
      color: 'white',
    },
  ];

  const projection = replayGameEvents(events);

  assert.deepEqual(projection.state.status, { type: 'finished', winner: 'black', reason: 'timeout' });
  assert.equal(projection.state.clock?.activeColor, null);
  assert.equal(projection.state.clock?.remainingMs.white, 0);
});

test('replays Bid For White bids into resolved seats and adjusted clock', () => {
  const events: GameEvent[] = [
    {
      type: 'room-created',
      at: 1,
      roomId: 'bid-room',
      variant: 'bid-for-white',
      offer: [],
    },
    {
      type: 'seat-assigned',
      at: 2,
      roomId: 'bid-room',
      clientId: 'first-client',
      seat: 'white',
    },
    {
      type: 'seat-assigned',
      at: 3,
      roomId: 'bid-room',
      clientId: 'second-client',
      seat: 'black',
    },
    {
      type: 'bid-submitted',
      at: 4,
      roomId: 'bid-room',
      color: 'white',
      bidMs: 15_000,
    },
    {
      type: 'bid-submitted',
      at: 5,
      roomId: 'bid-room',
      color: 'black',
      bidMs: 25_000,
    },
    {
      type: 'bid-resolved',
      at: 6,
      roomId: 'bid-room',
      bids: { white: 15_000, black: 25_000 },
      blackSeat: 'white',
      winner: 'black',
      whiteSeat: 'black',
      winningBidMs: 25_000,
    },
  ];

  const projection = replayGameEvents(events);

  assert.equal(projection.variant, 'bid-for-white');
  assert.deepEqual(projection.seats, {
    white: 'second-client',
    black: 'first-client',
  });
  assert.deepEqual(projection.bids, { white: 15_000, black: 25_000 });
  assert.deepEqual(projection.bidResolution, {
    bids: { white: 15_000, black: 25_000 },
    blackSeat: 'white',
    winner: 'black',
    whiteSeat: 'black',
    winningBidMs: 25_000,
  });
  assert.deepEqual(projection.state.status, { type: 'playing', turn: 'white' });
  assert.equal(projection.state.variant, 'bid-for-white');
  assert.equal(projection.state.clock?.remainingMs.white, 275_000);
  assert.equal(projection.state.clock?.remainingMs.black, 300_000);
});

test('replays Fog of War room and move events through the Fog rules adapter', () => {
  const events: GameEvent[] = [
    {
      type: 'room-created',
      at: 1,
      roomId: 'fog-event-room',
      variant: 'fog-of-war',
      offer: [],
    },
    {
      type: 'move-played',
      at: 2,
      roomId: 'fog-event-room',
      color: 'white',
      move: { from: 'e2', to: 'e4' },
    },
  ];

  const projection = replayGameEvents(events);

  assert.equal(projection.variant, 'fog-of-war');
  assert.deepEqual(projection.state.board.e4, { color: 'white', role: 'pawn' });
  assert.deepEqual(projection.state.status, { type: 'playing', turn: 'black' });
});

test('replays bounded event slices for timeline traversal', () => {
  const offer = pickDraft960Offer(99);
  const start = offer[0];
  const events: GameEvent[] = [
    {
      type: 'room-created',
      at: 1,
      roomId: 'timeline-room',
      variant: 'draft960',
      offer,
    },
    {
      type: 'draft-start-selected',
      at: 2,
      roomId: 'timeline-room',
      color: 'white',
      startId: start.id,
    },
    {
      type: 'draft-start-selected',
      at: 3,
      roomId: 'timeline-room',
      color: 'black',
      startId: start.id,
    },
    {
      type: 'draft-start-resolved',
      at: 4,
      roomId: 'timeline-room',
      startId: start.id,
    },
    {
      type: 'move-played',
      at: 5,
      roomId: 'timeline-room',
      color: 'white',
      move: { from: 'e2', to: 'e4' },
    },
    {
      type: 'move-played',
      at: 6,
      roomId: 'timeline-room',
      color: 'black',
      move: { from: 'e7', to: 'e5' },
    },
  ];

  const created = replayGameEvents(events.slice(0, 1));
  assert.equal(created.offer.length, 3);
  assert.deepEqual(created.state.status, { type: 'pregame' });

  const selected = replayGameEvents(events.slice(0, 3));
  assert.deepEqual(selected.selections, { white: start.id, black: start.id });
  assert.equal(selected.resolvedStartId, null);

  const resolved = replayGameEvents(events.slice(0, 4));
  assert.equal(resolved.resolvedStartId, start.id);
  assert.deepEqual(resolved.state.status, { type: 'playing', turn: 'white' });

  const afterWhiteMove = replayGameEvents(events.slice(0, 5));
  assert.deepEqual(afterWhiteMove.state.status, { type: 'playing', turn: 'black' });
  assert.deepEqual(afterWhiteMove.state.lastMove, { from: 'e2', to: 'e4' });

  const afterBlackMove = replayGameEvents(events);
  assert.deepEqual(afterBlackMove.state.status, { type: 'playing', turn: 'white' });
  assert.deepEqual(afterBlackMove.state.lastMove, { from: 'e7', to: 'e5' });
});
