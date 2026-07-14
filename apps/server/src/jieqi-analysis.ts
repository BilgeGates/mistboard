// Whole-game "Computer analysis" for Jieqi (揭棋 / Reveal Xiangqi): a fixed-strength eval of
// every ply, normalized to the RED SEAT's POV, cached + coalesced. Mirrors banqi-analysis.ts,
// with two jieqi-specific wrinkles:
//
//   1. Jieqi hides face-down piece IDENTITIES (positions are public), so reconstruction needs
//      the per-game DEAL (from the room-created event) to rebuild each position, and the engine
//      is fed the REDACTED (as-played info-state) FEN — jieqi-fen.ts emits `X`/`x` for a
//      face-down piece, so the engine never learns a hidden id, exactly as during live play.
//   2. A REVEAL is coupled to a normal move (a face-down piece reveals its identity WHEN it
//      moves — there is no separate from===to flip as in banqi). So a "chance" ply is a move
//      whose source piece was face-down beforehand; jieqiChancePlies() detects those by replay.
//
// The backend is the PikaJieQi (Pikafish jieqi_old) binary ONLY (no in-process fallback): we
// read its `info … score` via evaluateJieqiFen. Unlike the 3 custom engines, Pikafish already
// emits a score, so no engine change was needed — jieqi was analysis-ready. A missing binary
// fails closed at the route (503), and an all-null sweep throws VacuousAnalysisError (never
// cached) — so a broken or score-less engine can't cache a flat, mistake-free game.

import {
  applyJieqiMove,
  createInitialJieqiState,
  type JieqiColor,
  type JieqiDeal,
  type JieqiGameState,
  type JieqiMove,
} from '@mistboard/game';
import {
  isVacuousAnalysis,
  type SweepPlyEval,
  VacuousAnalysisError,
} from './game-analysis-sweep.js';
import { evaluateJieqiFen, JIEQI_ENGINE_VERSION } from './jieqi-engine.js';
import { jieqiStateToPikafishFen } from './jieqi-fen.js';
import * as persistence from './persistence.js';

// Search budget. A fixed DEPTH is CPU-independent in RESULT (the eval at a given depth is the
// same tree on any box), so the cached analysis stays stable; the movetime cap only bounds
// per-ply latency on a slow box. Depth 12 is a touch deeper than the "strong" PvE tier (10),
// which is appropriate for a one-shot review pass.
const JIEQI_ANALYSIS_DEPTH_SEARCH = 12;
const JIEQI_ANALYSIS_MOVETIME_CAP_MS = 4_000;

// Nominal cache dimension: `depth` only has to be STABLE for the (room, engine, depth) cache
// key. Kept at the family default (banqi/jungle use 12 too).
export const JIEQI_ANALYSIS_DEPTH = 12;

// Red-SEAT-POV cp for a decisive finished position (no engine query is made there).
const TERMINAL_CP = 30_000;

// Cache engine id, version-suffixed so an engine/config change invalidates stored evals.
export const JIEQI_ANALYSIS_ENGINE_ID = `pikafish-jieqi-analysis@${JIEQI_ENGINE_VERSION}`;

export type JieqiPositionEval = {
  /** Centipawns from the RED SEAT's POV (positive = Red better); null when mate is set. */
  cp: number | null;
  /** Signed moves-to-mate from the RED SEAT's POV; null otherwise. */
  mate: number | null;
  /** Best move in Pikafish UCI (rank 0..9, e.g. "e7a7"); the engine's own dialect. */
  best: string | null;
};

/**
 * Evaluate a single PLAYING jieqi position with PikaJieQi, normalized to the RED SEAT's POV.
 * Pikafish reports the score from the side-to-move POV, and side-to-move IS the mover seat
 * (the FEN's stm field just encodes that seat), so we flip the sign when Black is to move —
 * exactly as banqi/jungle do. Throws (via pikaJieqiPath) when the binary is absent; callers
 * pre-check availability and fail closed.
 */
export async function evaluateJieqiPosition(state: JieqiGameState): Promise<JieqiPositionEval> {
  const mover: JieqiColor = state.status.type === 'playing' ? state.status.turn : 'red';
  const sign = mover === 'red' ? 1 : -1;
  const evaluation = await evaluateJieqiFen(jieqiStateToPikafishFen(state), {
    depth: JIEQI_ANALYSIS_DEPTH_SEARCH,
    movetimeMs: JIEQI_ANALYSIS_MOVETIME_CAP_MS,
  });
  return {
    cp: evaluation.cp == null ? null : evaluation.cp * sign,
    mate: evaluation.mate == null ? null : evaluation.mate * sign,
    best: evaluation.best,
  };
}

// Red-SEAT-POV decisive eval for a finished position: the game is over, so the winner seat is
// known and no engine is queried. `winner` is a SEAT (red = first mover), so this is already
// in the red-seat POV the sweep normalizes to. A drawn finish (no-capture clock) scores 0.
function terminalPlyEval(ply: number, state: JieqiGameState): SweepPlyEval {
  if (state.status.type !== 'finished') return { ply, cp: 0, mate: null, best: null };
  const winner = state.status.winner;
  const cp = winner === 'red' ? TERMINAL_CP : winner === 'black' ? -TERMINAL_CP : 0;
  return { ply, cp, mate: null, best: null };
}

export type JieqiGameAnalysis = {
  engineId: string;
  depth: number;
  plies: SweepPlyEval[];
};

/**
 * Reconstruct every ply from the per-game DEAL + move list and evaluate it (red-seat POV).
 * Ply 0 is the initial position; ply k is the position after k moves. Reconstruction uses the
 * SAME kernel the live game did (createInitialJieqiState(deal) + applyJieqiMove), so reveals
 * reproduce exactly (a face-down piece reveals its dealt identity the first time it moves).
 * `evaluate` is injectable so tests drive the sweep without an engine.
 */
export async function analyzeJieqiPostgame(
  moves: readonly JieqiMove[],
  deal: JieqiDeal,
  evaluate: (state: JieqiGameState) => Promise<JieqiPositionEval> = evaluateJieqiPosition,
): Promise<JieqiGameAnalysis> {
  let state = createInitialJieqiState('analysis', deal);
  const states: JieqiGameState[] = [state];
  for (const move of moves) {
    state = applyJieqiMove(state, move);
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
  return { engineId: JIEQI_ANALYSIS_ENGINE_ID, depth: JIEQI_ANALYSIS_DEPTH, plies };
}

/**
 * The 1-based plies whose move REVEALED a face-down piece (a chance event). In jieqi a reveal
 * is coupled to a normal move — the moving piece turns face-up — so we detect it by replaying
 * the deal and checking whether the piece on the move's source square was face-down just before
 * the move. Those plies conflate the decision (which piece to activate, where) with the luck
 * (what it revealed to), so the client leaves them UNJUDGED until the decision-vs-luck
 * decomposition lands. Pure kernel replay (no engine), deterministic from (moves, deal).
 *
 * Note: capturing an opponent's dark piece is treated as a normal (graded) move here — only the
 * MOVER revealing its OWN piece is a chance ply, matching banqi (the flipper reveals its tile).
 */
export function jieqiChancePlies(moves: readonly JieqiMove[], deal: JieqiDeal): number[] {
  let state = createInitialJieqiState('analysis', deal);
  const chance: number[] = [];
  moves.forEach((move, i) => {
    const source = state.board[move.from];
    if (source?.faceDown) chance.push(i + 1);
    state = applyJieqiMove(state, move);
  });
  return chance;
}

// ── Cache-first, coalesced resolution (mirrors resolveBanqiAnalysis) ──────────────

// Cache read/write, injectable for tests. Live impl reads/writes the variant-agnostic
// game_analysis table (no-ops when persistence is disabled).
export type JieqiAnalysisCache = {
  get(roomId: string, engineId: string, depth: number): Promise<SweepPlyEval[] | null>;
  save(roomId: string, engineId: string, depth: number, plies: SweepPlyEval[]): Promise<void>;
};

const liveAnalysisCache: JieqiAnalysisCache = {
  get: (roomId, engineId, depth) => persistence.getGameAnalysis(roomId, engineId, depth),
  save: (roomId, engineId, depth, plies) =>
    persistence.saveGameAnalysis(roomId, engineId, depth, plies),
};

// One in-flight compute per (room, engine, depth) so concurrent viewers don't run the
// whole-game sweep twice; cleared in `finally` so a failed compute never wedges the key.
const inflightAnalysis = new Map<string, Promise<JieqiGameAnalysis>>();

/**
 * Cache-first, coalesced whole-game analysis. A finished game's eval series is immutable given
 * (room, engine, depth): serve a stored result immediately, else compute once (sharing one
 * in-flight promise), persist it, and return. `computeIfMissing = false` makes it a pure cache
 * read (204-on-miss for the GET path). A scoreless (all-null) sweep throws VacuousAnalysisError
 * and is never cached, so a fixed engine can recompute later.
 */
export async function resolveJieqiAnalysis(
  roomId: string,
  moves: readonly JieqiMove[],
  deal: JieqiDeal,
  cache: JieqiAnalysisCache = liveAnalysisCache,
  analyze?: (moves: readonly JieqiMove[], deal: JieqiDeal) => Promise<JieqiGameAnalysis>,
  computeIfMissing = true,
): Promise<JieqiGameAnalysis | null> {
  const engineId = JIEQI_ANALYSIS_ENGINE_ID;
  const depth = JIEQI_ANALYSIS_DEPTH;

  const cached = await cache.get(roomId, engineId, depth);
  if (cached) return { engineId, depth, plies: cached };
  if (!computeIfMissing) return null;

  const key = `${roomId}\0${engineId}\0${depth}`;
  const existing = inflightAnalysis.get(key);
  if (existing) return existing;

  const compute = (async () => {
    const analysis = analyze ? await analyze(moves, deal) : await analyzeJieqiPostgame(moves, deal);
    // Fail closed on a scoreless sweep: never cache a vacuous (all-null) series — it would
    // render as a flawless game forever. Throwing keeps the key uncached so a fixed engine
    // recomputes; the route maps this to 503 analysis_engine_unavailable.
    if (isVacuousAnalysis(analysis.plies)) throw new VacuousAnalysisError('jieqi');
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
