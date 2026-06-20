import assert from 'node:assert/strict';
import test from 'node:test';
import { bughouseLegalActions, validateBughousePartnerRequest } from '@mistboard/game';
import {
  appendBughouseRuntimeEvent,
  buildBughouseRuntimePartnerRequest,
  createBughouseRuntimeRoom,
  createBughouseRuntimeRoomFromEvents,
  expireBughouseRuntimeClock,
  maybeStartBughouseRuntimeClock,
  nextBughouseClockDeadline,
  playBughouseRuntimeAction,
} from './bughouse-runtime.js';

const TIME_CONTROL = { initialMs: 60_000, incrementMs: 2_000 };

test('bughouse runtime creates a private timed room with two active board clocks', () => {
  const room = createBughouseRuntimeRoom('bugh_runtime_create', {
    now: 1_000,
    timeControl: TIME_CONTROL,
  });

  assert.equal(room.kind, 'bughouse');
  assert.deepEqual(
    room.events.map((event) => event.type),
    ['match-created', 'clock-started'],
  );
  assert.equal(room.match.clock?.boards.A.activeSeat, 'A:white');
  assert.equal(room.match.clock?.boards.B.activeSeat, 'B:white');

  const deadline = nextBughouseClockDeadline(room.match, 1_500);

  assert.deepEqual(deadline, {
    board: 'A',
    seat: 'A:white',
    remainingMs: 59_500,
    deadlineAt: 61_000,
  });
});

test('bughouse runtime can defer clock start until all four seats are assigned', () => {
  const room = createBughouseRuntimeRoom('bugh_runtime_deferred_clock', {
    now: 1_000,
    timeControl: TIME_CONTROL,
    deferClockStart: true,
  });

  assert.equal(room.match.clock?.boards.A.activeSeat ?? null, null);
  assert.deepEqual(maybeStartBughouseRuntimeClock(room, 1_500), { started: false });

  for (const [index, seat] of (['A:white', 'A:black', 'B:white', 'B:black'] as const).entries()) {
    appendBughouseRuntimeEvent(room, {
      type: 'seat-assigned',
      at: 2_000 + index,
      matchId: room.id,
      clientId: `c${index + 1}`,
      seat,
    });
  }
  const started = maybeStartBughouseRuntimeClock(room, 2_500);

  assert.ok(started.started);
  assert.equal(started.eventIndex, 5);
  const clock = room.match.clock;
  assert.ok(clock);
  assert.equal(clock.boards.A.activeSeat, 'A:white');
  assert.equal(clock.boards.B.activeSeat, 'B:white');
  assert.equal(clock.boards.A.runningSince, 2_500);
  assert.equal(room.events.at(-1)?.type, 'clock-started');

  const hydrated = createBughouseRuntimeRoomFromEvents(room.events, {
    timeControl: TIME_CONTROL,
  });

  assert.deepEqual(hydrated.seats, room.seats);
  assert.deepEqual(hydrated.match, room.match);
});

test('bughouse runtime plays a legal action and builds a partner-bot request', () => {
  const room = createBughouseRuntimeRoom('bugh_runtime_play', {
    now: 1_000,
    timeControl: TIME_CONTROL,
  });
  const action = bughouseLegalActions(room.match, 'A:white').find(
    (candidate) =>
      candidate.kind === 'move' && candidate.move.from === 'e2' && candidate.move.to === 'e4',
  );
  assert.ok(action);

  const played = playBughouseRuntimeAction(room, 'A:white', action.id, 2_500);
  assert.ok(played.ok);

  assert.equal(played.eventIndex, 2);
  assert.equal(played.event.type, 'board-move');
  assert.equal(room.match.boards.A.state.board.e4?.role, 'pawn');
  assert.equal(room.match.clock?.boards.A.activeSeat, 'A:black');
  assert.equal(room.match.clock?.boards.A.remainingMs.white, 60_500);
  assert.equal(room.match.clock?.boards.B.activeSeat, 'B:white');

  const request = buildBughouseRuntimePartnerRequest(room, {
    seat: 'B:white',
    engineId: 'runtime-partner',
    engineSeed: 42,
    serverNowEpochMs: 2_750,
  });

  assert.deepEqual(validateBughousePartnerRequest(request), { ok: true, value: request });
  assert.equal(request.clocks.boards.A.activeSeat, 'A:black');
  assert.equal(request.clocks.boards.B.activeSeat, 'B:white');
});

test('bughouse runtime expires the active clock and hydrates from events', () => {
  const room = createBughouseRuntimeRoom('bugh_runtime_timeout', {
    now: 1_000,
    timeControl: TIME_CONTROL,
  });

  const expired = expireBughouseRuntimeClock(room, 'A:white', 61_000);
  assert.ok(expired.ok);

  assert.deepEqual(room.match.status, {
    type: 'finished',
    board: 'A',
    winnerTeam: 'team-1',
    reason: 'timeout',
  });
  assert.equal(room.match.clock?.boards.A.activeSeat, null);
  assert.equal(room.match.clock?.boards.B.activeSeat, null);
  assert.equal(nextBughouseClockDeadline(room.match, 61_000), null);

  const hydrated = createBughouseRuntimeRoomFromEvents(room.events, {
    timeControl: TIME_CONTROL,
  });

  assert.deepEqual(hydrated.match, room.match);
  assert.deepEqual(
    hydrated.events.map((event) => event.type),
    ['match-created', 'clock-started', 'clock-expired'],
  );
});
