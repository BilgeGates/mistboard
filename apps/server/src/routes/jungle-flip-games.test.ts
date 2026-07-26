import assert from 'node:assert/strict';
import test from 'node:test';
import {
  JUNGLE_FLIP_SPEC_ID,
  type JungleFlipPlayerView,
  STANDARD_JUNGLE_FLIP_DEAL,
} from '@mistboard/game';
import type { JungleFlipEvent } from '../jungle-flip-runtime.js';
import { jungleFlipTenant } from '../jungle-flip-tenant.js';
import type { RecentEveGameRecord } from '../persistence.js';
import { replayTenantEvents } from '../variant-tenant/runtime.js';
import {
  jungleFlipLiveWatchPayloadFor,
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
  // Spoiler overlay: a1's identity shown from ply 0. Only the FINISHED payload
  // carries it (the live-broadcast shape omits `revealed` entirely).
  assert.ok(payload.history.revealed);
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

// ---------------------------------------------------------------------------
// Mistboard TV live broadcast. Flip Jungle is SYMMETRIC hidden-identity, so the
// masked board a spectator gets is exactly what both players see. The regression
// that matters is the FINISHED payload's two full-truth fields (`view` =
// jungleFlipTruthView, `history.revealed`) never riding a live wire.
// ---------------------------------------------------------------------------

// One flip (a1 -> red rat), game still in progress. Every other tile is face-down
// and its identity is the server's secret.
function liveFlipEvents(): JungleFlipEvent[] {
  return finishedFlipEvents().slice(0, -1); // drop the resignation
}

function liveRoom(events: JungleFlipEvent[] = liveFlipEvents()) {
  return {
    id: ROOM_ID,
    events,
    projection: replayTenantEvents(jungleFlipTenant, events),
  };
}

test('live payload never ships a face-down tile identity', () => {
  const payload = jungleFlipLiveWatchPayloadFor(ROOM_ID, liveRoom()) as {
    view: JungleFlipPlayerView;
    history: { truth: Array<{ view: JungleFlipPlayerView }>; revealed?: unknown };
  } | null;
  assert.ok(payload);

  // The spoiler track is the whole deal — it must not exist at all.
  assert.equal(payload.history.revealed, undefined);

  // The flipped tile is public; every still-hidden tile carries NO colour and NO
  // role, in the top-level view and in every per-ply snapshot.
  const boards = [payload.view, ...payload.history.truth.map((entry) => entry.view)].map(
    (view) => view.board,
  );
  assert.ok(boards.length >= 2);
  for (const board of boards) {
    let hidden = 0;
    for (const [square, piece] of Object.entries(board)) {
      if (!piece) continue;
      if (!piece.faceDown) continue;
      hidden += 1;
      assert.deepEqual(piece, { faceDown: true }, `${square} leaks a face-down identity`);
    }
    // Serving the TRUTH view would turn every tile face-up and make the identity
    // loop above pass vacuously, so require that tiles are still hidden at all:
    // 16 at ply 0, 15 after the one flip.
    assert.ok(hidden >= 15, `live board must still be masked (only ${hidden} hidden)`);
  }
  // ...and the one revealed tile still reads correctly, so this is not vacuous.
  assert.deepEqual(payload.view.board.a1, { color: 'red', role: 'rat', faceDown: false });
});

test('live payload is withheld for a room that is not in progress', () => {
  assert.equal(jungleFlipLiveWatchPayloadFor(ROOM_ID, liveRoom(finishedFlipEvents())), null);
});

test('live payload is withheld when the room id does not match', () => {
  assert.equal(jungleFlipLiveWatchPayloadFor('jgf_other', liveRoom()), null);
});

test('live payload reports the game as in-progress with no end time', () => {
  const payload = jungleFlipLiveWatchPayloadFor(ROOM_ID, liveRoom()) as {
    game: { result: string; endedAt: string | null; plyCount: number };
  } | null;
  assert.ok(payload);
  assert.equal(payload.game.result, 'in-progress');
  assert.equal(payload.game.endedAt, null);
  assert.equal(payload.game.plyCount, 1);
});
