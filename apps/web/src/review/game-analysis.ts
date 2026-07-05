// Client side of postgame computer analysis (P3.5): POST the request, then turn
// the server's per-ply eval series into everything the UI shows — the advantage
// chart data, per-move judgments (glyphs), and per-player accuracy / ACPL. The
// win%/accuracy/judgment math is the shared, unit-tested code in @mistboard/game.
import { accuracyPercent, type MoveJudgment, moveJudgment, winPercent } from '@mistboard/game';

/** One eval point from the server: position AFTER `ply` plies, from Red's POV. */
export type PlyEval = {
  ply: number;
  cp: number | null;
  mate: number | null;
  best: string | null;
};

export type XiangqiGameAnalysisResponse = {
  engineId: string;
  depth: number;
  plies: PlyEval[];
};

export type MoveAnalysis = {
  /** Ply this move lands on (1..N). */
  ply: number;
  mover: 'red' | 'black';
  judgment: MoveJudgment;
  /** This move's accuracy in [0, 100]. */
  accuracy: number;
};

export type PlayerAnalysis = {
  accuracy: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
  /** Average centipawn loss. */
  acpl: number;
};

export type GameAnalysis = {
  engineId: string;
  depth: number;
  /** Red-POV eval per ply cursor (0..N). */
  evals: PlyEval[];
  moves: MoveAnalysis[];
  red: PlayerAnalysis;
  black: PlayerAnalysis;
};

/** Lichess-style move glyph for a judgment: ?! inaccuracy, ? mistake, ?? blunder.
 *  Returns null for a fine move (no glyph). `suffixClass` matches the
 *  .review-move--<class> colour hooks in move-list.css. */
export function judgmentGlyph(
  judgment: MoveJudgment,
): { suffix: string; suffixClass: string } | null {
  switch (judgment) {
    case 'blunder':
      return { suffix: '??', suffixClass: 'blunder' };
    case 'mistake':
      return { suffix: '?', suffixClass: 'mistake' };
    case 'inaccuracy':
      return { suffix: '?!', suffixClass: 'inaccuracy' };
    default:
      return null;
  }
}

const ACPL_CAP = 1000;

/** Centipawns from a side's POV, capped so a decisive eval / mate can't blow up ACPL. */
function moverCp(cpRed: number | null, mate: number | null, mover: 'red' | 'black'): number {
  const sign = mover === 'red' ? 1 : -1;
  if (mate != null) return mate * sign >= 0 ? ACPL_CAP : -ACPL_CAP;
  return sign * Math.max(-ACPL_CAP, Math.min(ACPL_CAP, cpRed ?? 0));
}

/** Turn the Red-POV eval series into per-move judgments + per-player aggregates. */
export function computeGameAnalysis(response: XiangqiGameAnalysisResponse): GameAnalysis {
  const evals = [...response.plies].sort((a, b) => a.ply - b.ply);
  const moves: MoveAnalysis[] = [];
  const acc: Record<
    'red' | 'black',
    { accs: number[]; losses: number[]; i: number; m: number; b: number }
  > = {
    red: { accs: [], losses: [], i: 0, m: 0, b: 0 },
    black: { accs: [], losses: [], i: 0, m: 0, b: 0 },
  };

  for (let ply = 1; ply < evals.length; ply += 1) {
    const before = evals[ply - 1]!;
    const after = evals[ply]!;
    const mover: 'red' | 'black' = ply % 2 === 1 ? 'red' : 'black';
    // Win% from the mover's POV: Red POV as-is, Black POV is its complement.
    const redBefore = winPercent(before.cp, before.mate);
    const redAfter = winPercent(after.cp, after.mate);
    const winBefore = mover === 'red' ? redBefore : 100 - redBefore;
    const winAfter = mover === 'red' ? redAfter : 100 - redAfter;
    const judgment = moveJudgment(winBefore, winAfter);
    const accuracy = accuracyPercent(winBefore, winAfter);
    moves.push({ ply, mover, judgment, accuracy });

    const bucket = acc[mover];
    bucket.accs.push(accuracy);
    bucket.losses.push(
      Math.max(0, moverCp(before.cp, before.mate, mover) - moverCp(after.cp, after.mate, mover)),
    );
    if (judgment === 'inaccuracy') bucket.i += 1;
    else if (judgment === 'mistake') bucket.m += 1;
    else if (judgment === 'blunder') bucket.b += 1;
  }

  const summarize = (side: 'red' | 'black'): PlayerAnalysis => {
    const b = acc[side];
    return {
      accuracy: mean(b.accs),
      inaccuracies: b.i,
      mistakes: b.m,
      blunders: b.b,
      acpl: Math.round(mean(b.losses)),
    };
  };

  return {
    engineId: response.engineId,
    depth: response.depth,
    evals,
    moves,
    red: summarize('red'),
    black: summarize('black'),
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** POST the analysis request for a finished game and compute the derived view. */
export async function requestGameAnalysis(roomId: string): Promise<GameAnalysis> {
  const url = new URL(
    `/api/xiangqi/games/${encodeURIComponent(roomId)}/analysis`,
    window.location.href,
  ).pathname;
  const response = await fetch(url, { method: 'POST' });
  if (!response.ok) throw new Error(`analysis_request_failed_${response.status}`);
  return computeGameAnalysis((await response.json()) as XiangqiGameAnalysisResponse);
}
