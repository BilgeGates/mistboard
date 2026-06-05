import assert from 'node:assert/strict';
import test from 'node:test';
import { appendDualChessRuntimeEvent, createDualChessRuntimeRoom } from './dual-chess-runtime.js';
import {
  dualChessAbortPhaseFor,
  dualChessConnectedSeats,
  dualChessForfeitingSeat,
} from './server-dual-chess-lifecycle.js';

process.env.MISTBOARD_DUAL_CHESS_ENABLED = 'true';

function seatedRoom() {
  const created = createDualChessRuntimeRoom('dchess_l', { now: 1_000 });
  if (!created.ok) throw new Error('room creation failed');
  const room = created.room;
  appendDualChessRuntimeEvent(room, {
    type: 'seat-assigned',
    at: 1_000,
    roomId: room.id,
    clientId: 'c1',
    seat: 'white',
  });
  appendDualChessRuntimeEvent(room, {
    type: 'seat-assigned',
    at: 1_000,
    roomId: room.id,
    clientId: 'c2',
    seat: 'red',
  });
  return room;
}

function move(
  room: ReturnType<typeof seatedRoom>,
  color: 'white' | 'red',
  from: string,
  to: string,
  at: number,
) {
  appendDualChessRuntimeEvent(room, {
    type: 'move-played',
    at,
    roomId: room.id,
    color,
    move: { from: from as never, to: to as never },
  });
}

test('abort phase: white-1 pregame, red-1 after White moves, null once both have moved', () => {
  const room = seatedRoom();
  assert.equal(dualChessAbortPhaseFor(room), 'white-1');
  move(room, 'white', 'd2', 'd4', 2_000);
  assert.equal(dualChessAbortPhaseFor(room), 'red-1');
  move(room, 'red', 'c7', 'c5', 3_000);
  assert.equal(dualChessAbortPhaseFor(room), null);
});

test('the forfeiting seat is the disconnected side once the game is live', () => {
  const room = seatedRoom();
  move(room, 'white', 'd2', 'd4', 2_000);
  move(room, 'red', 'c7', 'c5', 3_000);
  room.clients.add({ seat: 'white', displaced: false });
  assert.equal(dualChessForfeitingSeat(room), 'red');
  room.clients.add({ seat: 'red', displaced: false });
  assert.equal(dualChessForfeitingSeat(room), null);
});

test('connectedSeats ignores displaced clients', () => {
  assert.deepEqual(
    dualChessConnectedSeats([
      { seat: 'white', displaced: false },
      { seat: 'red', displaced: true },
    ]),
    { white: true, red: false },
  );
});
