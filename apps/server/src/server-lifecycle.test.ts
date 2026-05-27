import assert from 'node:assert/strict';
import test from 'node:test';
import type { WebSocket } from 'ws';
import { clearRoomRuntimeTimers, closeRoomClients, waitForRoomWrites } from './server-lifecycle.js';
import { clientFixture, roomFixture } from './test-builders.js';

test('clearRoomRuntimeTimers clears pending vacates and releases live engine reservations', async () => {
  let clockFired = false;
  let engineFired = false;
  let pendingVacateFired = false;
  const released: Array<{ reservationId: string; reason: string }> = [];
  const room = roomFixture({
    clockTimer: setTimeout(() => {
      clockFired = true;
    }, 5),
    engineReservationId: 'reservation-1',
    engineTimer: setTimeout(() => {
      engineFired = true;
    }, 5),
    pendingVacates: {
      white: setTimeout(() => {
        pendingVacateFired = true;
      }, 5),
    },
  });

  clearRoomRuntimeTimers(room, {
    clearPendingVacates: true,
    releaseEngineReservation: (reservationId, reason) => {
      released.push({ reservationId, reason });
    },
    reservationReleaseReason: 'test-cleanup',
  });

  await new Promise((resolve) => setTimeout(resolve, 15));

  assert.equal(clockFired, false);
  assert.equal(engineFired, false);
  assert.equal(pendingVacateFired, false);
  assert.equal(room.engineReservationId, null);
  assert.deepEqual(released, [{ reservationId: 'reservation-1', reason: 'test-cleanup' }]);
});

test('closeRoomClients closes every connected room client', () => {
  const closed: string[] = [];
  const white = clientFixture({
    id: 'white-client',
    socket: {
      close(code: number, reason: string) {
        closed.push(`white:${code}:${reason}`);
      },
      send() {},
    } as unknown as WebSocket,
  });
  const spectator = clientFixture({
    id: 'spectator-client',
    seat: 'spectator',
    socket: {
      close(code: number, reason: string) {
        closed.push(`spectator:${code}:${reason}`);
      },
      send() {},
    } as unknown as WebSocket,
  });
  const room = roomFixture({ clients: [white, spectator] });

  closeRoomClients([room]);

  assert.deepEqual(closed, [
    'white:1001:server shutting down',
    'spectator:1001:server shutting down',
  ]);
});

test('waitForRoomWrites waits for all room write chains', async () => {
  const order: string[] = [];
  const first = roomFixture({
    id: 'room-a',
    pendingWrites: Promise.resolve().then(() => {
      order.push('a');
    }),
  });
  const second = roomFixture({
    id: 'room-b',
    pendingWrites: Promise.resolve().then(() => {
      order.push('b');
    }),
  });

  const results = await waitForRoomWrites([first, second]);

  assert.deepEqual(
    results.map((result) => result.status),
    ['fulfilled', 'fulfilled'],
  );
  assert.deepEqual(order.sort(), ['a', 'b']);
});
