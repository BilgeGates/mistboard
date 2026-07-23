// Shared score formatting for the engine panel and the on-board eval bar, so the
// number and the gauge always agree. All inputs are from Red's POV (positive =
// Red better), matching how the review board normalises engine scores.

export function formatEval(cp: number | null, mate: number | null): string {
  if (mate != null) return `${mate > 0 ? '#' : '-#'}${Math.abs(mate)}`;
  if (cp == null) return '–';
  // The server encodes an already-checkmated position (mate 0) as a decisive
  // ±30000cp — render it as the checkmate it is, not as "+300.0".
  if (Math.abs(cp) >= 30000) return cp > 0 ? '#' : '-#';
  const v = cp / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

// Rough logistic map from centipawns to Red win probability, for the gauge fill.
// The scale constant is a display heuristic, not a calibrated model.
export function winProbRed(cp: number | null, mate: number | null): number {
  if (mate != null) return mate > 0 ? 1 : 0;
  if (cp == null) return 0.5;
  return 1 / (1 + Math.exp(-cp / 320));
}

// Positional assessment glyph (chess informant symbols, red as the "White" side).
// Marks the value at the END of a server-analysis variation, the way an opening
// book closes a line: a symbol reads faster than a number when the point is
// "who stands better", not "by exactly how much". Thresholds are in Red-POV
// centipawns and mirror the common informant bands; a mate is always decisive.
//
//   =   equal        ⩲ red slight   ⩱ black slight
//   ±   red clear     ∓ black clear
//   +−  red winning   −+ black winning
const ADVANTAGE_SLIGHT_CP = 60;
const ADVANTAGE_CLEAR_CP = 180;
const ADVANTAGE_WINNING_CP = 450;

export function advantageSymbol(cp: number | null, mate: number | null): string {
  if (mate != null) return mate > 0 ? '+−' : '−+';
  if (cp == null) return '';
  if (Math.abs(cp) >= 30000) return cp > 0 ? '+−' : '−+';
  const a = Math.abs(cp);
  if (a < ADVANTAGE_SLIGHT_CP) return '=';
  const red = cp > 0;
  if (a < ADVANTAGE_CLEAR_CP) return red ? '⩲' : '⩱';
  if (a < ADVANTAGE_WINNING_CP) return red ? '±' : '∓';
  return red ? '+−' : '−+';
}
