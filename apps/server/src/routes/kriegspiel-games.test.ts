import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyKriegspielMove,
  createInitialKriegspielState,
  KRIEGSPIEL_SPEC_ID,
  type Move,
} from '@mistboard/game';
import type { KriegspielEvent } from '../kriegspiel-runtime.js';
import { kriegspielTenant } from '../kriegspiel-tenant.js';
import type { RecentEveGameRecord } from '../persistence.js';
import { createTenantRuntimeRoomFromEvents } from '../variant-tenant/runtime.js';
import {
  type KriegspielPostgamePersistence,
  kriegspielPostgameForApi,
} from './kriegspiel-games.js';

const ROOM_ID = 'kr_postgame';
const MOVES: Move[] = [
  { from: 'e2', to: 'e4' },
  { from: 'e7', to: 'e5' },
  { from: 'g1', to: 'f3' },
];

function finishedGameEvents(): KriegspielEvent[] {
  const events: KriegspielEvent[] = [
    { type: 'room-created', at: 1, roomId: ROOM_ID, gameSpecId: KRIEGSPIEL_SPEC_ID },
    { type: 'seat-assigned', at: 2, roomId: ROOM_ID, clientId: 'w', seat: 'white' },
    { type: 'seat-assigned', at: 3, roomId: ROOM_ID, clientId: 'b', seat: 'black' },
  ];
  let state = createInitialKriegspielState(ROOM_ID);
  let at = 4;
  for (const move of MOVES) {
    assert.equal(state.status.type, 'playing');
    const color = state.status.turn;
    events.push({ type: 'move-played', at: at++, roomId: ROOM_ID, color, move });
    state = applyKriegspielMove(state, move);
  }
  events.push({ type: 'seat-resigned', at, roomId: ROOM_ID, color: 'black' });
  return events;
}

function gameRecord(overrides: Partial<RecentEveGameRecord> = {}): RecentEveGameRecord {
  return {
    roomId: ROOM_ID,
    variant: KRIEGSPIEL_SPEC_ID,
    mode: 'pvp',
    result: 'white-wins',
    termination: 'resignation',
    plyCount: MOVES.length,
    startedAt: new Date(1),
    endedAt: new Date(100),
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
  events: KriegspielEvent[] | null,
): KriegspielPostgamePersistence {
  return {
    getGameSummary: async () => record,
    loadRoomEvents: async () => events,
  };
}

function liveFinishedRoom() {
  const hydrated = createTenantRuntimeRoomFromEvents(kriegspielTenant, finishedGameEvents());
  assert.ok(hydrated.ok);
  return hydrated.room;
}

test('Kriegspiel postgame returns truth plus per-seat private views', async () => {
  const payload = await kriegspielPostgameForApi(ROOM_ID, deps(gameRecord(), finishedGameEvents()));
  assert.ok(payload);
  assert.equal(payload.game.variant, KRIEGSPIEL_SPEC_ID);
  assert.deepEqual(payload.state.status, {
    type: 'finished',
    winner: 'white',
    reason: 'resignation',
  });
  assert.equal(payload.view.visibleSquares.length, 64);
  assert.ok(payload.views?.white);
  assert.ok(payload.views?.black);

  for (const [perspective, view] of [
    ['white', payload.views.white],
    ['black', payload.views.black],
  ] as const) {
    assert.equal(view.perspective, perspective);
    for (const piece of Object.values(view.board)) {
      assert.equal(piece?.color, perspective);
    }
  }
});

test('Kriegspiel postgame can render from a finished live room without persistence', async () => {
  const room = liveFinishedRoom();
  const payload = await kriegspielPostgameForApi(ROOM_ID, {
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
  assert.equal(payload.game.variant, KRIEGSPIEL_SPEC_ID);
  assert.equal(payload.game.visibility, 'public');
  assert.equal(
    payload.timeline.filter((entry) => entry.type === 'move-played').length,
    MOVES.length,
  );
  assert.equal(payload.history?.truth?.at(-1)?.ply, MOVES.length);
});

test('Kriegspiel postgame returns null for an unfinished game', async () => {
  const events = finishedGameEvents().slice(0, -1);
  const payload = await kriegspielPostgameForApi(ROOM_ID, deps(gameRecord(), events));
  assert.equal(payload, null);
});
