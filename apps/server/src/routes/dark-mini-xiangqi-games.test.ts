import assert from 'node:assert/strict';
import test from 'node:test';
import { DARK_MINI_XIANGQI_SPEC_ID } from '@mistboard/game';
import type { DarkMiniXiangqiEvent } from '../dark-mini-xiangqi-runtime.js';
import type { RecentEveGameRecord } from '../persistence.js';
import {
  type DarkMiniXiangqiPostgamePersistence,
  darkMiniXiangqiPostgameForApi,
} from './dark-mini-xiangqi-games.js';

const ROOM_ID = 'dmxq_postgame';

function finishedResignationEvents(): DarkMiniXiangqiEvent[] {
  return [
    { type: 'room-created', at: 1, roomId: ROOM_ID, gameSpecId: DARK_MINI_XIANGQI_SPEC_ID },
    { type: 'seat-assigned', at: 2, roomId: ROOM_ID, clientId: 'r', seat: 'red' },
    { type: 'seat-assigned', at: 3, roomId: ROOM_ID, clientId: 'b', seat: 'black' },
    { type: 'move-played', at: 4, roomId: ROOM_ID, color: 'red', move: { from: 'a2', to: 'a3' } },
    { type: 'move-played', at: 5, roomId: ROOM_ID, color: 'black', move: { from: 'a6', to: 'a5' } },
    { type: 'seat-resigned', at: 6, roomId: ROOM_ID, color: 'red' },
  ];
}

function gameRecord(overrides: Partial<RecentEveGameRecord> = {}): RecentEveGameRecord {
  return {
    roomId: ROOM_ID,
    variant: DARK_MINI_XIANGQI_SPEC_ID,
    mode: 'pvp',
    result: 'black-wins',
    termination: 'resignation',
    plyCount: 2,
    startedAt: new Date(1),
    endedAt: new Date(6),
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
  events: DarkMiniXiangqiEvent[] | null,
): DarkMiniXiangqiPostgamePersistence {
  return {
    getGameSummary: async () => record,
    loadRoomEvents: async () => events,
  };
}

test('Dark Mini Xiangqi postgame returns per-seat fogged views plus full truth', async () => {
  const payload = await darkMiniXiangqiPostgameForApi(
    ROOM_ID,
    deps(gameRecord(), finishedResignationEvents()),
  );
  assert.ok(payload);

  assert.equal(payload.game.variant, DARK_MINI_XIANGQI_SPEC_ID);
  assert.equal(payload.game.result, 'black-wins');
  assert.equal(payload.game.termination, 'resignation');
  assert.equal(payload.game.plyCount, 2);
  assert.equal(payload.game.visibility, 'private');
  assert.deepEqual(payload.state.status, {
    type: 'finished',
    winner: 'black',
    reason: 'resignation',
  });

  // Truth reveals the whole board, including Black's general behind the fog.
  assert.deepEqual(payload.view.board.d7, {
    piece: { color: 'black', role: 'general' },
    shrouded: false,
  });
  assert.equal(payload.views.truth?.board.d7?.shrouded, false);

  // Red's perspective must never expose Black's hidden back rank as an
  // identified piece.
  assert.equal(payload.views.red?.perspective, 'red');
  assert.equal(payload.views.black?.perspective, 'black');
  const redD7 = payload.views.red?.board.d7;
  assert.notEqual(redD7?.shrouded, false);
  assert.equal(
    redD7 !== undefined && redD7.shrouded === false && redD7.piece.color === 'black',
    false,
  );
});

test('Dark Mini Xiangqi postgame builds a move-and-terminal timeline', async () => {
  const payload = await darkMiniXiangqiPostgameForApi(
    ROOM_ID,
    deps(gameRecord(), finishedResignationEvents()),
  );
  assert.ok(payload);

  assert.deepEqual(
    payload.timeline.map((entry) => entry.type),
    ['move-played', 'move-played', 'seat-resigned'],
  );
  const terminal = payload.timeline.at(-1);
  assert.equal(terminal?.type, 'seat-resigned');
  assert.equal(terminal && 'winner' in terminal ? terminal.winner : null, 'black');
});

test('Dark Mini Xiangqi postgame exposes a per-ply history for every perspective', async () => {
  const payload = await darkMiniXiangqiPostgameForApi(
    ROOM_ID,
    deps(gameRecord(), finishedResignationEvents()),
  );
  assert.ok(payload);

  // Initial position + one snapshot per move played.
  assert.equal(payload.history.truth?.length, 3);
  assert.equal(payload.history.red?.length, 3);
  assert.equal(payload.history.black?.length, 3);
  assert.deepEqual(
    payload.history.truth?.map((snapshot) => snapshot.ply),
    [0, 1, 2],
  );
});

test('Dark Mini Xiangqi postgame returns null for an unfinished game', async () => {
  const events = finishedResignationEvents().slice(0, -1); // drop the resignation
  const payload = await darkMiniXiangqiPostgameForApi(ROOM_ID, deps(gameRecord(), events));
  assert.equal(payload, null);
});

test('Dark Mini Xiangqi postgame rejects a non-mini variant record', async () => {
  const payload = await darkMiniXiangqiPostgameForApi(
    ROOM_ID,
    deps(gameRecord({ variant: 'dark-xiangqi' }), finishedResignationEvents()),
  );
  assert.equal(payload, null);
});

test('Dark Mini Xiangqi postgame returns null when there is no game or event log', async () => {
  assert.equal(
    await darkMiniXiangqiPostgameForApi(ROOM_ID, deps(null, finishedResignationEvents())),
    null,
  );
  assert.equal(await darkMiniXiangqiPostgameForApi(ROOM_ID, deps(gameRecord(), null)), null);
});
