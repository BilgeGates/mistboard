import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyMiniXiangqiMove,
  createInitialMiniXiangqiState,
  getMiniXiangqiLegalMoves,
  getMiniXiangqiPlayerView,
  miniXiangqiCoordOf,
  type MiniXiangqiColor,
  type MiniXiangqiSquare,
} from '@mistboard/game';
import type { DarkMiniXiangqiEvent } from '../dark-mini-xiangqi-runtime.js';
import { buildMiniXiangqiEngineTurnRequest } from './build-mini-xiangqi.js';

function miniIndex(sq: MiniXiangqiSquare): number {
  const { file, rank } = miniXiangqiCoordOf(sq);
  return (rank - 1) * 7 + file;
}

/** Deterministically play `plies` first-legal moves, returning the move-played
 * event log + the resulting (current) state. */
function playGame(gameId: string, plies: number) {
  let state = createInitialMiniXiangqiState(gameId);
  const events: DarkMiniXiangqiEvent[] = [];
  for (let i = 0; i < plies; i += 1) {
    if (state.status.type !== 'playing') break;
    const legal = getMiniXiangqiLegalMoves(state);
    if (legal.length === 0) break;
    const move = legal[0];
    events.push({ type: 'move-played', at: i, roomId: gameId, color: state.status.turn, move });
    state = applyMiniXiangqiMove(state, move);
  }
  return { events, state };
}

test('DMX request: geometry, color mapping, and variant tag', () => {
  const { events, state } = playGame('g-geo', 4);
  assert.equal(state.status.type, 'playing');
  const engineColor = (state.status as { turn: MiniXiangqiColor }).turn;
  const req = buildMiniXiangqiEngineTurnRequest({
    gameId: 'g-geo',
    engineId: 'python-dmx-v1.0',
    engineSecret: 'test-secret',
    engineColor,
    state,
    events,
    ply: events.length,
    clockRemainingMs: 60_000,
    incrementMs: 1_000,
  });

  assert.equal(req.gameSpecId, 'dark-mini-xiangqi');
  assert.equal(req.protocolVersion, '1');
  // red = first player = white slot.
  assert.equal(req.color, engineColor === 'red' ? 'white' : 'black');
  // Square indices stay within the 7×7 board (0..48), proving 7-wide geometry.
  for (const obs of req.observationTranscript ?? []) {
    for (const [idx] of obs.visible_pieces) assert.ok(idx >= 0 && idx <= 48, `idx ${idx} out of 7x7`);
  }
  // legalMoves equals the perspective's own legal moves.
  const expected = new Set(getMiniXiangqiLegalMoves(state).map((m) => `${m.from}${m.to}`));
  assert.equal(req.legalMoves.length, expected.size);
  for (const m of req.legalMoves) assert.ok(expected.has(`${m.from}${m.to}`));
});

test('DMX request: REDACTION — no hidden enemy piece leaks; own pieces all visible', () => {
  const { events, state } = playGame('g-redact', 6);
  assert.equal(state.status.type, 'playing');
  const engineColor = (state.status as { turn: MiniXiangqiColor }).turn;
  const oppColor: MiniXiangqiColor = engineColor === 'red' ? 'black' : 'red';
  const protoOwn = engineColor === 'red' ? 'white' : 'black';

  const req = buildMiniXiangqiEngineTurnRequest({
    gameId: 'g-redact',
    engineId: 'python-dmx-v1.0',
    engineSecret: 'test-secret',
    engineColor,
    state,
    events,
    ply: events.length,
    clockRemainingMs: 60_000,
    incrementMs: 1_000,
  });

  // The last transcript observation reflects the current (post-last-move) state.
  const last = (req.observationTranscript ?? []).at(-1);
  assert.ok(last);

  // Ground truth vs what the engine can see (the platform's tested fog fn).
  const view = getMiniXiangqiPlayerView(state, engineColor);
  const visibleIdx = new Set(view.visibleSquares.map(miniIndex));

  // (a) Every reported square — piece or shrouded — is genuinely visible.
  for (const [idx] of last.visible_pieces) assert.ok(visibleIdx.has(idx), `leaked visible piece @ ${idx}`);
  for (const [idx] of last.shrouded ?? []) assert.ok(visibleIdx.has(idx), `leaked shrouded @ ${idx}`);

  // (b) No enemy piece sitting on a NON-visible truth square appears anywhere in
  //     the request. This is the core redaction guarantee.
  const reported = new Set<number>([
    ...last.visible_pieces.map(([i]) => i),
    ...(last.shrouded ?? []).map(([i]) => i),
  ]);
  let hiddenEnemies = 0;
  for (const [sq, piece] of Object.entries(state.board) as Array<[MiniXiangqiSquare, { color: MiniXiangqiColor }]>) {
    if (!piece || piece.color !== oppColor) continue;
    const idx = miniIndex(sq);
    if (!visibleIdx.has(idx)) {
      hiddenEnemies += 1;
      assert.ok(!reported.has(idx), `REDACTION LEAK: hidden enemy @ ${sq} (idx ${idx}) leaked`);
    }
  }
  // Fog must actually be hiding something — otherwise the test is vacuous.
  assert.ok(hiddenEnemies > 0, 'expected at least one fogged enemy piece');

  // (c) The engine sees ALL of its own pieces (own pieces are deterministic).
  const ownVisible = new Set(last.visible_pieces.filter(([, p]) => p.color === protoOwn).map(([i]) => i));
  for (const [sq, piece] of Object.entries(state.board) as Array<[MiniXiangqiSquare, { color: MiniXiangqiColor }]>) {
    if (piece?.color === engineColor) assert.ok(ownVisible.has(miniIndex(sq)), `own piece @ ${sq} missing`);
  }

  // (d) shrouded entries are color-only (type withheld) — structurally a [idx, color] pair.
  for (const entry of last.shrouded ?? []) {
    assert.equal(entry.length, 2);
    assert.ok(entry[1] === 'white' || entry[1] === 'black');
  }
});
