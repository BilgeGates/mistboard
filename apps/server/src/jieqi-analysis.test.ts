import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyJieqiMove,
  createInitialJieqiState,
  getJieqiLegalMoves,
  type JieqiDeal,
  type JieqiMove,
  STANDARD_JIEQI_DEAL,
} from '@mistboard/game';
import type { SweepPlyEval } from './game-analysis-sweep.js';
import { VacuousAnalysisError } from './game-analysis-sweep.js';
import {
  analyzeJieqiPostgame,
  JIEQI_ANALYSIS_ENGINE_ID,
  type JieqiAnalysisCache,
  type JieqiGameAnalysis,
  jieqiChancePlies,
  resolveJieqiAnalysis,
} from './jieqi-analysis.js';

// A real, deterministic game off the fixed standard deal. To guarantee the sequence contains
// BOTH reveal plies (moving a face-down piece) and non-reveal plies (moving an already-revealed
// one), we bias selection toward continuing to move the just-moved piece when that is legal —
// otherwise take the first legal move. `chance` records the ground-truth reveal plies (1-based)
// by checking the pre-move face-down state, so the test can compare jieqiChancePlies against it.
function playGame(deal: JieqiDeal, count: number): { moves: JieqiMove[]; chance: number[] } {
  let state = createInitialJieqiState('t', deal);
  const moves: JieqiMove[] = [];
  const chance: number[] = [];
  let lastTo: string | null = null;
  for (let i = 0; i < count; i += 1) {
    const legal = getJieqiLegalMoves(state);
    if (legal.length === 0) break;
    const move = legal.find((m) => m.from === lastTo) ?? legal[0]!;
    if (state.board[move.from]?.faceDown) chance.push(i + 1);
    moves.push(move);
    state = applyJieqiMove(state, move);
    lastTo = move.to;
  }
  return { moves, chance };
}

function memoryCache(): JieqiAnalysisCache & { saves: number } {
  const store = new Map<string, SweepPlyEval[]>();
  const cache = {
    saves: 0,
    async get(roomId: string, engineId: string, depth: number) {
      return store.get(`${roomId}:${engineId}:${depth}`) ?? null;
    },
    async save(roomId: string, engineId: string, depth: number, plies: SweepPlyEval[]) {
      cache.saves += 1;
      store.set(`${roomId}:${engineId}:${depth}`, plies);
    },
  };
  return cache;
}

test('analyzeJieqiPostgame reconstructs N+1 plies from the deal and evaluates each position', async () => {
  const { moves } = playGame(STANDARD_JIEQI_DEAL, 6);
  const seenTurns: string[] = [];
  const analysis = await analyzeJieqiPostgame(moves, STANDARD_JIEQI_DEAL, async (state) => {
    assert.equal(state.status.type, 'playing');
    seenTurns.push(state.status.type === 'playing' ? state.status.turn : 'x');
    return { cp: 42, mate: null, best: 'z' };
  });

  // Ply 0 (initial) .. ply N (after the last move): N+1 contiguous points.
  assert.equal(analysis.plies.length, moves.length + 1);
  analysis.plies.forEach((ply, i) => {
    assert.equal(ply.ply, i);
  });
  // Every PLAYING state ply 0..N is evaluated, so seenTurns has N+1 entries. Red moves first
  // and the mover alternates every ply (xiangqi has no pass), so ply k is red on even k.
  assert.deepEqual(seenTurns, ['red', 'black', 'red', 'black', 'red', 'black', 'red']);
  assert.ok(analysis.plies.every((ply) => ply.cp === 42));
  assert.equal(analysis.engineId, JIEQI_ANALYSIS_ENGINE_ID);
});

test('jieqiChancePlies flags reveals (dark-piece moves), not already-revealed moves', async () => {
  const { moves, chance } = playGame(STANDARD_JIEQI_DEAL, 12);
  // Reveals happen (a dark piece must eventually move), so the set is non-empty...
  assert.ok(chance.length > 0, 'expected some reveal (chance) plies');
  // ...but not every ply is a reveal: face-up pieces (generals) and the biased generator's
  // "keep moving the just-moved piece" both produce already-revealed, graded moves.
  assert.ok(chance.length < moves.length, 'expected some non-reveal (graded) plies');
  // jieqiChancePlies re-derives exactly the same set by an independent replay.
  assert.deepEqual(jieqiChancePlies(moves, STANDARD_JIEQI_DEAL), chance);
});

test('resolveJieqiAnalysis: pure cache read misses without computing', async () => {
  const cache = memoryCache();
  let computes = 0;
  const analyze = async (): Promise<JieqiGameAnalysis> => {
    computes += 1;
    return { engineId: JIEQI_ANALYSIS_ENGINE_ID, depth: 12, plies: [] };
  };
  const result = await resolveJieqiAnalysis(
    'room-a',
    [],
    STANDARD_JIEQI_DEAL,
    cache,
    analyze,
    false,
  );
  assert.equal(result, null);
  assert.equal(computes, 0);
  assert.equal(cache.saves, 0);
});

test('resolveJieqiAnalysis computes once, persists, then serves from cache', async () => {
  const cache = memoryCache();
  let computes = 0;
  const analyze = async (): Promise<JieqiGameAnalysis> => {
    computes += 1;
    return {
      engineId: JIEQI_ANALYSIS_ENGINE_ID,
      depth: 12,
      plies: [{ ply: 0, cp: 0, mate: null, best: null }],
    };
  };
  const first = await resolveJieqiAnalysis('room-b', [], STANDARD_JIEQI_DEAL, cache, analyze, true);
  assert.ok(first);
  assert.equal(computes, 1);
  assert.equal(cache.saves, 1);

  const second = await resolveJieqiAnalysis(
    'room-b',
    [],
    STANDARD_JIEQI_DEAL,
    cache,
    analyze,
    true,
  );
  assert.ok(second);
  assert.equal(computes, 1);
  assert.deepEqual(second!.plies, first!.plies);
});

test('resolveJieqiAnalysis coalesces concurrent viewers into one compute', async () => {
  const cache = memoryCache();
  let computes = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const analyze = async (): Promise<JieqiGameAnalysis> => {
    computes += 1;
    await gate;
    return { engineId: JIEQI_ANALYSIS_ENGINE_ID, depth: 12, plies: [] };
  };
  const a = resolveJieqiAnalysis('room-c', [], STANDARD_JIEQI_DEAL, cache, analyze, true);
  const b = resolveJieqiAnalysis('room-c', [], STANDARD_JIEQI_DEAL, cache, analyze, true);
  release();
  await Promise.all([a, b]);
  assert.equal(computes, 1);
  assert.equal(cache.saves, 1);
});

test('resolveJieqiAnalysis fails closed on a scoreless sweep: throws and caches nothing', async () => {
  const cache = memoryCache();
  const analyze = async (): Promise<JieqiGameAnalysis> => ({
    engineId: JIEQI_ANALYSIS_ENGINE_ID,
    depth: 12,
    // Engine emitted moves but no evals — the broken-binary signature.
    plies: [
      { ply: 0, cp: null, mate: null, best: 'a0b0' },
      { ply: 1, cp: null, mate: null, best: 'c0d0' },
    ],
  });
  await assert.rejects(
    resolveJieqiAnalysis('room-vacuous', [], STANDARD_JIEQI_DEAL, cache, analyze, true),
    VacuousAnalysisError,
  );
  assert.equal(cache.saves, 0);
});

test('JIEQI_ANALYSIS_ENGINE_ID is a stable, version-tagged identifier', () => {
  assert.match(JIEQI_ANALYSIS_ENGINE_ID, /^pikafish-jieqi-analysis@/);
});
