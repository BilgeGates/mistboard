import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyBanqiMove,
  type BanqiDeal,
  type BanqiMove,
  createInitialBanqiState,
  getBanqiLegalMoves,
  STANDARD_BANQI_DEAL,
} from '@mistboard/game';
import {
  analyzeBanqiPostgame,
  BANQI_ANALYSIS_ENGINE_ID,
  type BanqiAnalysisCache,
  type BanqiGameAnalysis,
  resolveBanqiAnalysis,
} from './banqi-analysis.js';
import type { SweepPlyEval } from './game-analysis-sweep.js';
import { VacuousAnalysisError } from './game-analysis-sweep.js';

// The fixed standard deal makes reconstruction deterministic; a few real legal moves off it
// (opening flips) keep the game in the playing phase — exactly what exercises the per-ply
// evaluate path.
function openingMoves(deal: BanqiDeal, count: number): BanqiMove[] {
  let state = createInitialBanqiState('t', deal);
  const moves: BanqiMove[] = [];
  for (let i = 0; i < count; i += 1) {
    const move = getBanqiLegalMoves(state)[0]!;
    moves.push(move);
    state = applyBanqiMove(state, move);
  }
  return moves;
}

function memoryCache(): BanqiAnalysisCache & { saves: number } {
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

test('analyzeBanqiPostgame reconstructs N+1 plies from the deal and evaluates each position', async () => {
  const moves = openingMoves(STANDARD_BANQI_DEAL, 4);
  const seenTurns: string[] = [];
  const analysis = await analyzeBanqiPostgame(moves, STANDARD_BANQI_DEAL, async (state) => {
    assert.equal(state.status.type, 'playing');
    seenTurns.push(state.status.type === 'playing' ? state.status.turn : 'x');
    return { cp: 42, mate: null, best: 'z' };
  });

  // Ply 0 (initial) .. ply N (after the last move): N+1 contiguous points.
  assert.equal(analysis.plies.length, moves.length + 1);
  analysis.plies.forEach((ply, i) => {
    assert.equal(ply.ply, i);
  });
  // Red seat moves first; a flip passes the turn, so the mover alternates.
  assert.deepEqual(seenTurns, ['red', 'black', 'red', 'black', 'red']);
  assert.ok(analysis.plies.every((ply) => ply.cp === 42));
  assert.equal(analysis.engineId, BANQI_ANALYSIS_ENGINE_ID);
});

test('resolveBanqiAnalysis: pure cache read misses without computing', async () => {
  const cache = memoryCache();
  let computes = 0;
  const analyze = async (): Promise<BanqiGameAnalysis> => {
    computes += 1;
    return { engineId: BANQI_ANALYSIS_ENGINE_ID, depth: 12, plies: [] };
  };
  const result = await resolveBanqiAnalysis(
    'room-a',
    [],
    STANDARD_BANQI_DEAL,
    cache,
    analyze,
    false,
  );
  assert.equal(result, null);
  assert.equal(computes, 0);
  assert.equal(cache.saves, 0);
});

test('resolveBanqiAnalysis computes once, persists, then serves from cache', async () => {
  const cache = memoryCache();
  let computes = 0;
  const analyze = async (): Promise<BanqiGameAnalysis> => {
    computes += 1;
    return {
      engineId: BANQI_ANALYSIS_ENGINE_ID,
      depth: 12,
      plies: [{ ply: 0, cp: 0, mate: null, best: null }],
    };
  };
  const first = await resolveBanqiAnalysis('room-b', [], STANDARD_BANQI_DEAL, cache, analyze, true);
  assert.ok(first);
  assert.equal(computes, 1);
  assert.equal(cache.saves, 1);

  const second = await resolveBanqiAnalysis(
    'room-b',
    [],
    STANDARD_BANQI_DEAL,
    cache,
    analyze,
    true,
  );
  assert.ok(second);
  assert.equal(computes, 1);
  assert.deepEqual(second!.plies, first!.plies);
});

test('resolveBanqiAnalysis coalesces concurrent viewers into one compute', async () => {
  const cache = memoryCache();
  let computes = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const analyze = async (): Promise<BanqiGameAnalysis> => {
    computes += 1;
    await gate;
    return { engineId: BANQI_ANALYSIS_ENGINE_ID, depth: 12, plies: [] };
  };
  const a = resolveBanqiAnalysis('room-c', [], STANDARD_BANQI_DEAL, cache, analyze, true);
  const b = resolveBanqiAnalysis('room-c', [], STANDARD_BANQI_DEAL, cache, analyze, true);
  release();
  await Promise.all([a, b]);
  assert.equal(computes, 1);
  assert.equal(cache.saves, 1);
});

test('resolveBanqiAnalysis fails closed on a scoreless sweep: throws and caches nothing', async () => {
  const cache = memoryCache();
  const analyze = async (): Promise<BanqiGameAnalysis> => ({
    engineId: BANQI_ANALYSIS_ENGINE_ID,
    depth: 12,
    // Engine emitted moves but no evals — the broken-binary signature.
    plies: [
      { ply: 0, cp: null, mate: null, best: 'a0b0' },
      { ply: 1, cp: null, mate: null, best: 'c0d0' },
    ],
  });
  await assert.rejects(
    resolveBanqiAnalysis('room-vacuous', [], STANDARD_BANQI_DEAL, cache, analyze, true),
    VacuousAnalysisError,
  );
  assert.equal(cache.saves, 0);
});

test('BANQI_ANALYSIS_ENGINE_ID is a stable, version-tagged identifier', () => {
  assert.match(BANQI_ANALYSIS_ENGINE_ID, /^misty-banqi-analysis@/);
});
