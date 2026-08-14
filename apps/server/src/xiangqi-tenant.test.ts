import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInitialXiangqiState,
  getStandardXiangqiLegalMoves,
  type XiangqiGameState,
  type XiangqiMove,
} from '@mistboard/game';
import { xiangqiTenant } from './xiangqi-tenant.js';

// Play a line through the tenant's rules, asserting each move is legal first so
// a failure points at the move rather than at a silently ignored no-op (the
// kernel returns the state unchanged for illegal moves).
function playLine(moves: readonly XiangqiMove[], gameId: string): XiangqiGameState {
  let state = createInitialXiangqiState(gameId);
  for (const [i, move] of moves.entries()) {
    if (state.status.type !== 'playing') break;
    const legal = getStandardXiangqiLegalMoves(state).some(
      (m) => m.from === move.from && m.to === move.to,
    );
    assert.ok(legal, `ply ${i} (${move.from}->${move.to}) should be legal`);
    state = xiangqiTenant.rules.applyMove(state, move);
  }
  return state;
}

test('the tenant scores a perpetual check as a loss for the checker, not a draw', () => {
  // From the real opening position: red swings a chariot to the f-file and
  // checks the black general on every move while it shuffles e9/e8. Under plain
  // threefold this is a draw; every real xiangqi ruleset (AXF/WXF/CXA) scores it
  // as a loss for the side doing the checking.
  const state = playLine(
    [
      { from: 'h3', to: 'e3' }, // red cannon to the centre file
      { from: 'a10', to: 'a9' },
      { from: 'i1', to: 'i3' }, // red chariot up
      { from: 'b8', to: 'b9' },
      { from: 'i3', to: 'f3' }, // red chariot across
      { from: 'e10', to: 'e9' }, // the black general steps off its home point
      { from: 'f3', to: 'f9' }, // check
      { from: 'e9', to: 'e8' },
      { from: 'f9', to: 'f8' }, // check
      { from: 'e8', to: 'e9' },
      { from: 'f8', to: 'f9' }, // check
      { from: 'e9', to: 'e8' },
      { from: 'f9', to: 'f8' }, // check
      { from: 'e8', to: 'e9' },
      { from: 'f8', to: 'f9' }, // check — closes the threefold
    ],
    'xq-perpetual',
  );

  assert.equal(state.status.type, 'finished');
  if (state.status.type === 'finished') {
    assert.equal(state.status.reason, 'chasing');
    assert.equal(state.status.winner, 'black');
  }
});

test('the tenant leaves an honest repetition a draw', () => {
  // The same threefold, with nobody checking: both sides shuffle a chariot.
  const cycle: XiangqiMove[] = [
    { from: 'a1', to: 'a2' },
    { from: 'a10', to: 'a9' },
    { from: 'a2', to: 'a1' },
    { from: 'a9', to: 'a10' },
  ];
  const state = playLine(
    Array.from({ length: cycle.length * 3 }, (_, i) => cycle[i % cycle.length] as XiangqiMove),
    'xq-honest-repetition',
  );

  assert.equal(state.status.type, 'finished');
  if (state.status.type === 'finished') {
    assert.equal(state.status.reason, 'repetition');
    assert.equal(state.status.winner, null);
  }
});

test("'chasing' is a persistable termination for xiangqi", () => {
  // Guards the cast in the tenant's persistence block: a kernel end reason the
  // games-table CHECK constraint does not know about kills the whole finish
  // transaction (migration 114 is the constraint that must list it).
  assert.equal(xiangqiTenant.persistence.termination('chasing'), 'chasing');
});
