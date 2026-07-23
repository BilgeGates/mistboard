// Move-annotation glyphs, shared by the move list and the board badge.
//
// The move list already renders a suffix after the move ('??', '?', '?!', and the
// user-authored NAGs). The review board pins the SAME symbol to the move's
// destination point (lila does this in ui/lib/src/game/glyphs.ts). One tone
// function feeds both so the two surfaces cannot disagree about a move: a badge
// that said "blunder" next to a list entry that said "inaccuracy" would be worse
// than no badge at all.
//
// Engine judgments arrive with an explicit class (game-analysis.judgmentGlyph);
// user NAGs arrive as a bare symbol with NO class (tree-review's GLYPH_LABEL
// deliberately clears it so an authored '?' is not styled as an engine verdict in
// the list). The symbol fallback below is what lets the badge still colour those.

/** Badge colour families. The first three mirror MoveJudgment; 'good' and
 *  'speculative' exist only for user-authored NAGs, and are deliberately NOT
 *  judgment colours so an authored '!' never reads as an engine verdict. */
export type MoveGlyphTone = 'blunder' | 'mistake' | 'inaccuracy' | 'good' | 'speculative';

const TONE_BY_SYMBOL: Record<string, MoveGlyphTone> = {
  '??': 'blunder',
  '?': 'mistake',
  '?!': 'inaccuracy',
  '!': 'good',
  '!!': 'good',
  '!?': 'speculative',
};

const TONES = new Set<string>(['blunder', 'mistake', 'inaccuracy', 'good', 'speculative']);

/**
 * Tone for a move-list glyph. `suffixClass` (the engine judgment) wins when it is
 * one we know; otherwise fall back to the symbol itself, which is the user-NAG
 * path. Returns null for an absent or unrecognised glyph, which the callers treat
 * as "draw nothing" rather than as a default colour: an unknown symbol with a
 * confident colour would be an invented verdict.
 */
export function moveGlyphTone(
  suffix: string | undefined,
  suffixClass: string | undefined,
): MoveGlyphTone | null {
  if (suffixClass && TONES.has(suffixClass)) return suffixClass as MoveGlyphTone;
  if (!suffix) return null;
  return TONE_BY_SYMBOL[suffix] ?? null;
}
