// Whole-game postgame analysis for xiangqi (P3.2). Evaluates every position of a
// finished game so the client can draw the advantage chart, mark move judgments,
// and score accuracy. Orchestration only — the eval work is evaluateXiangqiPosition
// (Pikafish, Red POV, fixed depth), gated through the shared engine pool, so the
// plies run sequentially rather than stampeding the engine.

import {
  evaluateXiangqiPosition,
  XIANGQI_ANALYSIS_DEPTH,
  type XiangqiPositionEval,
} from './xiangqi-pikafish-engine.js';

// Version of the ANALYSIS configuration (binary + net + the fixed-depth Red-POV
// sweep), independent of the PvE ladder's XIANGQI_ENGINE_VERSION (nodes/movetime
// tiers never apply to analysis, which runs `go depth N`). Bump whenever the
// analysis output would change so stored evals invalidate.
export const XIANGQI_ANALYSIS_ENGINE_VERSION = 1;

// Cache engine id, version-suffixed so an engine/config change invalidates stored
// evals (the sibling pattern: JIEQI/BANQI/JUNGLE_ANALYSIS_ENGINE_ID). Xiangqi
// analyses were historically cached under the PvE bot id (XIANGQI_DEFAULT_ENGINE_ID),
// so the 2026-07-10 ladder rename ('pikafish-xiangqi-strong' -> 'pikafish-xiangqi-
// level-5') silently orphaned every cached row; migration 104 maps both old ids
// onto this dedicated id.
export const XIANGQI_ANALYSIS_ENGINE_ID = `pikafish-xiangqi-analysis@${XIANGQI_ANALYSIS_ENGINE_VERSION}`;

export type PlyEval = {
  /** Position AFTER this many plies (0 = start position). */
  ply: number;
  /** Centipawns from Red's POV; null when mate is set. */
  cp: number | null;
  /** Signed moves-to-mate from Red's POV; null otherwise. */
  mate: number | null;
  /** Engine best move at this position (engine UCI). */
  best: string | null;
};

export type AnalyzeXiangqiGameOptions = {
  depth?: number;
  /** Injectable for tests; defaults to the real Pikafish eval. */
  evaluate?: (moves: string[], opts: { depth?: number }) => Promise<XiangqiPositionEval>;
};

/**
 * Evaluate positions after 0, 1, … N plies (N+1 points) and return the Red-POV
 * series. `movesUci` is the game's move history in Pikafish UCI (the caller builds
 * it from the timeline via xiangqiMoveToPikafishUci).
 */
export async function analyzeXiangqiGame(
  movesUci: readonly string[],
  opts: AnalyzeXiangqiGameOptions = {},
): Promise<PlyEval[]> {
  const depth = opts.depth ?? XIANGQI_ANALYSIS_DEPTH;
  const evaluate = opts.evaluate ?? evaluateXiangqiPosition;
  const evals: PlyEval[] = [];
  for (let ply = 0; ply <= movesUci.length; ply += 1) {
    const evaluation = await evaluate(movesUci.slice(0, ply), { depth });
    evals.push({ ply, cp: evaluation.cp, mate: evaluation.mate, best: evaluation.best });
  }
  return evals;
}
