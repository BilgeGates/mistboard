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
  analyzeJieqiDecisions,
  analyzeJieqiPostgame,
  JIEQI_ANALYSIS_ENGINE_ID,
  JIEQI_DECISIONS_ENGINE_ID,
  type JieqiAnalysisCache,
  type JieqiDecision,
  type JieqiDecisionsCache,
  type JieqiGameAnalysis,
  jieqiChancePlies,
  resolveJieqiAnalysis,
  resolveJieqiDecisions,
} from './jieqi-analysis.js';
import { jieqiMoveToPikafishUci } from './jieqi-fen.js';
import type { UciMultiPvLine } from './uci-engine-harness.js';

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

// ── Decision-vs-luck decomposition (Layer 2) ──────────────────────────────────────

// The initial position is all-dark but the generals, so the first legal move is (almost always)
// a reveal — a good single-reveal fixture. Returns the move + its Pikafish UCI.
function firstRevealMove(deal: JieqiDeal): { move: JieqiMove; uci: string } {
  const state = createInitialJieqiState('t', deal);
  const move = getJieqiLegalMoves(state).find((m) => state.board[m.from]?.faceDown === true)!;
  return { move, uci: jieqiMoveToPikafishUci(move) };
}

function mpvLine(index: number, move: string, cp: number): UciMultiPvLine {
  return { index, move, cp, mate: null, depth: 10 };
}

test('analyzeJieqiDecisions: played move found in the MultiPV table (best = rank 1)', async () => {
  const { move, uci } = firstRevealMove(STANDARD_JIEQI_DEAL);
  const otherUci = uci === 'a9a8' ? 'a0a1' : 'a9a8'; // any move id distinct from the played one
  let moveEvCalls = 0;
  const decisions = await analyzeJieqiDecisions(
    [move],
    STANDARD_JIEQI_DEAL,
    // Layer-1 red-seat sweep: ply 1 is +200 for Red; mover of ply 1 is Red, so realized = +200.
    [
      { ply: 0, cp: 0, mate: null, best: null },
      { ply: 1, cp: 200, mate: null, best: null },
    ],
    {
      multiPv: async () => [mpvLine(1, otherUci, 300), mpvLine(2, uci, 120)],
      moveEv: async () => {
        moveEvCalls += 1;
        return { cp: -999, mate: null };
      },
    },
  );
  assert.equal(decisions.length, 1);
  const d = decisions[0]!;
  assert.equal(d.ply, 1);
  assert.equal(d.mover, 'red');
  assert.equal(d.best.cp, 300);
  assert.equal(d.played.cp, 120);
  assert.equal(d.playedRank, 2);
  assert.equal(d.realized.cp, 200);
  // Decision loss (best − played) is a non-negative ceiling; luck (realized − played) is signed.
  assert.equal(d.best.cp! - d.played.cp!, 180);
  assert.equal(moveEvCalls, 0); // found in the table, no fallback
});

test('analyzeJieqiDecisions: played move outside the table falls back to searchmoves', async () => {
  const { move, uci } = firstRevealMove(STANDARD_JIEQI_DEAL);
  let moveEvCalls = 0;
  let askedMove: string | null = null;
  const decisions = await analyzeJieqiDecisions(
    [move],
    STANDARD_JIEQI_DEAL,
    [
      { ply: 0, cp: 0, mate: null, best: null },
      { ply: 1, cp: 0, mate: null, best: null },
    ],
    {
      // A table that does NOT contain the played move.
      multiPv: async () => [mpvLine(1, 'z9z8', 300), mpvLine(2, 'y9y8', 250)],
      moveEv: async (_fen, m) => {
        moveEvCalls += 1;
        askedMove = m;
        return { cp: 99, mate: null };
      },
    },
  );
  const d = decisions[0]!;
  assert.equal(d.best.cp, 300);
  assert.equal(d.played.cp, 99);
  assert.equal(d.playedRank, null); // outside the table
  assert.equal(moveEvCalls, 1);
  assert.equal(askedMove, uci);
});

function decisionsMemoryCache(): JieqiDecisionsCache & { saves: number } {
  const store = new Map<string, JieqiDecision[]>();
  const cache = {
    saves: 0,
    async get(roomId: string, engineId: string, depth: number) {
      return store.get(`${roomId}:${engineId}:${depth}`) ?? null;
    },
    async save(roomId: string, engineId: string, depth: number, decisions: JieqiDecision[]) {
      cache.saves += 1;
      store.set(`${roomId}:${engineId}:${depth}`, decisions);
    },
  };
  return cache;
}

const sampleDecision = (ply: number): JieqiDecision => ({
  ply,
  mover: ply % 2 === 1 ? 'red' : 'black',
  best: { cp: 200, mate: null },
  played: { cp: 120, mate: null },
  realized: { cp: 90, mate: null },
  playedRank: 2,
});

test('resolveJieqiDecisions: pure cache read misses without computing', async () => {
  const cache = decisionsMemoryCache();
  let computes = 0;
  const analyze = async (): Promise<JieqiDecision[]> => {
    computes += 1;
    return [];
  };
  const result = await resolveJieqiDecisions(
    'room-d',
    [],
    STANDARD_JIEQI_DEAL,
    [],
    cache,
    analyze,
    false,
  );
  assert.equal(result, null);
  assert.equal(computes, 0);
  assert.equal(cache.saves, 0);
});

test('resolveJieqiDecisions computes once, persists, then serves from cache', async () => {
  const cache = decisionsMemoryCache();
  let computes = 0;
  const analyze = async (): Promise<JieqiDecision[]> => {
    computes += 1;
    return [sampleDecision(3)];
  };
  const first = await resolveJieqiDecisions('room-e', [], STANDARD_JIEQI_DEAL, [], cache, analyze);
  assert.ok(first);
  assert.equal(first!.engineId, JIEQI_DECISIONS_ENGINE_ID);
  assert.equal(computes, 1);
  assert.equal(cache.saves, 1);

  const second = await resolveJieqiDecisions('room-e', [], STANDARD_JIEQI_DEAL, [], cache, analyze);
  assert.equal(computes, 1);
  assert.deepEqual(second!.decisions, first!.decisions);
});

test('resolveJieqiDecisions coalesces concurrent viewers into one compute', async () => {
  const cache = decisionsMemoryCache();
  let computes = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const analyze = async (): Promise<JieqiDecision[]> => {
    computes += 1;
    await gate;
    return [sampleDecision(1)];
  };
  const a = resolveJieqiDecisions('room-f', [], STANDARD_JIEQI_DEAL, [], cache, analyze);
  const b = resolveJieqiDecisions('room-f', [], STANDARD_JIEQI_DEAL, [], cache, analyze);
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(computes, 1);
  assert.equal(cache.saves, 1);
  assert.deepEqual(ra!.decisions, rb!.decisions);
});

test('resolveJieqiDecisions fails closed when reveals exist but every bestEV is null', async () => {
  const cache = decisionsMemoryCache();
  const analyze = async (): Promise<JieqiDecision[]> => [
    { ...sampleDecision(1), best: { cp: null, mate: null } },
    { ...sampleDecision(3), best: { cp: null, mate: null } },
  ];
  await assert.rejects(
    resolveJieqiDecisions('room-vac', [], STANDARD_JIEQI_DEAL, [], cache, analyze),
    VacuousAnalysisError,
  );
  assert.equal(cache.saves, 0);
});

test('resolveJieqiDecisions caches an empty result (a game with no reveal plies)', async () => {
  const cache = decisionsMemoryCache();
  const analyze = async (): Promise<JieqiDecision[]> => [];
  const result = await resolveJieqiDecisions(
    'room-empty',
    [],
    STANDARD_JIEQI_DEAL,
    [],
    cache,
    analyze,
  );
  assert.ok(result);
  assert.deepEqual(result!.decisions, []);
  assert.equal(cache.saves, 1); // empty is a valid, cacheable result — not vacuous
});

test('analyzeJieqiDecisions: only reveal plies, with per-mover POV on realized', async () => {
  const { moves, chance } = playGame(STANDARD_JIEQI_DEAL, 8);
  // Red-seat sweep with a distinct value per ply so the POV projection is checkable.
  const realizedRedSeat: SweepPlyEval[] = Array.from({ length: moves.length + 1 }, (_, ply) => ({
    ply,
    cp: ply * 10,
    mate: null,
    best: null,
  }));
  const decisions = await analyzeJieqiDecisions([...moves], STANDARD_JIEQI_DEAL, realizedRedSeat, {
    multiPv: async () => [mpvLine(1, 'no-match', 0)],
    moveEv: async () => ({ cp: 0, mate: null }),
  });
  // Decisions land exactly on the reveal plies jieqiChancePlies reports.
  assert.deepEqual(
    decisions.map((d) => d.ply),
    chance,
  );
  for (const d of decisions) {
    const sign = d.mover === 'red' ? 1 : -1;
    // realized is the red-seat sweep at this ply, reprojected onto the mover's POV.
    assert.equal(d.realized.cp, sign * d.ply * 10);
    assert.equal(d.mover, d.ply % 2 === 1 ? 'red' : 'black');
  }
});
