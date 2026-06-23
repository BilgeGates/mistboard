import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInitialXiangqiState,
  getLegalMoves as getXiangqiLegalMoves,
  type XiangqiGameState,
} from '@mistboard/game';
import { buildXiangqiEngineTurnRequest, buildXiangqiObservationForPly } from './build-xiangqi.js';

test('DXQ request: geometry, color mapping, and variant tag', () => {
  const state = createInitialXiangqiState('dxq-geo');
  const req = buildXiangqiEngineTurnRequest({
    gameId: 'dxq-geo',
    engineId: 'python-fdx-v1.0',
    engineSecret: 'test-secret',
    engineColor: 'red',
    state,
    events: [],
    ply: 0,
    clockRemainingMs: 60_000,
    incrementMs: 1_000,
  });

  assert.equal(req.gameSpecId, 'dark-xiangqi');
  assert.equal(req.protocolVersion, '1');
  assert.equal(req.color, 'white');
  for (const obs of req.observationTranscript ?? []) {
    for (const [idx] of obs.visible_pieces)
      assert.ok(idx >= 0 && idx <= 89, `idx ${idx} out of 9x10`);
  }
  const expected = new Set(getXiangqiLegalMoves(state).map((m) => `${m.from}${m.to}`));
  assert.equal(req.legalMoves.length, expected.size);
  for (const m of req.legalMoves) assert.ok(expected.has(`${m.from}${m.to}`));
});

test('DXQ observation uses 9-wide indexing through i10 and a 90-bit mask', () => {
  const state: XiangqiGameState = {
    ...createInitialXiangqiState('dxq-i10'),
    board: {
      i1: { color: 'red', role: 'chariot' },
      i10: { color: 'black', role: 'chariot' },
      a10: { color: 'black', role: 'general' },
    },
    status: { type: 'playing', turn: 'red' },
  };
  const obs = buildXiangqiObservationForPly({
    prevState: null,
    nextState: state,
    move: null,
    perspective: 'red',
    ply: 0,
  });

  const visible = new Set(obs.visible_pieces.map(([idx]) => idx));
  assert.ok(visible.has(8), 'i1 should be idx 8');
  assert.ok(visible.has(89), 'i10 should be idx 89');
  assert.equal(visible.has(81), false, 'a10 should stay hidden off the i-file');
  const mask = BigInt(obs.visibility_mask);
  assert.equal((mask & (1n << 89n)) !== 0n, true);
  assert.equal((mask & (1n << 81n)) !== 0n, false);
});
