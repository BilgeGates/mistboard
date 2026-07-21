import assert from 'node:assert/strict';
import test from 'node:test';
import { DROP_MINI_XIANGQI_SPEC_ID } from '@mistboard/game';
import { type DropMiniXiangqiEvent, dropMiniXiangqiTenant } from '../drop-mini-xiangqi-tenant.js';
import type { RecentEveGameRecord } from '../persistence.js';
import { DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID } from '../server-drop-mini-xiangqi-engine.js';
import { createTenantRuntimeRoomFromEvents } from '../variant-tenant/runtime.js';
import {
  type DropMiniXiangqiPostgamePersistence,
  dropMiniXiangqiPostgameForApi,
} from './drop-mini-xiangqi-games.js';

const ROOM_ID = 'dmxqd_postgame';

function finishedGameEvents(): DropMiniXiangqiEvent[] {
  return [
    {
      type: 'room-created',
      at: 1,
      roomId: ROOM_ID,
      gameSpecId: DROP_MINI_XIANGQI_SPEC_ID,
    },
    { type: 'seat-assigned', at: 2, roomId: ROOM_ID, clientId: 'red-client', seat: 'red' },
    { type: 'seat-assigned', at: 3, roomId: ROOM_ID, clientId: 'black-client', seat: 'black' },
    { type: 'seat-resigned', at: 4, roomId: ROOM_ID, color: 'red' },
  ];
}

function finishedPveGameEvents(): DropMiniXiangqiEvent[] {
  return [
    {
      type: 'room-created',
      at: 1,
      roomId: ROOM_ID,
      gameSpecId: DROP_MINI_XIANGQI_SPEC_ID,
    },
    {
      type: 'seat-assigned',
      at: 2,
      roomId: ROOM_ID,
      clientId: 'human-client',
      seat: 'red',
    },
    {
      type: 'seat-assigned',
      at: 3,
      roomId: ROOM_ID,
      clientId: DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID,
      seat: 'black',
    },
    { type: 'seat-resigned', at: 4, roomId: ROOM_ID, color: 'red' },
  ];
}

function gameRecord(overrides: Partial<RecentEveGameRecord> = {}): RecentEveGameRecord {
  return {
    roomId: ROOM_ID,
    variant: DROP_MINI_XIANGQI_SPEC_ID,
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
  events: DropMiniXiangqiEvent[] | null,
): DropMiniXiangqiPostgamePersistence {
  return {
    getGameSummary: async () => record,
    loadRoomEvents: async () => events,
  };
}

function liveFinishedRoom() {
  const hydrated = createTenantRuntimeRoomFromEvents(dropMiniXiangqiTenant, finishedGameEvents());
  assert.ok(hydrated.ok);
  return hydrated.room;
}

test('Drop Mini Xiangqi postgame returns truth replay from persistence', async () => {
  const payload = await dropMiniXiangqiPostgameForApi(
    ROOM_ID,
    deps(gameRecord(), finishedGameEvents()),
  );
  assert.ok(payload);
  assert.equal(payload.game.variant, DROP_MINI_XIANGQI_SPEC_ID);
  assert.deepEqual(payload.state.status, {
    type: 'finished',
    winner: 'black',
    reason: 'resignation',
  });
  assert.equal(payload.game.result, 'black-wins');
  assert.equal(payload.history.truth.length, 1);
});

test('Drop Mini Xiangqi postgame can render a finished live room without persistence', async () => {
  const room = liveFinishedRoom();
  const payload = await dropMiniXiangqiPostgameForApi(ROOM_ID, {
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
  assert.equal(payload.game.variant, DROP_MINI_XIANGQI_SPEC_ID);
  assert.equal(payload.game.visibility, 'public');
  assert.equal(payload.game.termination, 'resignation');
});

test('Drop Mini Xiangqi postgame carries the PvE engine id for review play-again', async () => {
  const payload = await dropMiniXiangqiPostgameForApi(
    ROOM_ID,
    deps(gameRecord({ mode: 'pve' }), finishedPveGameEvents()),
  );

  assert.ok(payload);
  assert.equal(payload.game.mode, 'pve');
  assert.equal(payload.game.pveEngineId, DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID);
});

test('Drop Mini Xiangqi postgame returns null for unfinished games', async () => {
  const events = finishedGameEvents().slice(0, -1);
  assert.equal(await dropMiniXiangqiPostgameForApi(ROOM_ID, deps(gameRecord(), events)), null);
});
