import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import { JIEQI_SPEC_ID, STANDARD_JIEQI_DEAL } from '@mistboard/game';
import type { JieqiEvent } from '../jieqi-runtime.js';
import type { RecentEveGameRecord } from '../persistence.js';
import { type JieqiPostgamePersistence, jieqiPostgameForApi, tryHandle } from './jieqi-games.js';
import type { HttpApiContext } from './lib.js';

const ROOM_ID = 'jq_postgame';

// Red cannon b3 captures Black's face-down piece on b10 (over the b8 screen),
// then Black resigns. After the capture Red's cannon is revealed; every other
// non-general piece is still dealt face-down. This gives us a captured DARK
// black piece — the hidden-info masking surface for the per-color views.
function finishedCaptureEvents(): JieqiEvent[] {
  return [
    {
      type: 'room-created',
      at: 1,
      roomId: ROOM_ID,
      gameSpecId: JIEQI_SPEC_ID,
      setup: STANDARD_JIEQI_DEAL,
    },
    { type: 'seat-assigned', at: 2, roomId: ROOM_ID, clientId: 'r', seat: 'red' },
    { type: 'seat-assigned', at: 3, roomId: ROOM_ID, clientId: 'b', seat: 'black' },
    { type: 'move-played', at: 4, roomId: ROOM_ID, color: 'red', move: { from: 'b3', to: 'b10' } },
    { type: 'seat-resigned', at: 5, roomId: ROOM_ID, color: 'black' },
  ];
}

function gameRecord(overrides: Partial<RecentEveGameRecord> = {}): RecentEveGameRecord {
  return {
    roomId: ROOM_ID,
    variant: JIEQI_SPEC_ID,
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
  events: JieqiEvent[] | null,
): JieqiPostgamePersistence {
  return {
    getGameSummary: async () => record,
    loadRoomEvents: async () => events,
  };
}

test('Jieqi postgame returns a full-truth view revealing every identity', async () => {
  const payload = await jieqiPostgameForApi(ROOM_ID, deps(gameRecord(), finishedCaptureEvents()));
  assert.ok(payload);

  assert.equal(payload.game.variant, JIEQI_SPEC_ID);
  assert.equal(payload.game.result, 'red-wins');
  assert.equal(payload.game.termination, 'resignation');
  assert.deepEqual(payload.state.status, {
    type: 'finished',
    winner: 'red',
    reason: 'resignation',
  });

  // Truth view: every occupied square is revealed (faceDown:false), including
  // both sides' dealt pieces and the captured black piece's full role.
  for (const [square, entry] of Object.entries(payload.view.board)) {
    assert.equal(entry?.faceDown, false, `truth square ${square} must be revealed`);
  }
  // The black piece on h8 (dealt as a cannon) is revealed in the truth view.
  assert.deepEqual(payload.view.board.h8, { color: 'black', role: 'cannon', faceDown: false });
  // Red's revealed cannon sits on b10 after the capture.
  assert.deepEqual(payload.view.board.b10, { color: 'red', role: 'cannon', faceDown: false });
  // The captured (still-dark-at-capture) black piece carries its full role.
  assert.deepEqual(payload.view.captured, [{ owner: 'black', role: 'horse' }]);
});

// ── The hidden-info regression assertion ────────────────────────────────────
test('Jieqi postgame per-color views MASK the opponent dark pieces and captures', async () => {
  const payload = await jieqiPostgameForApi(ROOM_ID, deps(gameRecord(), finishedCaptureEvents()));
  assert.ok(payload);

  const red = payload.views.red;
  const black = payload.views.black;
  assert.ok(red);
  assert.ok(black);
  assert.equal(red.perspective, 'red');
  assert.equal(black.perspective, 'black');

  // Red's view must NEVER expose Black's still-face-down piece as an identified
  // piece: h8 (a black cannon in truth) is faceDown with no role for Red.
  const redH8 = red.board.h8;
  assert.ok(redH8);
  assert.equal(redH8.faceDown, true);
  assert.equal('role' in redH8, false);

  // Captured-pool reveal is capturer-only. Red captured the black dark piece, so
  // Red learns its identity (role: 'horse')...
  assert.deepEqual(red.captured, [{ owner: 'black', role: 'horse' }]);
  // ...but Black (the former owner of the still-dark piece) learns nothing: the
  // captured entry is masked with role:null.
  assert.deepEqual(black.captured, [{ owner: 'black', role: null }]);

  // Sanity: no per-color board entry leaks the opponent's hidden role. Black
  // never moved here, so the ONLY legitimately revealed black piece is the
  // always-face-up general; any other revealed black identity would be a leak.
  for (const [square, entry] of Object.entries(red.board)) {
    if (entry && entry.faceDown === false && entry.color === 'black' && entry.role !== 'general') {
      assert.fail(`Red view leaks a revealed black identity on ${square}`);
    }
  }
});

test('Jieqi postgame history snapshots every perspective per ply', async () => {
  const payload = await jieqiPostgameForApi(ROOM_ID, deps(gameRecord(), finishedCaptureEvents()));
  assert.ok(payload);

  // Initial position (ply 0) + one snapshot for the single move played.
  assert.deepEqual(
    payload.history.truth?.map((snapshot) => snapshot.ply),
    [0, 1],
  );
  assert.equal(payload.history.red?.length, 2);
  assert.equal(payload.history.black?.length, 2);
});

test('Jieqi postgame builds a move-and-terminal timeline', async () => {
  const payload = await jieqiPostgameForApi(ROOM_ID, deps(gameRecord(), finishedCaptureEvents()));
  assert.ok(payload);

  assert.deepEqual(
    payload.timeline.map((entry) => entry.type),
    ['move-played', 'seat-resigned'],
  );
  const terminal = payload.timeline.at(-1);
  assert.equal(terminal?.type, 'seat-resigned');
  assert.equal(terminal && 'winner' in terminal ? terminal.winner : null, 'red');
});

test('Jieqi postgame returns null for an unfinished game', async () => {
  const events = finishedCaptureEvents().slice(0, -1); // drop the resignation
  const payload = await jieqiPostgameForApi(ROOM_ID, deps(gameRecord(), events));
  assert.equal(payload, null);
});

test('Jieqi postgame rejects a non-jieqi variant record', async () => {
  const payload = await jieqiPostgameForApi(
    ROOM_ID,
    deps(gameRecord({ variant: 'dark-xiangqi' }), finishedCaptureEvents()),
  );
  assert.equal(payload, null);
});

test('Jieqi postgame returns null when there is no game or event log', async () => {
  assert.equal(await jieqiPostgameForApi(ROOM_ID, deps(null, finishedCaptureEvents())), null);
  assert.equal(await jieqiPostgameForApi(ROOM_ID, deps(gameRecord(), null)), null);
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

test('Jieqi postgame route returns 404 when the jieqi flag is off', async () => {
  const previous = process.env.MISTBOARD_JIEQI_ENABLED;
  delete process.env.MISTBOARD_JIEQI_ENABLED;
  try {
    const request = { method: 'GET' } as IncomingMessage;
    const { response, status } = mockResponse();
    const handled = await tryHandle(
      {} as HttpApiContext,
      request,
      response,
      `/api/jieqi/games/${ROOM_ID}`,
      new URL(`http://localhost/api/jieqi/games/${ROOM_ID}`),
    );
    assert.equal(handled, true);
    assert.equal(status(), 404);
  } finally {
    if (previous === undefined) delete process.env.MISTBOARD_JIEQI_ENABLED;
    else process.env.MISTBOARD_JIEQI_ENABLED = previous;
  }
});
