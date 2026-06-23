import assert from 'node:assert/strict';
import test from 'node:test';
import { DARK_XIANGQI_SPEC_ID } from '@mistboard/game';
import {
  createDarkXiangqiRuntimeRoomFromEvents,
  type DarkXiangqiEvent,
} from './dark-xiangqi-runtime.js';
import { darkXiangqiPostgameForApi } from './routes/dark-xiangqi-games.js';

test('Dark Xiangqi postgame can render a finished in-memory room without persistence', async () => {
  const roomId = 'dxq_live_postgame';
  const events: DarkXiangqiEvent[] = [
    { type: 'room-created', at: 1_000, roomId, gameSpecId: DARK_XIANGQI_SPEC_ID },
    { type: 'seat-resigned', at: 2_000, roomId, color: 'black' },
  ];
  const created = createDarkXiangqiRuntimeRoomFromEvents(events);
  if (!created.ok) throw new Error('fixture event log must hydrate');
  assert.equal(created.room.id, roomId);

  const payload = await darkXiangqiPostgameForApi(roomId, {
    getLiveRoom: (id) => (id === roomId ? created.room : null),
    getGameSummary: async () => {
      throw new Error('persistence should not be queried');
    },
    isPersistenceEnabled: () => false,
    loadRoomEvents: async () => {
      throw new Error('persistence should not be queried');
    },
  });

  assert.equal(payload?.game.roomId, roomId);
  assert.equal(payload?.game.result, 'red-wins');
  assert.equal(payload?.game.termination, 'resignation');
  assert.deepEqual(payload?.state.status, {
    type: 'finished',
    winner: 'red',
    reason: 'resignation',
  });
  assert.equal(payload?.timeline.at(-1)?.type, 'seat-resigned');
  assert.ok(payload?.history.truth?.length);
});
