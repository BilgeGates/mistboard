import assert from 'node:assert/strict';
import test from 'node:test';
import { DARK_XIANGQI_SPEC_ID } from '@mistboard/game';
import { darkXiangqiTenant } from '../dark-xiangqi-tenant.js';
import { DARK_XIANGQI_DEFAULT_ENGINE_ID } from '../engines/registry.js';
import { restoreHydratedTenantEngineReservation } from './hydration.js';
import { createTenantRuntimeRoomFromEvents } from './runtime.js';

const ROOM_ID = 'dxq_restart_reservation';

function hydratedDarkXiangqiPveRoom() {
  const hydrated = createTenantRuntimeRoomFromEvents(darkXiangqiTenant, [
    {
      type: 'room-created',
      at: 1,
      roomId: ROOM_ID,
      gameSpecId: DARK_XIANGQI_SPEC_ID,
    },
    {
      type: 'seat-assigned',
      at: 2,
      roomId: ROOM_ID,
      clientId: 'human-red',
      seat: 'red',
    },
    {
      type: 'seat-assigned',
      at: 3,
      roomId: ROOM_ID,
      clientId: DARK_XIANGQI_DEFAULT_ENGINE_ID,
      seat: 'black',
    },
  ]);
  assert.ok(hydrated.ok, 'restart fixture must hydrate');
  return hydrated.room;
}

test('Fog Xiangqi hydration reacquires the external engine reservation before serving the room', async () => {
  const room = hydratedDarkXiangqiPveRoom();
  assert.equal(room.engineReservationId, null);

  const requests: Array<{ color: string; engineId: string; roomId: string }> = [];
  const ready = await restoreHydratedTenantEngineReservation(
    darkXiangqiTenant,
    room,
    async (request) => {
      requests.push(request);
      return 'replacement-reservation';
    },
  );

  assert.equal(ready, true);
  assert.equal(room.engineReservationId, 'replacement-reservation');
  assert.deepEqual(requests, [
    {
      color: 'black',
      engineId: DARK_XIANGQI_DEFAULT_ENGINE_ID,
      roomId: ROOM_ID,
    },
  ]);
});

test('Fog Xiangqi hydration stays unavailable rather than resuming without a reservation', async () => {
  const room = hydratedDarkXiangqiPveRoom();

  const ready = await restoreHydratedTenantEngineReservation(
    darkXiangqiTenant,
    room,
    async () => null,
  );

  assert.equal(ready, false);
  assert.equal(room.engineReservationId, null);
});
