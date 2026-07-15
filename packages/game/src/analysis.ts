// Postgame analysis math (P3): centipawn eval -> win probability -> per-move
// judgment + accuracy. Formulas ported from lichess/lila. They are tuned for
// chess-engine centipawns; Pikafish's xiangqi eval scale is similar but not
// identical, so the win% logistic constant and the judgment thresholds are a
// starting point that likely wants recalibration on real xiangqi games.

export type MoveJudgment = 'blunder' | 'mistake' | 'inaccuracy' | null;

const WIN_PCT_CLAMP_CP = 1000;
// lila rawWinningChances constant (chess). Recalibrate for xiangqi if evals feel
// too flat / too spiky.
const WIN_PCT_K = 0.00368208;

/**
 * Centipawns / mate (from ONE side's POV) -> that side's win probability in
 * [0, 100]. A mate maps through lila's mate->cp ladder ((21 - min(10, N)) * 100,
 * so mate-in-1 reads as 2000cp and a distant mate as 1100cp) rather than
 * short-circuiting to certainty: swings between mate distances still register.
 */
export function winPercent(cp: number | null, mate: number | null): number {
  if (mate != null) {
    const mateCp = (21 - Math.min(10, Math.abs(mate))) * 100;
    return logisticWinPercent(mate > 0 ? mateCp : -mateCp);
  }
  if (cp == null) return 50;
  return logisticWinPercent(Math.max(-WIN_PCT_CLAMP_CP, Math.min(WIN_PCT_CLAMP_CP, cp)));
}

function logisticWinPercent(cp: number): number {
  const chances = 2 / (1 + Math.exp(-WIN_PCT_K * cp)) - 1; // [-1, 1]
  return 50 + 50 * chances;
}

/**
 * lila's per-move accuracy, from the mover's win% before and after their move.
 * Returns [0, 100]; a move that doesn't drop win% scores 100. The +1 is lila's
 * uncertainty bonus (imperfect analysis).
 */
export function accuracyPercent(winBefore: number, winAfter: number): number {
  if (winAfter >= winBefore) return 100;
  const drop = winBefore - winAfter;
  const raw = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669 + 1;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Judge a move by how many win% points the mover gave up. lila's thresholds
 * (Advice.scala: winning-chance deltas 0.1 / 0.2 / 0.3 on a [-1, 1] scale) are
 * 5 / 10 / 15 win% points.
 */
export function moveJudgment(winBefore: number, winAfter: number): MoveJudgment {
  const drop = winBefore - winAfter;
  if (drop >= 15) return 'blunder';
  if (drop >= 10) return 'mistake';
  if (drop >= 5) return 'inaccuracy';
  return null;
}

/**
 * lila's whole-game accuracy (AccuracyPercent.gameAccuracy): per move, the
 * accuracy is weighted by the local win% volatility (a sliding-window stdev,
 * squeezed to [0.5, 12]) so forced sequences count less; the player's accuracy
 * is the mean of that volatility-weighted mean and the harmonic mean (the
 * harmonic mean is what makes a single blunder actually hurt).
 *
 * `winPercents` is the win% (first mover's POV) of every position 0..N in
 * order — one more entry than there are moves. The first mover owns the even
 * transitions (0->1, 2->3, ...). Returns 0 for a side with no moves.
 */
// `excludePlies` (1-based ply numbers) drops those move transitions from the per-player accuracy
// samples — used by chance/hidden-info variants (jieqi/banqi/jungle-flip) to keep REVEAL plies out
// of the accuracy, since a reveal's win% swing is luck, not a graded decision. Empty/absent for
// deterministic variants, so their accuracy is unchanged. The volatility windows still span the
// full curve (a reveal is real local volatility); only the attribution to a player is skipped.
export function gameAccuracy(
  winPercents: number[],
  excludePlies?: ReadonlySet<number>,
): { first: number; second: number } {
  const moves = winPercents.length - 1;
  if (moves < 1) return { first: 0, second: 0 };

  // One volatility window per move: left-pad with the opening window so early
  // moves reuse the first window's stdev (lila's List.fill prefix).
  const windowSize = Math.max(2, Math.min(8, Math.floor(moves / 10)));
  const windows: number[][] = [];
  const padCount = Math.min(windowSize, winPercents.length) - 2;
  const firstWindow = winPercents.slice(0, windowSize);
  for (let i = 0; i < padCount; i += 1) windows.push(firstWindow);
  if (winPercents.length <= windowSize) {
    windows.push([...winPercents]);
  } else {
    for (let i = 0; i + windowSize <= winPercents.length; i += 1) {
      windows.push(winPercents.slice(i, i + windowSize));
    }
  }
  const weights = windows.map((window) => Math.max(0.5, Math.min(12, standardDeviation(window))));

  const samples: Record<'first' | 'second', Array<{ accuracy: number; weight: number }>> = {
    first: [],
    second: [],
  };
  for (let i = 0; i < moves; i += 1) {
    // Move index i produces ply i+1; skip a reveal (chance) ply so its luck never counts as skill.
    if (excludePlies?.has(i + 1)) continue;
    const prev = winPercents[i]!;
    const next = winPercents[i + 1]!;
    const mover: 'first' | 'second' = i % 2 === 0 ? 'first' : 'second';
    const before = mover === 'first' ? prev : 100 - prev;
    const after = mover === 'first' ? next : 100 - next;
    samples[mover].push({ accuracy: accuracyPercent(before, after), weight: weights[i] ?? 1 });
  }

  const sideAccuracy = (side: 'first' | 'second'): number => {
    const list = samples[side];
    // No gradeable moves (e.g. every move this side made was an excluded reveal) → no errors to
    // count, so treat as 100% rather than a misleading 0%.
    if (list.length === 0) return 100;
    const weightSum = list.reduce((sum, s) => sum + s.weight, 0);
    const weighted =
      weightSum > 0
        ? list.reduce((sum, s) => sum + s.accuracy * s.weight, 0) / weightSum
        : list.reduce((sum, s) => sum + s.accuracy, 0) / list.length;
    // 1/0 -> Infinity -> harmonic 0: a total blunder floors the harmonic mean.
    const invSum = list.reduce((sum, s) => sum + 1 / s.accuracy, 0);
    const harmonic = list.length / invSum;
    return (weighted + harmonic) / 2;
  };

  return { first: sideAccuracy('first'), second: sideAccuracy('second') };
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
