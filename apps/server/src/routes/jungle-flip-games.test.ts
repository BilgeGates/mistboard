import assert from 'node:assert/strict';
import test from 'node:test';
import { JUNGLE_FLIP_SPEC_ID, STANDARD_JUNGLE_FLIP_DEAL } from '@mistboard/game';
import type { JungleFlipEvent } from '../jungle-flip-runtime.js';
import type { RecentEveGameRecord } from '../persistence.js';
import {
  type JungleFlipPostgamePersistence,
  jungleFlipPostgameForApi,
} from './jungle-flip-games.js';

const ROOM_ID = 'jgf_postgame';

// Red (the first seat) flips a1 — binding its ink to the revealed red rat (deal
// index 0) — then Black resigns. Flip Jungle is symmetric hidden-identity (the
// banqi pattern): a face-down tile is hidden from both seats equally, so the
// postgame ships an as-played masked replay plus a full-reveal overlay.
function finishedFlipEvents(): JungleFlipEvent[] {
  return [
    {
      type: 'room-created',
      at: 1,
      roomId: ROOM_ID,
      gameSpecId: JUNGLE_FLIP_SPEC_ID,
      setup: STANDARD_JUNGLE_FLIP_DEAL,
    },
    { type: 'seat-assigned', at: 2, roomId: ROOM_ID, clientId: 'r', seat: 'red' },
    { type: 'seat-assigned', at: 3, roomId: ROOM_ID, clientId: 'b', seat: 'black' },
    { type: 'move-played', at: 4, roomId: ROOM_ID, color: 'red', move: { from: 'a1', to: 'a1' } },
    { type: 'seat-resigned', at: 5, roomId: ROOM_ID, color: 'black' },
  ];
}

function gameRecord(overrides: Partial<RecentEveGameRecord> = {}): RecentEveGameRecord {
  return {
    roomId: ROOM_ID,
    variant: JUNGLE_FLIP_SPEC_ID,
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
  events: JungleFlipEvent[] | null,
): JungleFlipPostgamePersistence {
  return {
    getGameSummary: async () => record,
    loadRoomEvents: async () => events,
  };
}

test('Flip Jungle postgame returns the finished game with the full revealed truth', async () => {
  const payload = await jungleFlipPostgameForApi(ROOM_ID, deps(gameRecord(), finishedFlipEvents()));
  assert.ok(payload);

  assert.equal(payload.game.variant, JUNGLE_FLIP_SPEC_ID);
  assert.equal(payload.game.result, 'red-wins');
  assert.deepEqual(payload.state.status, {
    type: 'finished',
    winner: 'red',
    reason: 'resignation',
  });
  // Truth view: every tile face-up. a1 was flipped to the red rat.
  assert.deepEqual(payload.view.board.a1, { color: 'red', role: 'rat', faceDown: false });
});

test('Flip Jungle postgame ships masked + revealed per-ply histories', async () => {
  const payload = await jungleFlipPostgameForApi(ROOM_ID, deps(gameRecord(), finishedFlipEvents()));
  assert.ok(payload);

  assert.ok(payload.history);
  // As-played mask: a1 starts face-down, then turns over after the flip ply.
  assert.deepEqual(
    payload.history.truth.map((s) => s.ply),
    [0, 1],
  );
  assert.deepEqual(payload.history.truth[0]?.view.board.a1, { faceDown: true });
  assert.deepEqual(payload.history.truth[1]?.view.board.a1, {
    color: 'red',
    role: 'rat',
    faceDown: false,
  });
  // Spoiler overlay: a1's identity shown from ply 0.
  assert.deepEqual(payload.history.revealed[0]?.view.board.a1, {
    color: 'red',
    role: 'rat',
    faceDown: false,
  });
});

test('Flip Jungle postgame builds a move-and-terminal timeline', async () => {
  const payload = await jungleFlipPostgameForApi(ROOM_ID, deps(gameRecord(), finishedFlipEvents()));
  assert.ok(payload);
  assert.deepEqual(
    payload.timeline.map((entry) => entry.type),
    ['move-played', 'seat-resigned'],
  );
  const terminal = payload.timeline.at(-1);
  assert.equal(terminal && 'winner' in terminal ? terminal.winner : null, 'red');
});

test('Flip Jungle postgame returns null for an unfinished game', async () => {
  const events = finishedFlipEvents().slice(0, -1); // drop the resignation
  assert.equal(await jungleFlipPostgameForApi(ROOM_ID, deps(gameRecord(), events)), null);
});

test('Flip Jungle postgame rejects a non-jungle-flip variant record', async () => {
  const payload = await jungleFlipPostgameForApi(
    ROOM_ID,
    deps(gameRecord({ variant: 'banqi' }), finishedFlipEvents()),
  );
  assert.equal(payload, null);
});

test('Flip Jungle postgame returns null when there is no game or event log', async () => {
  assert.equal(await jungleFlipPostgameForApi(ROOM_ID, deps(null, finishedFlipEvents())), null);
  assert.equal(await jungleFlipPostgameForApi(ROOM_ID, deps(gameRecord(), null)), null);
});
