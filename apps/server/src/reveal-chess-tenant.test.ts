/**
 * Reveal Chess tenant: deal-randomness primitive + hidden-information contract.
 *
 * The deal is a server secret. These pins prove it is minted at creation,
 * persisted in the room-created event for replay, stripped before any client
 * sees the event, and never leaked through the masked view — including the
 * capturer-only captured pool. They also prove the move path (promotion
 * optional, present-but-invalid rejected) and the always-PvP snapshot extras.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyRevealChessMove,
  createInitialRevealChessState,
  getRevealChessLegalMoves,
  REVEAL_CHESS_SPEC_ID,
  type RevealChessBoard,
  type RevealChessGameState,
  type RevealChessMove,
  STANDARD_REVEAL_CHESS_DEAL,
} from '@mistboard/game';
import {
  getRevealChessClientView,
  revealChessClientEventFor,
  revealChessTenant,
} from './reveal-chess-tenant.js';
import { createTenantRuntimeRoom, replayTenantEvents } from './variant-tenant/runtime.js';
import type { TenantRoomEvent } from './variant-tenant/tenant.js';

process.env.MISTBOARD_REVEAL_CHESS_ENABLED = 'true';

function makeState(
  board: RevealChessBoard,
  turn: 'white' | 'black' = 'white',
): RevealChessGameState {
  return {
    id: 'rc_test',
    board,
    status: { type: 'playing', turn },
    moveNumber: 1,
    noProgressClock: 0,
    positionCounts: {},
    castlingRights: [],
    captures: [],
  };
}

test('reveal-chess room creation mints and persists a server-secret deal', () => {
  const created = createTenantRuntimeRoom(revealChessTenant, 'rc_deal', { now: 1 });
  if (!created.ok) throw new Error(created.error);

  const event = created.room.events[0];
  if (event.type !== 'room-created') throw new Error('expected room-created first');
  const setup = event.setup as { white: string[]; black: string[] } | undefined;
  assert.ok(setup, 'room-created carries the deal');
  assert.equal(setup.white.length, 15);
  assert.equal(setup.black.length, 15);
});

test('the deal is stripped from room-created before any client sees it', () => {
  const created = createTenantRuntimeRoom(revealChessTenant, 'rc_redact', { now: 1 });
  if (!created.ok) throw new Error(created.error);
  const event = created.room.events[0];
  if (event.type !== 'room-created') throw new Error('expected room-created first');

  for (const seat of ['white', 'black'] as const) {
    const clientEvent = revealChessClientEventFor(event, seat, 0);
    assert.ok(clientEvent, `the seat ${seat} still receives room-created`);
    assert.equal(clientEvent.type, 'room-created');
    assert.ok(!('setup' in clientEvent), `no deal leaks to ${seat}`);
  }
  // /room/ never reveals: spectators receive no events.
  assert.equal(revealChessClientEventFor(event, 'spectator', 0), null);
});

test('replay reconstructs the same deal from the persisted setup', () => {
  const created = createTenantRuntimeRoom(revealChessTenant, 'rc_replay', { now: 1 });
  if (!created.ok) throw new Error(created.error);

  const replayed = replayTenantEvents(revealChessTenant, created.room.events);
  assert.deepEqual(replayed.state.board, created.room.projection.state.board);
  assert.equal(Object.keys(replayed.state.board).length, 32);
});

test('the client view masks every face-down identity; spectators see nothing', () => {
  const created = createTenantRuntimeRoom(revealChessTenant, 'rc_view', { now: 1 });
  if (!created.ok) throw new Error(created.error);
  const state = created.room.projection.state;

  const view = getRevealChessClientView(state, { id: 'c', seat: 'white', solo: false });
  // Only the two kings are face-up at the start; everything else is masked.
  const revealed = Object.values(view.board).filter((entry) => entry && !entry.faceDown);
  assert.equal(revealed.length, 2);
  const a1 = view.board.a1;
  assert.ok(a1 && a1.faceDown === true);
  assert.ok(!('role' in a1), 'a masked entry carries no role');

  const spectator = getRevealChessClientView(state, { id: 's', seat: 'spectator', solo: false });
  assert.equal(Object.keys(spectator.board).length, 0);
});

// ── The hidden-info redaction regression ─────────────────────────────────────
// White captures a still-FACE-DOWN black piece. The non-owner (white = the
// capturer) learns the role; the former owner (black) learns nothing. And a
// still-face-down black piece's identity never reaches white's board view.
test('a face-down piece is masked for the non-owner and capturer-only in captures', () => {
  // White rook (revealed) on a3 captures a black piece dealt face-down (true
  // queen) sitting on a7. After the capture the rook reveals on a7; the captured
  // black piece is recorded with full truth in state.captures.
  const board: RevealChessBoard = {
    e1: { color: 'white', role: 'king', faceDown: false },
    e8: { color: 'black', role: 'king', faceDown: false },
    a3: { color: 'white', role: 'rook', faceDown: false },
    // Black face-down piece (true queen, never moved -> identity hidden to white).
    a7: { color: 'black', role: 'queen', faceDown: true },
    // A second black face-down piece that is NEVER captured -> stays hidden.
    h7: { color: 'black', role: 'knight', faceDown: true },
  };
  const captured = applyRevealChessMove(makeState(board, 'white'), { from: 'a3', to: 'a7' });
  assert.equal(captured.captures.length, 1, 'the capture is recorded');

  const whiteView = getRevealChessClientView(captured, { id: 'w', seat: 'white', solo: false });
  const blackView = getRevealChessClientView(captured, { id: 'b', seat: 'black', solo: false });

  // Black's surviving face-down piece on h7 is faceDown with NO role for white —
  // the non-owner never learns an unrevealed identity.
  const whiteH7 = whiteView.board.h7;
  assert.ok(whiteH7);
  assert.equal(whiteH7.faceDown, true);
  assert.equal('role' in whiteH7, false);

  // Captured-pool reveal is capturer-only. White captured the black face-down
  // piece, so white learns its true role (queen)...
  assert.deepEqual(whiteView.captured, [{ owner: 'black', role: 'queen' }]);
  // ...but black (the former owner of the still-face-down piece) learns nothing:
  // the captured entry is masked with role:null.
  assert.deepEqual(blackView.captured, [{ owner: 'black', role: null }]);

  // Sanity: no per-color board entry leaks the opponent's hidden role. Black
  // never moved, so the ONLY legitimately revealed black piece is the always
  // face-up king; any other revealed black identity in white's view is a leak.
  for (const [square, entry] of Object.entries(whiteView.board)) {
    if (entry && entry.faceDown === false && entry.color === 'black' && entry.role !== 'king') {
      assert.fail(`white view leaks a revealed black identity on ${square}`);
    }
  }
});

test('moveFromMessage: promotion is optional, present-but-invalid is rejected', () => {
  const { moveFromMessage } = revealChessTenant.rules;
  // Absent promotion is NOT a rejection — the kernel defaults to queen.
  assert.deepEqual(moveFromMessage({ from: 'a7', to: 'a8' }), { from: 'a7', to: 'a8' });
  // A valid promotion is carried through.
  assert.deepEqual(moveFromMessage({ from: 'a7', to: 'a8', promotion: 'rook' }), {
    from: 'a7',
    to: 'a8',
    promotion: 'rook',
  });
  // king/pawn are not promotion roles -> rejected.
  assert.equal(moveFromMessage({ from: 'a7', to: 'a8', promotion: 'king' }), null);
  assert.equal(moveFromMessage({ from: 'a7', to: 'a8', promotion: 'pawn' }), null);
  // Non-square coordinates are rejected.
  assert.equal(moveFromMessage({ from: 'z9', to: 'a8' }), null);
});

test('a full reveal-chess game replays through the runtime identically to the kernel', () => {
  const roomId = 'rc_game';
  // A fixed deal makes the scripted line reproducible.
  const events: TenantRoomEvent<'white' | 'black', RevealChessMove, typeof REVEAL_CHESS_SPEC_ID>[] =
    [
      {
        type: 'room-created',
        at: 1,
        roomId,
        gameSpecId: REVEAL_CHESS_SPEC_ID,
        setup: STANDARD_REVEAL_CHESS_DEAL,
      },
      { type: 'seat-assigned', at: 2, roomId, clientId: 'w', seat: 'white' },
      { type: 'seat-assigned', at: 3, roomId, clientId: 'b', seat: 'black' },
    ];

  // Drive a deterministic line with the kernel (first legal move each ply),
  // recording the move-played events the runtime will replay.
  let kernelState = createInitialRevealChessState(roomId, STANDARD_REVEAL_CHESS_DEAL);
  let at = 4;
  let plies = 0;
  while (kernelState.status.type === 'playing' && plies < 40) {
    const move = getRevealChessLegalMoves(kernelState)[0];
    if (!move) break;
    events.push({ type: 'move-played', at: at++, roomId, color: kernelState.status.turn, move });
    kernelState = applyRevealChessMove(kernelState, move);
    plies += 1;
  }
  assert.ok(plies > 0, 'the scripted line made progress');

  // The generic runtime, driven by the tenant, must reach the same canonical
  // state the kernel did — proving the tenant's move path integrates correctly.
  const projection = replayTenantEvents(revealChessTenant, events);
  assert.deepEqual(projection.state, kernelState);
});

// wire.snapshotExtras: Reveal Chess has no engine, so a room is always PvP. The
// extras must always report roomMode:'pvp' (no engine to rematch against).
test('reveal-chess snapshot always reports roomMode:pvp (no engine seat)', () => {
  const snapshotExtras = revealChessTenant.wire?.snapshotExtras;
  assert.ok(snapshotExtras, 'reveal-chess tenant must define wire.snapshotExtras');
  assert.deepEqual(snapshotExtras({} as never, { seat: 'white' } as never), { roomMode: 'pvp' });
});

// The valid GameTermination values, kept in sync with the games_termination_check
// CHECK constraint. A termination() output outside this set throws at the DB write,
// silently dropping the finished game. Reveal Chess's no-progress draw clock spells
// its reason 'no-progress-clock' and its threefold 'threefold-repetition', neither of
// which is a GameTermination ('progress-clock' and 'repetition' are).
const VALID_GAME_TERMINATIONS = new Set([
  'king-captured',
  'general-captured',
  'timeout',
  'checkmate',
  'draw',
  'resignation',
  'engine-failure',
  'worker-aborted',
  'server-restarted',
  'abandoned',
  'abandonment',
  'no-legal-moves',
  'stalemate',
  'repetition',
  'progress-clock',
  'truncated',
  'race',
]);

test('every reveal-chess kernel end reason maps to a persistable GameTermination', () => {
  // The full RevealChessGameEndReason union. If a reason is added to the kernel,
  // add it here too — termination() must translate each into a value the DB
  // CHECK accepts.
  const revealChessEndReasons = [
    'checkmate',
    'stalemate',
    'no-progress-clock',
    'threefold-repetition',
    'timeout',
    'resignation',
    'abandonment',
  ];
  for (const reason of revealChessEndReasons) {
    const mapped = revealChessTenant.persistence.termination(reason);
    assert.ok(
      VALID_GAME_TERMINATIONS.has(mapped),
      `reveal-chess termination(${reason}) -> ${mapped} is not a persistable GameTermination`,
    );
  }
  // The two translated reasons specifically — the ones that would be dropped.
  assert.equal(revealChessTenant.persistence.termination('no-progress-clock'), 'progress-clock');
  assert.equal(revealChessTenant.persistence.termination('threefold-repetition'), 'repetition');
});
