import assert from 'node:assert/strict';
import test from 'node:test';
import { MINI_XIANGQI_SPEC_ID } from '@mistboard/game';
import { type MiniXiangqiEvent, miniXiangqiTenant } from '../mini-xiangqi-tenant.js';
import type { RecentEveGameRecord } from '../persistence.js';
import { createTenantRuntimeRoomFromEvents } from '../variant-tenant/runtime.js';
import {
  type MiniXiangqiPostgamePersistence,
  miniXiangqiPostgameForApi,
} from './mini-xiangqi-games.js';

const ROOM_ID = 'mxq_postgame';

function finishedGameEvents(): MiniXiangqiEvent[] {
  return [
    {
      type: 'room-created',
      at: 1,
      roomId: ROOM_ID,
      gameSpecId: MINI_XIANGQI_SPEC_ID,
    },
    { type: 'seat-assigned', at: 2, roomId: ROOM_ID, clientId: 'red-client', seat: 'red' },
    { type: 'seat-assigned', at: 3, roomId: ROOM_ID, clientId: 'black-client', seat: 'black' },
    { type: 'seat-resigned', at: 4, roomId: ROOM_ID, color: 'red' },
  ];
}

function gameRecord(overrides: Partial<RecentEveGameRecord> = {}): RecentEveGameRecord {
  return {
    roomId: ROOM_ID,
    variant: MINI_XIANGQI_SPEC_ID,
    mode: 'pvp',
    result: 'black-wins',
    termination: 'resignation',
    plyCount: 0,
    startedAt: new Date(1),
    endedAt: new Date(4),
    whiteName: null,
    blackName: null,
    corpusId: null,
    rated: false,
    visibility: 'private',
    participants: [],
    jobId: null,
    gameIndex: null,
    whiteEngineId: null,
    blackEngineId: null,
    timeControl: null,
    initialMs: null,
    incrementMs: null,
    ...overrides,
  };
}

function deps(
  record: RecentEveGameRecord | null,
  events: MiniXiangqiEvent[] | null,
): MiniXiangqiPostgamePersistence {
  return {
    getGameSummary: async () => record,
    loadRoomEvents: async () => events,
  };
}

function liveFinishedRoom() {
  const hydrated = createTenantRuntimeRoomFromEvents(miniXiangqiTenant, finishedGameEvents());
  assert.ok(hydrated.ok);
  return hydrated.room;
}

test('Mini Xiangqi postgame returns truth replay from persistence', async () => {
  const payload = await miniXiangqiPostgameForApi(
    ROOM_ID,
    deps(gameRecord(), finishedGameEvents()),
  );
  assert.ok(payload);
  assert.equal(payload.game.variant, MINI_XIANGQI_SPEC_ID);
  assert.deepEqual(payload.state.status, {
    type: 'finished',
    winner: 'black',
    reason: 'resignation',
  });
  assert.equal(payload.game.result, 'black-wins');
  assert.equal(payload.history.truth.length, 1);
});

test('Mini Xiangqi postgame can render a finished live room without persistence', async () => {
  const room = liveFinishedRoom();
  const payload = await miniXiangqiPostgameForApi(ROOM_ID, {
    getGameSummary: async () => {
      throw new Error('persistence should not be queried');
    },
    getLiveRoom: () => room,
    isPersistenceEnabled: () => false,
    loadRoomEvents: async () => {
      throw new Error('persistence should not be queried');
    },
  });
  assert.ok(payload);
  assert.equal(payload.game.roomId, ROOM_ID);
  assert.equal(payload.game.variant, MINI_XIANGQI_SPEC_ID);
  assert.equal(payload.game.visibility, 'private');
  assert.equal(payload.game.termination, 'resignation');
});

test('Mini Xiangqi postgame returns null for unfinished games', async () => {
  const events = finishedGameEvents().slice(0, -1);
  assert.equal(await miniXiangqiPostgameForApi(ROOM_ID, deps(gameRecord(), events)), null);
});
