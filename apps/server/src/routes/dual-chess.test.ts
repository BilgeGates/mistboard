import assert from 'node:assert/strict';
import test from 'node:test';
import { DUAL_CHESS_SPEC_ID } from '@mistboard/game';
import type { DualChessEvent } from '../dual-chess-runtime.js';
import type { RecentEveGameRecord } from '../persistence.js';
import { type DualChessPostgamePersistence, dualChessPostgameForApi } from './dual-chess.js';

const ROOM_ID = 'dchess_postgame';

function finishedResignationEvents(): DualChessEvent[] {
  return [
    {
      type: 'room-created',
      at: 1,
      roomId: ROOM_ID,
      gameSpecId: DUAL_CHESS_SPEC_ID,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    },
    {
      type: 'clock-started',
      at: 1,
      roomId: ROOM_ID,
      clock: {
        activeColor: null,
        incrementMs: 2_000,
        initialMs: 180_000,
        remainingMs: { white: 180_000, red: 180_000 },
        runningSince: null,
      },
    },
    { type: 'seat-assigned', at: 2, roomId: ROOM_ID, clientId: 'w', seat: 'white' },
    { type: 'seat-assigned', at: 3, roomId: ROOM_ID, clientId: 'r', seat: 'red' },
    { type: 'move-played', at: 4, roomId: ROOM_ID, color: 'white', move: { from: 'a2', to: 'a3' } },
    { type: 'seat-resigned', at: 5, roomId: ROOM_ID, color: 'red' },
  ];
}

function gameRecord(overrides: Partial<RecentEveGameRecord> = {}): RecentEveGameRecord {
  return {
    roomId: ROOM_ID,
    variant: DUAL_CHESS_SPEC_ID,
    mode: 'pvp',
    result: 'white-wins',
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
  events: DualChessEvent[] | null,
): DualChessPostgamePersistence {
  return {
    getGameSummary: async () => record,
    loadRoomEvents: async () => events,
  };
}

test('Crossroads postgame returns full-board views and per-ply history', async () => {
  const payload = await dualChessPostgameForApi(
    ROOM_ID,
    deps(gameRecord(), finishedResignationEvents()),
  );
  assert.ok(payload);

  assert.equal(payload.game.variant, DUAL_CHESS_SPEC_ID);
  assert.equal(payload.game.result, 'white-wins');
  assert.equal(payload.game.termination, 'resignation');
  assert.deepEqual(payload.game.timeControl, { initialMs: 180_000, incrementMs: 2_000 });
  assert.deepEqual(payload.state.status, {
    type: 'finished',
    winner: 'white',
    reason: 'resignation',
  });

  assert.equal(payload.view.board.a3?.shrouded, false);
  assert.equal(payload.views.white?.perspective, 'white');
  assert.equal(payload.views.red?.perspective, 'red');
  assert.equal(payload.history.white?.length, 2);
  assert.equal(payload.history.red?.length, 2);
  assert.deepEqual(
    payload.history.white?.map((snapshot) => snapshot.ply),
    [0, 1],
  );
});

test('Crossroads postgame builds a move-and-terminal timeline', async () => {
  const payload = await dualChessPostgameForApi(
    ROOM_ID,
    deps(gameRecord(), finishedResignationEvents()),
  );
  assert.ok(payload);

  assert.deepEqual(
    payload.timeline.map((entry) => entry.type),
    ['move-played', 'seat-resigned'],
  );
  const terminal = payload.timeline.at(-1);
  assert.equal(terminal?.type, 'seat-resigned');
  assert.equal(terminal && 'winner' in terminal ? terminal.winner : null, 'white');
});

test('Crossroads postgame names seats from participants', async () => {
  const payload = await dualChessPostgameForApi(
    ROOM_ID,
    deps(
      gameRecord({
        participants: [
          {
            color: 'white',
            displayName: 'Ada',
            subjectType: 'user',
            subjectId: 'u_ada',
            visibility: 'private',
          },
          {
            color: 'red',
            displayName: 'Lin',
            subjectType: 'user',
            subjectId: 'u_lin',
            visibility: 'private',
          },
        ],
      }),
      finishedResignationEvents(),
    ),
  );
  assert.ok(payload);

  assert.equal(payload.game.whiteName, 'Ada');
  assert.equal(payload.game.redName, 'Lin');
});

test('Crossroads postgame rejects unfinished or non-Crossroads games', async () => {
  const unfinished = finishedResignationEvents().slice(0, -1);
  assert.equal(await dualChessPostgameForApi(ROOM_ID, deps(gameRecord(), unfinished)), null);
  assert.equal(
    await dualChessPostgameForApi(
      ROOM_ID,
      deps(gameRecord({ variant: 'dark-chess' }), finishedResignationEvents()),
    ),
    null,
  );
  assert.equal(
    await dualChessPostgameForApi(ROOM_ID, deps(null, finishedResignationEvents())),
    null,
  );
  assert.equal(await dualChessPostgameForApi(ROOM_ID, deps(gameRecord(), null)), null);
});
