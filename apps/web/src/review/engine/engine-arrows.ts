// Engine output → board-arrow specs for the review board's arrow overlay.
// Pure mapping (no DOM): the review glue feeds these to the interactive board's
// setArrows(). FSF xiangqi UCI matches our square notation, so
// fsfUciToXiangqiSquares is a plain split.
//
// Weight encodes how much the line GIVES UP against the best line, not its rank
// (ported from lila ui/analyse/src/autoShape.ts). Rank-indexed styling lies in
// both directions: three near-equal moves read as one good move and two bad
// ones, and a candidate that hangs a rook still gets a solid arrow. Here the
// best move is a fixed blue, alternates share one grey at constant opacity, and
// only the shaft width varies — so an alternate that is nearly as good is nearly
// as heavy, and one that is clearly worse thins out and then disappears.
//
// Opacity deliberately does NOT vary: two overlapping translucent arrows stack
// into a third apparent weight, which would read as a strength no line has.

import { fsfUciToXiangqiSquares, winPercent } from '@mistboard/game';
import type { XiangqiBoardArrow } from '../../xiangqi-board.js';
import type { CevalLine } from './ceval.js';

/** PV1 can also show the expected reply as a faint dashed second segment (the
 *  "length encodes strength" nod). OFF for now (2026-07-10): the dashed enemy
 *  arrow read as noise next to the ranked candidate arrows. */
export const SHOW_PV1_REPLY_SEGMENT = false;

const MAX_ARROW_LINES = 3;

/** The best line: fixed weight, always drawn. */
const BEST_STYLE = { opacity: 0.4, width: 14 } as const;

/** Alternates: constant opacity, width from the win% gap (see ALT_WIDTH_*). */
const ALT_OPACITY = 0.35;

// Width ramp over the win-probability gap, in lila's units: `shift` is the
// fraction of a full win the line concedes, so 0 = as good as the best move and
// 1 = the difference between winning and losing. Past the cutoff the arrow is
// not drawn at all, which is what lets a forcing position show a single arrow.
//
// CALIBRATION: these three numbers are Stockfish-tuned, and winPercent's
// logistic constant carries the same caveat (see packages/game/src/analysis.ts).
// Pikafish's centipawn scale is similar but not identical. Retune here.
const ALT_CUTOFF_SHIFT = 0.2;
const ALT_WIDTH_MAX = 12;
const ALT_WIDTH_SLOPE = 50; // 12 at shift 0, down to 2 at the cutoff

const REPLY_STYLE = { opacity: 0.25, width: 7, dashed: true } as const;

/** Win probability for a line, from the moving side's POV. Ceval scores are
 *  already side-to-move relative, so lines within one position are directly
 *  comparable and need no perspective flip. */
function lineWinPercent(line: CevalLine): number {
  return winPercent(line.scoreCp, line.mate);
}

/** Arrows for the first move of each MultiPV line (up to 3), weakest first so
 *  the strongest renders on top. Alternates that concede too much are dropped
 *  entirely. When enabled, PV1's reply move is prepended as a faint dashed
 *  segment (bottom of the stack). */
export function engineArrowsFromLines(lines: readonly CevalLine[]): XiangqiBoardArrow[] {
  const ranked = [...lines].sort((a, b) => a.multipv - b.multipv).slice(0, MAX_ARROW_LINES);
  const best = ranked[0];
  if (!best) return [];
  const bestWin = lineWinPercent(best);

  const arrows: XiangqiBoardArrow[] = [];
  // Weakest first: later entries paint over earlier ones.
  for (let rank = ranked.length - 1; rank >= 1; rank -= 1) {
    const line = ranked[rank];
    if (!line) continue;
    const move = fsfUciToXiangqiSquares(line.pvUci[0] ?? '');
    if (!move) continue;
    // Negative shift = this line currently looks better than PV1, which happens
    // transiently mid-search before the ordering settles. Drop it rather than
    // drawing an alternate heavier than the best move.
    const shift = (bestWin - lineWinPercent(line)) / 100;
    if (shift < 0 || shift >= ALT_CUTOFF_SHIFT) continue;
    arrows.push({
      ...move,
      opacity: ALT_OPACITY,
      width: Math.max(2, Math.round(ALT_WIDTH_MAX - shift * ALT_WIDTH_SLOPE)),
      className: 'xq-arrow--alt',
    });
  }

  const bestMove = fsfUciToXiangqiSquares(best.pvUci[0] ?? '');
  if (bestMove) arrows.push({ ...bestMove, ...BEST_STYLE, className: 'xq-arrow--pv1' });

  if (SHOW_PV1_REPLY_SEGMENT) {
    const reply = fsfUciToXiangqiSquares(best.pvUci[1] ?? '');
    if (reply) arrows.unshift({ ...reply, ...REPLY_STYLE, className: 'xq-arrow--pv1-reply' });
  }
  return arrows;
}

/** Single best-move arrow from a whole-game analysis ply (server Pikafish path
 *  or the client sweep — both hand back our square notation). Empty when the
 *  move does not parse. */
export function bestMoveArrow(uci: string | null | undefined): XiangqiBoardArrow[] {
  const move = fsfUciToXiangqiSquares(uci ?? '');
  if (!move) return [];
  return [{ ...move, ...BEST_STYLE, className: 'xq-arrow--best' }];
}
