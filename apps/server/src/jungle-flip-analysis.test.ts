import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyJungleFlipMove,
  createInitialJungleFlipState,
  getJungleFlipLegalMoves,
  type JungleFlipDeal,
  type JungleFlipMove,
  STANDARD_JUNGLE_FLIP_DEAL,
} from '@mistboard/game';
import type { SweepPlyEval } from './game-analysis-sweep.js';
import { VacuousAnalysisError } from './game-analysis-sweep.js';
import {
  analyzeJungleFlipPostgame,
  JUNGLE_FLIP_ANALYSIS_ENGINE_ID,
  type JungleFlipAnalysisCache,
  type JungleFlipGameAnalysis,
  resolveJungleFlipAnalysis,
} from './jungle-flip-analysis.js';

// The fixed standard deal makes reconstruction deterministic; a few real legal moves off it
// (opening flips) keep the game in the playing phase — exactly what exercises the per-ply
// evaluate path.
function openingMoves(deal: JungleFlipDeal, count: number): JungleFlipMove[] {
  let state = createInitialJungleFlipState('t', deal);
  const moves: JungleFlipMove[] = [];
  for (let i = 0; i < count; i += 1) {
    const move = getJungleFlipLegalMoves(state)[0]!;
    moves.push(move);
    state = applyJungleFlipMove(state, move);
  }
  return moves;
}

function memoryCache(): JungleFlipAnalysisCache & { saves: number } {
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

test('analyzeJungleFlipPostgame reconstructs N+1 plies from the deal and evaluates each', async () => {
  const moves = openingMoves(STANDARD_JUNGLE_FLIP_DEAL, 4);
  const seenTurns: string[] = [];
  const analysis = await analyzeJungleFlipPostgame(
    moves,
    STANDARD_JUNGLE_FLIP_DEAL,
    async (state) => {
      assert.equal(state.status.type, 'playing');
      seenTurns.push(state.status.type === 'playing' ? state.status.turn : 'x');
      return { cp: 42, mate: null, best: 'z' };
    },
  );

  assert.equal(analysis.plies.length, moves.length + 1);
  analysis.plies.forEach((ply, i) => {
    assert.equal(ply.ply, i);
  });
  // Red seat moves first; a flip passes the turn, so the mover alternates.
  assert.deepEqual(seenTurns, ['red', 'black', 'red', 'black', 'red']);
  assert.ok(analysis.plies.every((ply) => ply.cp === 42));
  assert.equal(analysis.engineId, JUNGLE_FLIP_ANALYSIS_ENGINE_ID);
});

test('resolveJungleFlipAnalysis: pure cache read misses without computing', async () => {
  const cache = memoryCache();
  let computes = 0;
  const analyze = async (): Promise<JungleFlipGameAnalysis> => {
    computes += 1;
    return { engineId: JUNGLE_FLIP_ANALYSIS_ENGINE_ID, depth: 12, plies: [] };
  };
  const result = await resolveJungleFlipAnalysis(
    'room-a',
    [],
    STANDARD_JUNGLE_FLIP_DEAL,
    cache,
    analyze,
    false,
  );
  assert.equal(result, null);
  assert.equal(computes, 0);
  assert.equal(cache.saves, 0);
});

test('resolveJungleFlipAnalysis computes once, persists, then serves from cache', async () => {
  const cache = memoryCache();
  let computes = 0;
  const analyze = async (): Promise<JungleFlipGameAnalysis> => {
    computes += 1;
    return {
      engineId: JUNGLE_FLIP_ANALYSIS_ENGINE_ID,
      depth: 12,
      plies: [{ ply: 0, cp: 0, mate: null, best: null }],
    };
  };
  const first = await resolveJungleFlipAnalysis(
    'room-b',
    [],
    STANDARD_JUNGLE_FLIP_DEAL,
    cache,
    analyze,
    true,
  );
  assert.ok(first);
  assert.equal(computes, 1);
  assert.equal(cache.saves, 1);

  const second = await resolveJungleFlipAnalysis(
    'room-b',
    [],
    STANDARD_JUNGLE_FLIP_DEAL,
    cache,
    analyze,
    true,
  );
  assert.ok(second);
  assert.equal(computes, 1);
  assert.deepEqual(second!.plies, first!.plies);
});

test('resolveJungleFlipAnalysis coalesces concurrent viewers into one compute', async () => {
  const cache = memoryCache();
  let computes = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const analyze = async (): Promise<JungleFlipGameAnalysis> => {
    computes += 1;
    await gate;
    return { engineId: JUNGLE_FLIP_ANALYSIS_ENGINE_ID, depth: 12, plies: [] };
  };
  const a = resolveJungleFlipAnalysis(
    'room-c',
    [],
    STANDARD_JUNGLE_FLIP_DEAL,
    cache,
    analyze,
    true,
  );
  const b = resolveJungleFlipAnalysis(
    'room-c',
    [],
    STANDARD_JUNGLE_FLIP_DEAL,
    cache,
    analyze,
    true,
  );
  release();
  await Promise.all([a, b]);
  assert.equal(computes, 1);
  assert.equal(cache.saves, 1);
});

test('resolveJungleFlipAnalysis fails closed on a scoreless sweep: throws and caches nothing', async () => {
  const cache = memoryCache();
  const analyze = async (): Promise<JungleFlipGameAnalysis> => ({
    engineId: JUNGLE_FLIP_ANALYSIS_ENGINE_ID,
    depth: 12,
    plies: [
      { ply: 0, cp: null, mate: null, best: 'a0b0' },
      { ply: 1, cp: null, mate: null, best: 'c0d0' },
    ],
  });
  await assert.rejects(
    resolveJungleFlipAnalysis('room-vacuous', [], STANDARD_JUNGLE_FLIP_DEAL, cache, analyze, true),
    VacuousAnalysisError,
  );
  assert.equal(cache.saves, 0);
});

test('JUNGLE_FLIP_ANALYSIS_ENGINE_ID is a stable, version-tagged identifier', () => {
  assert.match(JUNGLE_FLIP_ANALYSIS_ENGINE_ID, /^misty-jungle-flip-analysis@/);
});
