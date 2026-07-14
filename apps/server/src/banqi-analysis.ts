// Whole-game "Computer analysis" for Banqi (半棋): a fixed-strength eval of every ply,
// normalized to the RED SEAT's POV, cached + coalesced. Mirrors jungle-analysis.ts, with
// one banqi-specific wrinkle: banqi hides face-down tile IDENTITIES, so reconstruction
// needs the per-game DEAL (from the room-created event) to rebuild each position, and the
// engine is fed the REDACTED (as-played info-state) FEN — banqi-fen.ts emits `X` for a
// face-down tile, so the engine never learns a hidden id, exactly as during live play.
//
// The backend is the MistyBanqi Rust binary ONLY (no in-process fallback): we read its
// `info … score` via evaluateBanqiFenNodes. A missing binary fails closed at the route
// (503), and an all-null sweep throws VacuousAnalysisError (never cached) — so a broken or
// score-less engine can't cache a flat, mistake-free game.

import {
  applyBanqiMove,
  type BanqiDeal,
  type BanqiGameState,
  type BanqiMove,
  type BanqiSeat,
  createInitialBanqiState,
} from '@mistboard/game';
import { BANQI_ENGINE_VERSION, evaluateBanqiFenNodes } from './banqi-engine.js';
import { banqiStateToEngineFen } from './banqi-fen.js';
import {
  isVacuousAnalysis,
  type SweepPlyEval,
  VacuousAnalysisError,
} from './game-analysis-sweep.js';
import * as persistence from './persistence.js';

// Search budget. Node budget = CPU-independent strength, so the eval is reproducible across
// boxes (stable cache) and bounded in time and memory (an analysis sweep can't run away).
const BANQI_ANALYSIS_NODES = 500_000;
const BANQI_ANALYSIS_MOVETIME_CAP_MS = 4_000;

// Nominal cache dimension: `depth` only has to be STABLE for the (room, engine, depth) cache
// key (banqi's real dial is nodes, encoded in the engine id). Kept at the family default.
export const BANQI_ANALYSIS_DEPTH = 12;

// Red-SEAT-POV cp for a decisive finished position (no engine query is made there).
const TERMINAL_CP = 30_000;

// Cache engine id, version-suffixed so an engine/config change invalidates stored evals.
export const BANQI_ANALYSIS_ENGINE_ID = `misty-banqi-analysis@${BANQI_ENGINE_VERSION}`;

export type BanqiPositionEval = {
  /** Centipawns from the RED SEAT's POV (positive = Red better); null when mate is set. */
  cp: number | null;
  /** Signed moves-to-mate from the RED SEAT's POV; null otherwise. */
  mate: number | null;
  /** Best move in engine UCI ("a0b0", flip "a0a0"); already our coords. */
  best: string | null;
};

/**
 * Evaluate a single PLAYING banqi position with the MistyBanqi engine, normalized to the
 * RED SEAT's POV. The engine reports the score from the side-to-move POV, and side-to-move
 * IS the mover seat (the FEN's ink turn field just encodes that seat), so we flip the sign
 * when Black is to move — exactly as jungle does. Throws (via banqiEnginePath) when the
 * binary is absent; callers pre-check availability and fail closed.
 */
export async function evaluateBanqiPosition(state: BanqiGameState): Promise<BanqiPositionEval> {
  const mover: BanqiSeat = state.status.type === 'playing' ? state.status.turn : 'red';
  const sign = mover === 'red' ? 1 : -1;
  const evaluation = await evaluateBanqiFenNodes(banqiStateToEngineFen(state), {
    nodes: BANQI_ANALYSIS_NODES,
    movetimeCapMs: BANQI_ANALYSIS_MOVETIME_CAP_MS,
  });
  return {
    cp: evaluation.cp == null ? null : evaluation.cp * sign,
    mate: evaluation.mate == null ? null : evaluation.mate * sign,
    best: evaluation.best,
  };
}

// Red-SEAT-POV decisive eval for a finished position: the game is over, so the winner seat
// is known and no engine is queried. `winner` is a SEAT (red = first mover), so this is
// already in the red-seat POV the sweep normalizes to.
function terminalPlyEval(ply: number, state: BanqiGameState): SweepPlyEval {
  if (state.status.type !== 'finished') return { ply, cp: 0, mate: null, best: null };
  const winner = state.status.winner;
  const cp = winner === 'red' ? TERMINAL_CP : winner === 'black' ? -TERMINAL_CP : 0;
  return { ply, cp, mate: null, best: null };
}

export type BanqiGameAnalysis = {
  engineId: string;
  depth: number;
  plies: SweepPlyEval[];
};

/**
 * Reconstruct every ply from the per-game DEAL + move list and evaluate it (red-seat POV).
 * Ply 0 is the initial position; ply k is the position after k moves. Reconstruction uses
 * the SAME kernel the live game did (createInitialBanqiState(deal) + applyBanqiMove), so
 * flip-reveals reproduce exactly (a flip is a move with from === to, revealing the deal's
 * tile deterministically). `evaluate` is injectable so tests drive the sweep without an
 * engine.
 */
export async function analyzeBanqiPostgame(
  moves: readonly BanqiMove[],
  deal: BanqiDeal,
  evaluate: (state: BanqiGameState) => Promise<BanqiPositionEval> = evaluateBanqiPosition,
): Promise<BanqiGameAnalysis> {
  let state = createInitialBanqiState('analysis', deal);
  const states: BanqiGameState[] = [state];
  for (const move of moves) {
    state = applyBanqiMove(state, move);
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
  return { engineId: BANQI_ANALYSIS_ENGINE_ID, depth: BANQI_ANALYSIS_DEPTH, plies };
}

// ── Cache-first, coalesced resolution (mirrors resolveJungleAnalysis) ──────────────

// Cache read/write, injectable for tests. Live impl reads/writes the variant-agnostic
// game_analysis table (no-ops when persistence is disabled).
export type BanqiAnalysisCache = {
  get(roomId: string, engineId: string, depth: number): Promise<SweepPlyEval[] | null>;
  save(roomId: string, engineId: string, depth: number, plies: SweepPlyEval[]): Promise<void>;
};

const liveAnalysisCache: BanqiAnalysisCache = {
  get: (roomId, engineId, depth) => persistence.getGameAnalysis(roomId, engineId, depth),
  save: (roomId, engineId, depth, plies) =>
    persistence.saveGameAnalysis(roomId, engineId, depth, plies),
};

// One in-flight compute per (room, engine, depth) so concurrent viewers don't run the
// whole-game sweep twice; cleared in `finally` so a failed compute never wedges the key.
const inflightAnalysis = new Map<string, Promise<BanqiGameAnalysis>>();

/**
 * Cache-first, coalesced whole-game analysis. A finished game's eval series is immutable
 * given (room, engine, depth): serve a stored result immediately, else compute once
 * (sharing one in-flight promise), persist it, and return. `computeIfMissing = false` makes
 * it a pure cache read (204-on-miss for the GET path). A scoreless (all-null) sweep throws
 * VacuousAnalysisError and is never cached, so a fixed engine can recompute later.
 */
export async function resolveBanqiAnalysis(
  roomId: string,
  moves: readonly BanqiMove[],
  deal: BanqiDeal,
  cache: BanqiAnalysisCache = liveAnalysisCache,
  analyze?: (moves: readonly BanqiMove[], deal: BanqiDeal) => Promise<BanqiGameAnalysis>,
  computeIfMissing = true,
): Promise<BanqiGameAnalysis | null> {
  const engineId = BANQI_ANALYSIS_ENGINE_ID;
  const depth = BANQI_ANALYSIS_DEPTH;

  const cached = await cache.get(roomId, engineId, depth);
  if (cached) return { engineId, depth, plies: cached };
  if (!computeIfMissing) return null;

  const key = `${roomId}\0${engineId}\0${depth}`;
  const existing = inflightAnalysis.get(key);
  if (existing) return existing;

  const compute = (async () => {
    const analysis = analyze ? await analyze(moves, deal) : await analyzeBanqiPostgame(moves, deal);
    // Fail closed on a scoreless sweep: never cache a vacuous (all-null) series — it would
    // render as a flawless game forever. Throwing keeps the key uncached so a fixed engine
    // recomputes; the route maps this to 503 analysis_engine_unavailable.
    if (isVacuousAnalysis(analysis.plies)) throw new VacuousAnalysisError('banqi');
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
