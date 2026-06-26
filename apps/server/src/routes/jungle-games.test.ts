import assert from 'node:assert/strict';
import test from 'node:test';
import { JUNGLE_SPEC_ID } from '@mistboard/game';
import type { JungleEvent } from '../jungle-runtime.js';
import type { RecentEveGameRecord } from '../persistence.js';
import { type JunglePostgamePersistence, junglePostgameForApi } from './jungle-games.js';

const ROOM_ID = 'jgl_postgame';

// Red advances the rat a3->a4, then Black resigns. Jungle is perfect-information:
// no deal/setup, no masking, so the review is a single full-board replay.
function finishedEvents(): JungleEvent[] {
  return [
    { type: 'room-created', at: 1, roomId: ROOM_ID, gameSpecId: JUNGLE_SPEC_ID },
    { type: 'seat-assigned', at: 2, roomId: ROOM_ID, clientId: 'r', seat: 'red' },
    { type: 'seat-assigned', at: 3, roomId: ROOM_ID, clientId: 'b', seat: 'black' },
    { type: 'move-played', at: 4, roomId: ROOM_ID, color: 'red', move: { from: 'a3', to: 'a4' } },
    { type: 'seat-resigned', at: 5, roomId: ROOM_ID, color: 'black' },
  ];
}

function gameRecord(overrides: Partial<RecentEveGameRecord> = {}): RecentEveGameRecord {
  return {
    roomId: ROOM_ID,
    variant: JUNGLE_SPEC_ID,
    mode: 'pvp',
    result: 'red-wins',
    termination: 'resignation',
    plyCount: 1,
    startedAt: new Date(1),
    endedAt: new Date(5),
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
  events: JungleEvent[] | null,
): JunglePostgamePersistence {
  return {
    getGameSummary: async () => record,
    loadRoomEvents: async () => events,
  };
}

test('Jungle postgame returns the finished game with the final full board', async () => {
  const payload = await junglePostgameForApi(ROOM_ID, deps(gameRecord(), finishedEvents()));
  assert.ok(payload);

  assert.equal(payload.game.variant, JUNGLE_SPEC_ID);
  assert.equal(payload.game.result, 'red-wins');
  assert.deepEqual(payload.state.status, {
    type: 'finished',
    winner: 'red',
    reason: 'resignation',
  });

  // Perfect-info: the full board, all 16 pieces present (no captures), the rat now on a4.
  assert.equal(Object.keys(payload.view.board).length, 16);
  assert.deepEqual(payload.view.board.a4, { color: 'red', role: 'rat' });
  assert.equal(payload.view.board.a3, undefined);
});

test('Jungle postgame ships a single per-ply history (no masked/revealed split)', async () => {
  const payload = await junglePostgameForApi(ROOM_ID, deps(gameRecord(), finishedEvents()));
  assert.ok(payload);

  // history is a plain array, not { truth, revealed } — nothing was ever hidden.
  assert.ok(Array.isArray(payload.history));
  assert.deepEqual(
    payload.history.map((snapshot) => snapshot.ply),
    [0, 1],
  );
  assert.deepEqual(payload.history[0]?.view.board.a3, { color: 'red', role: 'rat' });
  assert.deepEqual(payload.history[1]?.view.board.a4, { color: 'red', role: 'rat' });
});

test('Jungle postgame builds a move-and-terminal timeline', async () => {
  const payload = await junglePostgameForApi(ROOM_ID, deps(gameRecord(), finishedEvents()));
  assert.ok(payload);
  assert.deepEqual(
    payload.timeline.map((entry) => entry.type),
    ['move-played', 'seat-resigned'],
  );
  const terminal = payload.timeline.at(-1);
  assert.equal(terminal && 'winner' in terminal ? terminal.winner : null, 'red');
});

test('Jungle postgame returns null for an unfinished game', async () => {
  const events = finishedEvents().slice(0, -1); // drop the resignation
  assert.equal(await junglePostgameForApi(ROOM_ID, deps(gameRecord(), events)), null);
});

test('Jungle postgame rejects a non-jungle variant record', async () => {
  const payload = await junglePostgameForApi(
    ROOM_ID,
    deps(gameRecord({ variant: 'banqi' }), finishedEvents()),
  );
  assert.equal(payload, null);
});

test('Jungle postgame returns null when there is no game or event log', async () => {
  assert.equal(await junglePostgameForApi(ROOM_ID, deps(null, finishedEvents())), null);
  assert.equal(await junglePostgameForApi(ROOM_ID, deps(gameRecord(), null)), null);
});

test('Jungle postgame does not require launch env flags', async () => {
  const previous = process.env.MISTBOARD_JUNGLE_ENABLED;
  delete process.env.MISTBOARD_JUNGLE_ENABLED;
  try {
    const payload = await junglePostgameForApi(ROOM_ID, deps(gameRecord(), finishedEvents()));
    assert.ok(payload);
  } finally {
    if (previous === undefined) delete process.env.MISTBOARD_JUNGLE_ENABLED;
    else process.env.MISTBOARD_JUNGLE_ENABLED = previous;
  }
});
