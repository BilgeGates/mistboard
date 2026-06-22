import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REVEAL_CHESS_SPEC_ID,
  type RevealChessMove,
  STANDARD_REVEAL_CHESS_DEAL,
} from '@mistboard/game';
import type { RecentEveGameRecord } from '../persistence.js';
import type { RevealChessEvent } from '../reveal-chess-runtime.js';
import {
  type RevealChessPostgamePersistence,
  revealChessPostgameForApi,
} from './reveal-chess-games.js';

const ROOM_ID = 'rc_postgame';

// A deterministic scripted line over the STANDARD deal: both sides develop, then
// White's b5 piece captures Black's a7 piece while it is STILL FACE-DOWN (true
// pawn). After the capture, Black resigns. This gives us a captured DARK black
// piece — the hidden-info masking surface for the per-color views. White is the
// capturer (learns the role); Black is the former owner (learns nothing).
const SCRIPTED_LINE: { color: 'white' | 'black'; move: RevealChessMove }[] = [
  { color: 'white', move: { from: 'b1', to: 'a3' } },
  { color: 'black', move: { from: 'b8', to: 'a6' } },
  { color: 'white', move: { from: 'a1', to: 'b1' } },
  { color: 'black', move: { from: 'a8', to: 'b8' } },
  { color: 'white', move: { from: 'g1', to: 'f3' } },
  { color: 'black', move: { from: 'g8', to: 'f6' } },
  { color: 'white', move: { from: 'h1', to: 'g1' } },
  { color: 'black', move: { from: 'h8', to: 'g8' } },
  { color: 'white', move: { from: 'b2', to: 'b3' } },
  { color: 'black', move: { from: 'b7', to: 'b6' } },
  { color: 'white', move: { from: 'c1', to: 'b2' } },
  { color: 'black', move: { from: 'c8', to: 'b7' } },
  { color: 'white', move: { from: 'd1', to: 'c1' } },
  { color: 'black', move: { from: 'd8', to: 'c8' } },
  { color: 'white', move: { from: 'e1', to: 'd1' } },
  { color: 'black', move: { from: 'e8', to: 'd8' } },
  { color: 'white', move: { from: 'c2', to: 'c3' } },
  { color: 'black', move: { from: 'c7', to: 'c6' } },
  { color: 'white', move: { from: 'd2', to: 'd3' } },
  { color: 'black', move: { from: 'd7', to: 'd6' } },
  { color: 'white', move: { from: 'e2', to: 'e3' } },
  { color: 'black', move: { from: 'e7', to: 'e6' } },
  { color: 'white', move: { from: 'f1', to: 'e2' } },
  { color: 'black', move: { from: 'f8', to: 'e7' } },
  { color: 'white', move: { from: 'g2', to: 'g3' } },
  { color: 'black', move: { from: 'g7', to: 'g6' } },
  { color: 'white', move: { from: 'h2', to: 'h3' } },
  { color: 'black', move: { from: 'h7', to: 'h6' } },
  { color: 'white', move: { from: 'a3', to: 'b5' } },
  { color: 'black', move: { from: 'a6', to: 'b4' } },
  { color: 'white', move: { from: 'b5', to: 'a7' } }, // captures Black's face-down a7
];

function finishedCaptureEvents(): RevealChessEvent[] {
  const events: RevealChessEvent[] = [
    {
      type: 'room-created',
      at: 1,
      roomId: ROOM_ID,
      gameSpecId: REVEAL_CHESS_SPEC_ID,
      setup: STANDARD_REVEAL_CHESS_DEAL,
    },
    { type: 'seat-assigned', at: 2, roomId: ROOM_ID, clientId: 'w', seat: 'white' },
    { type: 'seat-assigned', at: 3, roomId: ROOM_ID, clientId: 'b', seat: 'black' },
  ];
  let at = 4;
  for (const { color, move } of SCRIPTED_LINE) {
    events.push({ type: 'move-played', at: at++, roomId: ROOM_ID, color, move });
  }
  // Black resigns after losing the a7 piece -> White wins.
  events.push({ type: 'seat-resigned', at: at, roomId: ROOM_ID, color: 'black' });
  return events;
}

function gameRecord(overrides: Partial<RecentEveGameRecord> = {}): RecentEveGameRecord {
  return {
    roomId: ROOM_ID,
    variant: REVEAL_CHESS_SPEC_ID,
    mode: 'pvp',
    result: 'white-wins',
    termination: 'resignation',
    plyCount: SCRIPTED_LINE.length,
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
  events: RevealChessEvent[] | null,
): RevealChessPostgamePersistence {
  return {
    getGameSummary: async () => record,
    loadRoomEvents: async () => events,
  };
}

test('Reveal Chess postgame returns a full-truth view revealing every identity', async () => {
  const payload = await revealChessPostgameForApi(
    ROOM_ID,
    deps(gameRecord(), finishedCaptureEvents()),
  );
  assert.ok(payload);

  assert.equal(payload.game.variant, REVEAL_CHESS_SPEC_ID);
  assert.equal(payload.game.result, 'white-wins');
  assert.equal(payload.game.termination, 'resignation');
  assert.deepEqual(payload.state.status, {
    type: 'finished',
    winner: 'white',
    reason: 'resignation',
  });

  // Truth view: every occupied square is revealed (faceDown:false).
  for (const [square, entry] of Object.entries(payload.view.board)) {
    assert.equal(entry?.faceDown, false, `truth square ${square} must be revealed`);
  }
  // The captured (still-dark-at-capture) black piece carries its full role in
  // the truth view: White captured Black's face-down pawn on a7.
  assert.deepEqual(payload.view.captured, [{ owner: 'black', role: 'pawn' }]);
});

// ── The hidden-info regression assertion ────────────────────────────────────
test('Reveal Chess postgame per-color views MASK opponent dark pieces and captures', async () => {
  const payload = await revealChessPostgameForApi(
    ROOM_ID,
    deps(gameRecord(), finishedCaptureEvents()),
  );
  assert.ok(payload);

  const white = payload.views.white;
  const black = payload.views.black;
  assert.ok(white);
  assert.ok(black);
  assert.equal(white.perspective, 'white');
  assert.equal(black.perspective, 'black');

  // White's view must NEVER expose a still-face-down black piece as an
  // identified piece: any black entry that is faceDown carries no role.
  for (const [square, entry] of Object.entries(white.board)) {
    if (entry && entry.color === 'black' && entry.faceDown === true) {
      assert.equal('role' in entry, false, `white view leaks a face-down black role on ${square}`);
    }
  }

  // Captured-pool reveal is capturer-only. White captured the black dark piece,
  // so White learns its identity (role: 'pawn')...
  assert.deepEqual(white.captured, [{ owner: 'black', role: 'pawn' }]);
  // ...but Black (the former owner of the still-dark piece) learns nothing: the
  // captured entry is masked with role:null.
  assert.deepEqual(black.captured, [{ owner: 'black', role: null }]);
});

test('Reveal Chess postgame history snapshots every perspective per ply', async () => {
  const payload = await revealChessPostgameForApi(
    ROOM_ID,
    deps(gameRecord(), finishedCaptureEvents()),
  );
  assert.ok(payload);

  // Initial position (ply 0) + one snapshot per move played.
  const expectedPlies = Array.from({ length: SCRIPTED_LINE.length + 1 }, (_, i) => i);
  assert.deepEqual(
    payload.history.truth?.map((snapshot) => snapshot.ply),
    expectedPlies,
  );
  assert.equal(payload.history.white?.length, SCRIPTED_LINE.length + 1);
  assert.equal(payload.history.black?.length, SCRIPTED_LINE.length + 1);
});

test('Reveal Chess postgame builds a move-and-terminal timeline', async () => {
  const payload = await revealChessPostgameForApi(
    ROOM_ID,
    deps(gameRecord(), finishedCaptureEvents()),
  );
  assert.ok(payload);

  const terminal = payload.timeline.at(-1);
  assert.equal(terminal?.type, 'seat-resigned');
  assert.equal(terminal && 'winner' in terminal ? terminal.winner : null, 'white');
  // The move events precede the terminal, one per scripted ply.
  const moves = payload.timeline.filter((entry) => entry.type === 'move-played');
  assert.equal(moves.length, SCRIPTED_LINE.length);
});

test('Reveal Chess postgame returns null for an unfinished game', async () => {
  const events = finishedCaptureEvents().slice(0, -1); // drop the resignation
  const payload = await revealChessPostgameForApi(ROOM_ID, deps(gameRecord(), events));
  assert.equal(payload, null);
});

test('Reveal Chess postgame rejects a non-reveal-chess variant record', async () => {
  const payload = await revealChessPostgameForApi(
    ROOM_ID,
    deps(gameRecord({ variant: 'jieqi' }), finishedCaptureEvents()),
  );
  assert.equal(payload, null);
});

test('Reveal Chess postgame returns null when there is no game or event log', async () => {
  assert.equal(await revealChessPostgameForApi(ROOM_ID, deps(null, finishedCaptureEvents())), null);
  assert.equal(await revealChessPostgameForApi(ROOM_ID, deps(gameRecord(), null)), null);
});

test('Reveal Chess postgame does not require launch env flags', async () => {
  const previous = process.env.MISTBOARD_REVEAL_CHESS_ENABLED;
  delete process.env.MISTBOARD_REVEAL_CHESS_ENABLED;
  try {
    const payload = await revealChessPostgameForApi(
      ROOM_ID,
      deps(gameRecord(), finishedCaptureEvents()),
    );
    assert.ok(payload);
  } finally {
    if (previous === undefined) delete process.env.MISTBOARD_REVEAL_CHESS_ENABLED;
    else process.env.MISTBOARD_REVEAL_CHESS_ENABLED = previous;
  }
});
