import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import { BANQI_SPEC_ID, STANDARD_BANQI_DEAL } from '@mistboard/game';
import type { BanqiEvent } from '../banqi-runtime.js';
import type { RecentEveGameRecord } from '../persistence.js';
import { type BanqiPostgamePersistence, banqiPostgameForApi, tryHandle } from './banqi-games.js';
import type { HttpApiContext } from './lib.js';

const ROOM_ID = 'bq_postgame';

// Red (the first seat) flips a1 — binding its ink to the revealed red general —
// then Black resigns. Banqi is symmetric: a face-down tile is hidden from both
// equally and every capture is of an already-revealed piece, so there is no
// private per-seat knowledge. The postgame is a SINGLE truth review surface.
function finishedFlipEvents(): BanqiEvent[] {
  return [
    {
      type: 'room-created',
      at: 1,
      roomId: ROOM_ID,
      gameSpecId: BANQI_SPEC_ID,
      setup: STANDARD_BANQI_DEAL,
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
    variant: BANQI_SPEC_ID,
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
  events: BanqiEvent[] | null,
): BanqiPostgamePersistence {
  return {
    getGameSummary: async () => record,
    loadRoomEvents: async () => events,
  };
}

test('Banqi postgame returns a full-truth view revealing every identity', async () => {
  const payload = await banqiPostgameForApi(ROOM_ID, deps(gameRecord(), finishedFlipEvents()));
  assert.ok(payload);

  assert.equal(payload.game.variant, BANQI_SPEC_ID);
  assert.equal(payload.game.result, 'red-wins');
  assert.equal(payload.game.termination, 'resignation');
  assert.deepEqual(payload.state.status, {
    type: 'finished',
    winner: 'red',
    reason: 'resignation',
  });

  // Truth view: all 32 tiles revealed (faceDown:false), even the ones never
  // flipped during play — the deal is fully known to the server postgame.
  const entries = Object.entries(payload.view.board);
  assert.equal(entries.length, 32);
  for (const [square, entry] of entries) {
    assert.equal(entry?.faceDown, false, `truth square ${square} must be revealed`);
  }
  // a1 was dealt the red general (deal index 0) and flipped on the opening move.
  assert.deepEqual(payload.view.board.a1, { color: 'red', role: 'general', faceDown: false });
});

// ── Symmetric-info contract: NO per-seat split ──────────────────────────────
test('Banqi postgame ships a single truth surface, not per-seat views', async () => {
  const payload = await banqiPostgameForApi(ROOM_ID, deps(gameRecord(), finishedFlipEvents()));
  assert.ok(payload);

  // Banqi has no private knowledge, so the route omits the jieqi-style per-color
  // views entirely; the web review renders the single truth board.
  assert.equal('views' in payload, false);
  assert.equal(payload.view.perspective, 'red');
});

test('Banqi postgame history masks unflipped tiles per ply', async () => {
  const payload = await banqiPostgameForApi(ROOM_ID, deps(gameRecord(), finishedFlipEvents()));
  assert.ok(payload);

  // Initial position (ply 0) + one snapshot for the single move played.
  assert.deepEqual(
    payload.history.truth?.map((snapshot) => snapshot.ply),
    [0, 1],
  );
  // The replay reproduces the actual flips: at ply 0 every tile is still face-down
  // (nothing has been revealed), and a1 only turns over at ply 1 when it is flipped.
  // Without the mask the whole deal would show from move 0, defeating the replay.
  const startBoard = payload.history.truth?.[0]?.view.board ?? {};
  for (const [square, entry] of Object.entries(startBoard)) {
    assert.equal(entry?.faceDown, true, `ply-0 square ${square} must be face-down`);
  }
  assert.equal(payload.history.truth?.[1]?.view.board.a1?.faceDown, false);
  assert.deepEqual(payload.history.truth?.[1]?.view.board.a1, {
    color: 'red',
    role: 'general',
    faceDown: false,
  });
});

test('Banqi postgame builds a move-and-terminal timeline', async () => {
  const payload = await banqiPostgameForApi(ROOM_ID, deps(gameRecord(), finishedFlipEvents()));
  assert.ok(payload);

  assert.deepEqual(
    payload.timeline.map((entry) => entry.type),
    ['move-played', 'seat-resigned'],
  );
  const terminal = payload.timeline.at(-1);
  assert.equal(terminal?.type, 'seat-resigned');
  assert.equal(terminal && 'winner' in terminal ? terminal.winner : null, 'red');
});

test('Banqi postgame returns null for an unfinished game', async () => {
  const events = finishedFlipEvents().slice(0, -1); // drop the resignation
  const payload = await banqiPostgameForApi(ROOM_ID, deps(gameRecord(), events));
  assert.equal(payload, null);
});

test('Banqi postgame rejects a non-banqi variant record', async () => {
  const payload = await banqiPostgameForApi(
    ROOM_ID,
    deps(gameRecord({ variant: 'jieqi' }), finishedFlipEvents()),
  );
  assert.equal(payload, null);
});

test('Banqi postgame returns null when there is no game or event log', async () => {
  assert.equal(await banqiPostgameForApi(ROOM_ID, deps(null, finishedFlipEvents())), null);
  assert.equal(await banqiPostgameForApi(ROOM_ID, deps(gameRecord(), null)), null);
});

// Mock just enough of the http req/res for the flag-gate branch, which fires
// before any persistence call.
function mockResponse(): { response: ServerResponse; status: () => number | null } {
  let status: number | null = null;
  const response = {
    writeHead(code: number) {
      status = code;
      return response;
    },
    end() {
      return response;
    },
  } as unknown as ServerResponse;
  return { response, status: () => status };
}

test('Banqi postgame route returns 404 when the banqi flag is off', async () => {
  const previous = process.env.MISTBOARD_BANQI_ENABLED;
  delete process.env.MISTBOARD_BANQI_ENABLED;
  try {
    const request = { method: 'GET' } as IncomingMessage;
    const { response, status } = mockResponse();
    const handled = await tryHandle(
      {} as HttpApiContext,
      request,
      response,
      `/api/banqi/games/${ROOM_ID}`,
      new URL(`http://localhost/api/banqi/games/${ROOM_ID}`),
    );
    assert.equal(handled, true);
    assert.equal(status(), 404);
  } finally {
    if (previous === undefined) delete process.env.MISTBOARD_BANQI_ENABLED;
    else process.env.MISTBOARD_BANQI_ENABLED = previous;
  }
});
