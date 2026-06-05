import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendDualChessRuntimeEvent,
  createDualChessRuntimeRoom,
  isDualChessEventLog,
  isDualChessRoomId,
  replayDualChessEvents,
} from './dual-chess-runtime.js';

// The flag is read at call time, so setting it here (before any test runs) is
// enough to let the runtime build a room.
process.env.MISTBOARD_DUAL_CHESS_ENABLED = 'true';

const TC = { initialMs: 180_000, incrementMs: 2_000 };

function freshRoom() {
  const created = createDualChessRuntimeRoom('dchess_test', { now: 1_000, timeControl: TC });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error('unreachable');
  return created.room;
}

test('room ids carry the dual-chess prefix', () => {
  assert.equal(isDualChessRoomId('dchess_abc'), true);
  assert.equal(isDualChessRoomId('dmxq_abc'), false);
});

test('a fresh room starts with White to move and a seeded clock', () => {
  const room = freshRoom();
  assert.equal(room.projection.state.status.type, 'playing');
  assert.equal(
    room.projection.state.status.type === 'playing' && room.projection.state.status.turn,
    'white',
  );
  assert.equal(room.projection.clock?.activeColor, null);
  assert.equal(room.projection.clock?.remainingMs.white, 180_000);
});

test('moves advance the projection and the clock arms after Red’s first move', () => {
  const room = freshRoom();
  appendDualChessRuntimeEvent(room, {
    type: 'move-played',
    at: 2_000,
    roomId: room.id,
    color: 'white',
    move: { from: 'd2', to: 'd4' },
  });
  // After White's first move: still unarmed, Red to move.
  assert.equal(room.projection.clock?.runningSince, null);
  assert.equal(
    room.projection.state.status.type === 'playing' && room.projection.state.status.turn,
    'red',
  );

  appendDualChessRuntimeEvent(room, {
    type: 'move-played',
    at: 3_000,
    roomId: room.id,
    color: 'red',
    move: { from: 'c7', to: 'c5' },
  });
  // Both sides have moved once → clock arms on White.
  assert.equal(room.projection.clock?.activeColor, 'white');
  assert.equal(room.projection.clock?.runningSince, 3_000);
  assert.equal(room.projection.state.moveNumber, 2);
});

test('replaying the event log reproduces the live projection exactly', () => {
  const room = freshRoom();
  for (const [color, from, to] of [
    ['white', 'd2', 'd4'],
    ['red', 'c7', 'c5'],
    ['white', 'd1', 'c3'],
  ] as const) {
    appendDualChessRuntimeEvent(room, {
      type: 'move-played',
      at: 4_000,
      roomId: room.id,
      color,
      move: { from, to },
    });
  }
  assert.deepEqual(replayDualChessEvents(room.events), room.projection);
});

test('a clock expiry finishes the game as a timeout for the other side', () => {
  const room = freshRoom();
  appendDualChessRuntimeEvent(room, {
    type: 'clock-expired',
    at: 9_000,
    roomId: room.id,
    color: 'white',
    clock: room.projection.clock!,
  });
  assert.equal(room.projection.state.status.type, 'finished');
  assert.equal(
    room.projection.state.status.type === 'finished' && room.projection.state.status.reason,
    'timeout',
  );
  assert.equal(
    room.projection.state.status.type === 'finished' && room.projection.state.status.winner,
    'red',
  );
});

test('resignation finishes the game for the opponent', () => {
  const room = freshRoom();
  appendDualChessRuntimeEvent(room, {
    type: 'seat-resigned',
    at: 5_000,
    roomId: room.id,
    color: 'red',
  });
  assert.equal(
    room.projection.state.status.type === 'finished' && room.projection.state.status.reason,
    'resignation',
  );
  assert.equal(
    room.projection.state.status.type === 'finished' && room.projection.state.status.winner,
    'white',
  );
});

test('the event-log validator accepts a real log and rejects junk', () => {
  const room = freshRoom();
  assert.equal(isDualChessEventLog(room.events), true);
  assert.equal(isDualChessEventLog([]), false);
  assert.equal(isDualChessEventLog([{ type: 'move-played', roomId: 'dchess_test', at: 1 }]), false);
});
