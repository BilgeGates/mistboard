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
 * [0, 100]. A mate is a certain win/loss.
 */
export function winPercent(cp: number | null, mate: number | null): number {
  if (mate != null) return mate > 0 ? 100 : 0;
  if (cp == null) return 50;
  const clamped = Math.max(-WIN_PCT_CLAMP_CP, Math.min(WIN_PCT_CLAMP_CP, cp));
  const chances = 2 / (1 + Math.exp(-WIN_PCT_K * clamped)) - 1; // [-1, 1]
  return 50 + 50 * chances;
}

/**
 * lila's per-move accuracy, from the mover's win% before and after their move.
 * Returns [0, 100]; a move that doesn't drop win% scores ~100.
 */
export function accuracyPercent(winBefore: number, winAfter: number): number {
  const drop = Math.max(0, winBefore - winAfter);
  const raw = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Judge a move by how many win% points the mover gave up. Thresholds ported from
 * lila (in win% points); tune for xiangqi.
 */
export function moveJudgment(winBefore: number, winAfter: number): MoveJudgment {
  const drop = winBefore - winAfter;
  if (drop >= 20) return 'blunder';
  if (drop >= 10) return 'mistake';
  if (drop >= 5) return 'inaccuracy';
  return null;
}
