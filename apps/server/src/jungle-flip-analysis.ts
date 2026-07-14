// Whole-game "Computer analysis" for Flip Jungle (兽棋 / 翻翻棋): a fixed-strength eval of
// every ply, normalized to the RED SEAT's POV, cached + coalesced. Mirrors banqi-analysis.ts
// (both are symmetric hidden-deal variants): reconstruction needs the per-game DEAL (from the
// room-created event) to rebuild each position, and the engine is fed the REDACTED (as-played
// info-state) FEN — jungle-flip-fen.ts emits `X` for a face-down tile (hiding role AND ink),
// so the engine never learns a hidden id, exactly as during live play.
//
// The backend is the MistyJungleFlip Rust binary ONLY (no fallback): we read its `info …
// score` via evaluateJungleFlipFenNodes. A missing binary fails closed at the route (503),
// and an all-null sweep throws VacuousAnalysisError (never cached).

import {
  applyJungleFlipMove,
  createInitialJungleFlipState,
  type JungleFlipDeal,
  type JungleFlipGameState,
  type JungleFlipMove,
  type JungleFlipSeat,
} from '@mistboard/game';
import {
  isVacuousAnalysis,
  type SweepPlyEval,
  VacuousAnalysisError,
} from './game-analysis-sweep.js';
import { evaluateJungleFlipFenNodes, JUNGLE_FLIP_ENGINE_VERSION } from './jungle-flip-engine.js';
import { jungleFlipStateToEngineFen } from './jungle-flip-fen.js';
import * as persistence from './persistence.js';

// Search budget. Node budget = CPU-independent strength, so the eval is reproducible across
// boxes (stable cache) and bounded in time and memory (an analysis sweep can't run away).
const JUNGLE_FLIP_ANALYSIS_NODES = 512_000;
const JUNGLE_FLIP_ANALYSIS_MOVETIME_CAP_MS = 4_000;

// Nominal cache dimension: `depth` only has to be STABLE for the (room, engine, depth) cache
// key (the real dial is nodes, encoded in the engine id). Kept at the family default.
export const JUNGLE_FLIP_ANALYSIS_DEPTH = 12;

// Red-SEAT-POV cp for a decisive finished position (no engine query is made there).
const TERMINAL_CP = 30_000;

// Cache engine id, version-suffixed so an engine/config change invalidates stored evals.
export const JUNGLE_FLIP_ANALYSIS_ENGINE_ID = `misty-jungle-flip-analysis@${JUNGLE_FLIP_ENGINE_VERSION}`;

export type JungleFlipPositionEval = {
  /** Centipawns from the RED SEAT's POV (positive = Red better); null when mate is set. */
  cp: number | null;
  /** Signed moves-to-mate from the RED SEAT's POV; null otherwise. */
  mate: number | null;
  /** Best move in engine UCI ("a0b0", flip "a0a0"); already our coords. */
  best: string | null;
};

/**
 * Evaluate a single PLAYING flip-jungle position with the MistyJungleFlip engine, normalized
 * to the RED SEAT's POV. The engine reports the score from the side-to-move POV, and
 * side-to-move IS the mover seat, so we flip the sign when Black is to move. Throws (via
 * jungleFlipEnginePath) when the binary is absent; callers pre-check and fail closed.
 */
export async function evaluateJungleFlipPosition(
  state: JungleFlipGameState,
): Promise<JungleFlipPositionEval> {
  const mover: JungleFlipSeat = state.status.type === 'playing' ? state.status.turn : 'red';
  const sign = mover === 'red' ? 1 : -1;
  const evaluation = await evaluateJungleFlipFenNodes(jungleFlipStateToEngineFen(state), {
    nodes: JUNGLE_FLIP_ANALYSIS_NODES,
    movetimeCapMs: JUNGLE_FLIP_ANALYSIS_MOVETIME_CAP_MS,
  });
  return {
    cp: evaluation.cp == null ? null : evaluation.cp * sign,
    mate: evaluation.mate == null ? null : evaluation.mate * sign,
    best: evaluation.best,
  };
}

// Red-SEAT-POV decisive eval for a finished position: the winner seat is known and no engine
// is queried. `winner` is a SEAT (red = first mover), already in the sweep's red-seat POV.
function terminalPlyEval(ply: number, state: JungleFlipGameState): SweepPlyEval {
  if (state.status.type !== 'finished') return { ply, cp: 0, mate: null, best: null };
  const winner = state.status.winner;
  const cp = winner === 'red' ? TERMINAL_CP : winner === 'black' ? -TERMINAL_CP : 0;
  return { ply, cp, mate: null, best: null };
}

export type JungleFlipGameAnalysis = {
  engineId: string;
  depth: number;
  plies: SweepPlyEval[];
};

/**
 * Reconstruct every ply from the per-game DEAL + move list and evaluate it (red-seat POV).
 * Ply 0 is the initial position; ply k is the position after k moves. Reconstruction uses the
 * SAME kernel the live game did (createInitialJungleFlipState(deal) + applyJungleFlipMove), so
 * flip-reveals reproduce exactly (a flip is a move with from === to). `evaluate` is injectable
 * so tests drive the sweep without an engine.
 */
export async function analyzeJungleFlipPostgame(
  moves: readonly JungleFlipMove[],
  deal: JungleFlipDeal,
  evaluate: (
    state: JungleFlipGameState,
  ) => Promise<JungleFlipPositionEval> = evaluateJungleFlipPosition,
): Promise<JungleFlipGameAnalysis> {
  let state = createInitialJungleFlipState('analysis', deal);
  const states: JungleFlipGameState[] = [state];
  for (const move of moves) {
    state = applyJungleFlipMove(state, move);
    states.push(state);
  }
  const plies: SweepPlyEval[] = [];
  for (let ply = 0; ply < states.length; ply += 1) {
    const s = states[ply]!;
    if (s.status.type !== 'playing') {
      plies.push(terminalPlyEval(ply, s));
      continue;
    }
    const evaluation = await evaluate(s);
    plies.push({ ply, cp: evaluation.cp, mate: evaluation.mate, best: evaluation.best });
  }
  return {
    engineId: JUNGLE_FLIP_ANALYSIS_ENGINE_ID,
    depth: JUNGLE_FLIP_ANALYSIS_DEPTH,
    plies,
  };
}

// ── Cache-first, coalesced resolution (mirrors resolveBanqiAnalysis) ───────────────

export type JungleFlipAnalysisCache = {
  get(roomId: string, engineId: string, depth: number): Promise<SweepPlyEval[] | null>;
  save(roomId: string, engineId: string, depth: number, plies: SweepPlyEval[]): Promise<void>;
};

const liveAnalysisCache: JungleFlipAnalysisCache = {
  get: (roomId, engineId, depth) => persistence.getGameAnalysis(roomId, engineId, depth),
  save: (roomId, engineId, depth, plies) =>
    persistence.saveGameAnalysis(roomId, engineId, depth, plies),
};

const inflightAnalysis = new Map<string, Promise<JungleFlipGameAnalysis>>();

/**
 * Cache-first, coalesced whole-game analysis. A finished game's eval series is immutable given
 * (room, engine, depth): serve a stored result immediately, else compute once (sharing one
 * in-flight promise), persist it, and return. `computeIfMissing = false` makes it a pure cache
 * read (204-on-miss for GET). A scoreless (all-null) sweep throws VacuousAnalysisError and is
 * never cached, so a fixed engine can recompute later.
 */
export async function resolveJungleFlipAnalysis(
  roomId: string,
  moves: readonly JungleFlipMove[],
  deal: JungleFlipDeal,
  cache: JungleFlipAnalysisCache = liveAnalysisCache,
  analyze?: (
    moves: readonly JungleFlipMove[],
    deal: JungleFlipDeal,
  ) => Promise<JungleFlipGameAnalysis>,
  computeIfMissing = true,
): Promise<JungleFlipGameAnalysis | null> {
  const engineId = JUNGLE_FLIP_ANALYSIS_ENGINE_ID;
  const depth = JUNGLE_FLIP_ANALYSIS_DEPTH;

  const cached = await cache.get(roomId, engineId, depth);
  if (cached) return { engineId, depth, plies: cached };
  if (!computeIfMissing) return null;

  const key = `${roomId}\0${engineId}\0${depth}`;
  const existing = inflightAnalysis.get(key);
  if (existing) return existing;

  const compute = (async () => {
    const analysis = analyze
      ? await analyze(moves, deal)
      : await analyzeJungleFlipPostgame(moves, deal);
    // Fail closed on a scoreless sweep: never cache a vacuous (all-null) series — it would
    // render as a flawless game forever. Throwing keeps the key uncached so a fixed engine
    // recomputes; the route maps this to 503 analysis_engine_unavailable.
    if (isVacuousAnalysis(analysis.plies)) throw new VacuousAnalysisError('jungle-flip');
    await cache.save(roomId, engineId, depth, analysis.plies);
    return analysis;
  })();
  inflightAnalysis.set(key, compute);
  try {
    return await compute;
  } finally {
    inflightAnalysis.delete(key);
  }
}
