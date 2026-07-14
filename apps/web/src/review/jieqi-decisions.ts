// Client side of the jieqi decision-vs-luck decomposition (Layer 2). The server returns, per
// REVEAL ply, three mover-POV eval points — best (the decision ceiling), played (the choice,
// before the dice), realized (the truth, after the dice). Here we turn those into the two honest
// numbers the UI shows: a DECISION-quality glyph (graded, feeds nothing but insight for now) and a
// LUCK value (the reveal's variance, shown but never graded). This is the counterpart to
// game-analysis.ts, kept separate because the decomposition is a heavier, opt-in tier.
import { accuracyPercent, type MoveJudgment, moveJudgment, winPercent } from '@mistboard/game';

/** One eval point from the server: {cp, mate} from the MOVER's POV. */
export type JieqiDecisionEvalPoint = { cp: number | null; mate: number | null };

/** One reveal ply's raw decomposition inputs (mirrors the server JieqiDecision). */
export type JieqiDecision = {
  ply: number;
  mover: 'red' | 'black';
  best: JieqiDecisionEvalPoint;
  played: JieqiDecisionEvalPoint;
  realized: JieqiDecisionEvalPoint;
  /** The played move's MultiPV rank (1 = it WAS the best), or null if it fell outside the table. */
  playedRank: number | null;
};

export type JieqiDecisionsResponse = {
  engineId: string;
  depth: number;
  decisions: JieqiDecision[];
};

// Deadband in centipawns. Under jieqi's noisy no-net eval the top reveals cluster within ~30cp
// (probe-verified), so a decision loss below this floor is engine noise, not a real mistake — we
// leave it UNJUDGED. This is the same discipline that stopped the eval-swing over-flagging, now
// applied to decision loss: never call a choice "wrong" when it's within the engine's own noise.
const DECISION_NOISE_CP = 40;

/** A reveal ply's derived, display-ready decision-vs-luck view (all in win% except the rank). */
export type DecisionView = {
  ply: number;
  mover: 'red' | 'black';
  /** Decision-quality glyph from the win% the CHOICE gave up (null = fine, or within noise). */
  judgment: MoveJudgment;
  /** Win% the choice gave up vs the best move (>= 0). */
  decisionLoss: number;
  /** Win% the reveal swung vs its own expectation (signed: + lucky, - unlucky). */
  luck: number;
  /** Per-decision accuracy in [0, 100] (lila's win%-drop curve, best -> played). */
  accuracy: number;
  /** The played move's rank among reveals (1 = best), or null when outside the MultiPV table. */
  playedRank: number | null;
};

export function decisionView(d: JieqiDecision): DecisionView {
  const bestWin = winPercent(d.best.cp, d.best.mate);
  const playedWin = winPercent(d.played.cp, d.played.mate);
  const realizedWin = winPercent(d.realized.cp, d.realized.mate);
  // cp-space deadband: near-even ranking noise must not flag. A mate/played-null case can't use
  // cp, so it falls through to the win% judgment (missing a forced mate IS a real decision error).
  const withinNoise =
    d.best.cp != null && d.played.cp != null && d.best.cp - d.played.cp < DECISION_NOISE_CP;
  return {
    ply: d.ply,
    mover: d.mover,
    judgment: withinNoise ? null : moveJudgment(bestWin, playedWin),
    decisionLoss: Math.max(0, bestWin - playedWin),
    luck: realizedWin - playedWin,
    accuracy: accuracyPercent(bestWin, playedWin),
    playedRank: d.playedRank,
  };
}

export type PlayerDecisionSummary = {
  /** How many reveal decisions this player made. */
  reveals: number;
  /** Mean per-decision accuracy in [0, 100] (100 when the player made no reveals). */
  decisionAccuracy: number;
  /** Net win% swing this player's reveals produced vs their expectation (signed). */
  netLuck: number;
};

export type JieqiDecisionSummary = {
  /** Per-reveal view keyed by ply, so the move list can look one up on navigation. */
  byPly: Map<number, DecisionView>;
  red: PlayerDecisionSummary;
  black: PlayerDecisionSummary;
};

export function summarizeDecisions(decisions: readonly JieqiDecision[]): JieqiDecisionSummary {
  const views = decisions.map(decisionView);
  const byPly = new Map(views.map((view) => [view.ply, view]));
  const summarize = (mover: 'red' | 'black'): PlayerDecisionSummary => {
    const mine = views.filter((view) => view.mover === mover);
    return {
      reveals: mine.length,
      decisionAccuracy: mine.length ? mean(mine.map((v) => v.accuracy)) : 100,
      netLuck: sum(mine.map((v) => v.luck)),
    };
  };
  return { byPly, red: summarize('red'), black: summarize('black') };
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}
function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

// The decisions endpoint mirrors the analysis one: GET reads only the cache (204 = not computed
// yet, INCLUDING when the basic analysis it depends on isn't cached), POST computes (account-gated).
function decisionsUrl(roomId: string): string {
  return new URL(`/api/jieqi/games/${encodeURIComponent(roomId)}/decisions`, window.location.href)
    .pathname;
}

/** GET the already-cached decomposition, or null on a miss (204). Never triggers a compute. */
export async function fetchCachedJieqiDecisions(
  roomId: string,
): Promise<JieqiDecisionSummary | null> {
  const response = await fetch(decisionsUrl(roomId), { method: 'GET' });
  if (response.status === 204 || !response.ok) return null;
  return summarizeDecisions(((await response.json()) as JieqiDecisionsResponse).decisions);
}

/** POST to compute the decomposition (account-gated on the server), then summarize it. */
export async function requestJieqiDecisions(roomId: string): Promise<JieqiDecisionSummary> {
  const response = await fetch(decisionsUrl(roomId), { method: 'POST' });
  if (!response.ok) throw new Error(`decisions_request_failed_${response.status}`);
  return summarizeDecisions(((await response.json()) as JieqiDecisionsResponse).decisions);
}
