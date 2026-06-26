import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInitialJungleState,
  getJungleLegalMoves,
  type JungleBoard,
  type JungleColor,
  type JungleGameState,
  type JunglePiece,
  type JunglePieceRole,
} from '@mistboard/game';
import { chooseJungleEngineMove, JUNGLE_PLAYABLE_ENGINES } from './server-jungle-engine.js';

const LEVEL_1 = JUNGLE_PLAYABLE_ENGINES[0]!;
const LEVEL_2 = JUNGLE_PLAYABLE_ENGINES[1]!;
const LEVEL_3 = JUNGLE_PLAYABLE_ENGINES[2]!;

function p(color: JungleColor, role: JunglePieceRole): JunglePiece {
  return { color, role };
}

function playing(board: JungleBoard, turn: JungleColor = 'red'): JungleGameState {
  return {
    id: 'engine-test',
    board,
    status: { type: 'playing', turn },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
}

test('engine returns a legal move from the opening for every tier', () => {
  const state = createInitialJungleState('g');
  for (const tier of [LEVEL_1, LEVEL_2, LEVEL_3]) {
    const move = chooseJungleEngineMove(state, tier);
    assert.ok(move, `tier ${tier.id} produced a move`);
    assert.ok(
      getJungleLegalMoves(state).some((m) => m.from === move!.from && m.to === move!.to),
      `tier ${tier.id} move ${move!.from}-${move!.to} is legal`,
    );
  }
});

test('engine plays the winning den entry when one is available', () => {
  // Red wolf one step from Black's den (d9). Taking it wins outright.
  const state = playing({ d8: p('red', 'wolf'), a7: p('black', 'rat') });
  const move = chooseJungleEngineMove(state, LEVEL_2);
  assert.deepEqual(move, { from: 'd8', to: 'd9' });
});

test('engine takes a winning capture (last enemy piece) over a quiet move', () => {
  // Red elephant can capture Black's only piece (the lion) → win by capture.
  const state = playing({ a5: p('red', 'elephant'), a6: p('black', 'lion') });
  const move = chooseJungleEngineMove(state, LEVEL_2);
  assert.deepEqual(move, { from: 'a5', to: 'a6' });
});

test('engine grabs free material when nothing is forced', () => {
  // Red tiger can capture an undefended Black leopard on the d-file (all land);
  // both sides keep other pieces so it is not an instant win, just the best move.
  const state = playing({
    d3: p('red', 'tiger'),
    d4: p('black', 'leopard'),
    g1: p('red', 'lion'),
    g9: p('black', 'elephant'),
  });
  const move = chooseJungleEngineMove(state, LEVEL_2);
  assert.deepEqual(move, { from: 'd3', to: 'd4' });
});

test('level 3 (depth 4) search stays responsive from the opening', () => {
  const state = createInitialJungleState('g');
  const started = process.hrtime.bigint();
  const move = chooseJungleEngineMove(state, LEVEL_3);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(move, 'level 3 produced a move');
  assert.ok(elapsedMs < 3000, `level 3 opening search took ${elapsedMs.toFixed(0)}ms (<3000)`);
});
