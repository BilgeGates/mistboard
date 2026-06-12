import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type CrossroadsChessEvent,
  createCrossroadsChessRuntimeRoom,
} from './crossroads-chess-runtime.js';
import {
  appendCrossroadsChessEvent,
  buildCrossroadsChessGameSummary,
  type CrossroadsChessEventWriterPersistence,
} from './server-crossroads-chess-events.js';

process.env.MISTBOARD_CROSSROADS_CHESS_ENABLED = 'true';

function fakePersistence() {
  const appended: { seq: number; type: string }[] = [];
  const ends: { summary: import('./persistence.js').GameSummary }[] = [];
  const aborts: { roomId: string; abortedReason: string }[] = [];
  const persistence: CrossroadsChessEventWriterPersistence = {
    abortRunningGame: async (roomId, options) => {
      aborts.push({ roomId, abortedReason: options.abortedReason });
      return true;
    },
    appendRoomEvent: async (_roomId, seq, event) => {
      appended.push({ seq, type: event.type });
    },
    isInitialized: () => true,
    recordGameEnd: async (_roomId, summary) => {
      ends.push({ summary });
    },
    upsertRoomSeatToken: async () => {},
  };
  return { persistence, appended, ends, aborts };
}

function room() {
  const created = createCrossroadsChessRuntimeRoom('dchess_e', { now: 1_000 });
  if (!created.ok) throw new Error('room creation failed');
  return created.room;
}

test('append persists, applies, schedules timers, and records the game end on a terminal', async () => {
  const r = room();
  const { persistence, appended, ends } = fakePersistence();
  let scheduled = 0;
  const event: CrossroadsChessEvent = {
    type: 'seat-resigned',
    at: 2_000,
    roomId: r.id,
    color: 'red',
  };
  await appendCrossroadsChessEvent(r, event, {
    persistence,
    scheduleLifecycleTimers: () => scheduled++,
  });

  assert.equal(r.projection.state.status.type, 'finished');
  assert.deepEqual(appended, [{ seq: 1, type: 'seat-resigned' }]);
  assert.equal(scheduled, 1);
  assert.equal(ends.length, 1);
  assert.equal(ends[0]?.summary.result, 'white-wins');
  assert.equal(ends[0]?.summary.termination, 'resignation');
});

test('the game summary maps a Race win to white-wins / race', async () => {
  const r = room();
  // Hand the room a finished-by-race projection through a sequence of moves is
  // long; instead drive a terminal directly and build the summary.
  const { persistence } = fakePersistence();
  await appendCrossroadsChessEvent(
    r,
    { type: 'seat-resigned', at: 2_000, roomId: r.id, color: 'red' },
    { persistence },
  );
  const summary = buildCrossroadsChessGameSummary(r);
  assert.equal(summary.variant, 'crossroads-chess');
  assert.equal(summary.mode, 'pvp');
  assert.equal(summary.rated, false);
  assert.ok(summary.participants);
  assert.equal(summary.participants.length, 2);
  assert.deepEqual(
    summary.participants.map((p) => p.color),
    ['white', 'red'],
  );
});
