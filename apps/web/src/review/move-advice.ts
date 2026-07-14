// Lichess-style "best move" advice line under the move list: when the move that
// led to the current ply was flagged, it reads e.g. "Mistake. h3-e3 was best."
// The best alternative is the engine's top move in the position BEFORE the played
// move (evals[ply-1].best), already in our own square notation from the server.
import './move-advice.css';
import { fsfUciToXiangqiSquares, type MoveJudgment } from '@mistboard/game';
import type { GameAnalysis } from './game-analysis.js';

const LABEL: Record<Exclude<MoveJudgment, null>, string> = {
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

/** A reveal ply's decision-vs-luck readout for the advice line (jieqi). The reveal carries no
 *  "was best" line (its swing is a chance event), so instead we state the DECISION quality and the
 *  reveal's LUCK. `judgment` null = a fine choice (or within engine noise). */
export type MoveAdviceDecision = {
  judgment: MoveJudgment;
  /** Signed win% the reveal swung vs its expectation (+ lucky, - unlucky). */
  luck: number;
};

export interface MoveAdvice {
  el: HTMLElement;
  /** Show the advice for the move at `ply`; hidden when that move wasn't flagged
   *  or analysis hasn't loaded. On a reveal ply, `decision` (if given) replaces the
   *  "was best" line with a decision-quality + luck readout. Call on every ply change. */
  update(ply: number, analysis: GameAnalysis | null, decision?: MoveAdviceDecision | null): void;
}

// Default best-move formatter: FSF/xiangqi coordinate pair. Correct for xiangqi, fortress,
// and jungle (their board coords match the engine dialect and they have no flips). Variants
// whose engine UCI diverges from the board coords (banqi/jungle-flip) pass their own via the
// presentation's `formatBestMove`.
function defaultFormatMove(uci: string): string {
  const squares = fsfUciToXiangqiSquares(uci);
  return squares ? `${squares.from}-${squares.to}` : uci;
}

// Best-move formatter for the flip variants (banqi, jungle-flip). Their analysis engine emits
// 0-indexed ranks and encodes a flip as from === to, while the board displays 1-indexed ranks
// and labels a flip "<sq> flip" (matching the move list). Convert each square (rank + 1) and
// label flips; e.g. engine "b2b2" -> "b3 flip", "c3e3" -> "c4-e4".
export function formatFlipVariantBestMove(uci: string): string {
  if (uci.length < 4) return uci;
  const toDisplay = (sq: string): string => {
    const rank = Number(sq[1]);
    return Number.isNaN(rank) ? sq : `${sq[0]}${rank + 1}`;
  };
  const from = toDisplay(uci.slice(0, 2));
  const to = toDisplay(uci.slice(2, 4));
  return from === to ? `${from} flip` : `${from}-${to}`;
}

// Best-move formatter for jieqi (Reveal Xiangqi). PikaJieQi emits Pikafish UCI with 0-indexed
// ranks (rank 0..9) on the 9×10 xiangqi board, while the board displays 1-indexed ranks (1..10).
// Convert each square (rank + 1); jieqi has NO from===to flip (a reveal rides a normal move), so
// it is always a coordinate pair. e.g. engine "e7a7" -> "e8-a8". Single-digit ranks only here
// (0..9 -> 1..10), so a 4-char UCI is expected.
export function formatJieqiBestMove(uci: string): string {
  if (uci.length < 4) return uci;
  const toDisplay = (sq: string): string => {
    const rank = Number(sq[1]);
    return Number.isNaN(rank) ? sq : `${sq[0]}${rank + 1}`;
  };
  return `${toDisplay(uci.slice(0, 2))}-${toDisplay(uci.slice(2, 4))}`;
}

export function createMoveAdvice(
  formatBest: (uci: string) => string = defaultFormatMove,
): MoveAdvice {
  const el = document.createElement('div');
  el.className = 'review-advice';
  el.hidden = true;

  function update(
    ply: number,
    analysis: GameAnalysis | null,
    decision?: MoveAdviceDecision | null,
  ): void {
    // A reveal ply owns the line: state the DECISION quality and the reveal's LUCK, not a "was
    // best" alternative (the swing there is a chance event, and its best-move arrow is separate).
    if (decision) {
      renderReveal(decision);
      return;
    }
    const move = analysis?.moves.find((m) => m.ply === ply);
    const judgment = move?.judgment;
    if (!analysis || !move || !judgment) {
      el.hidden = true;
      el.replaceChildren();
      return;
    }
    const best = analysis.evals.find((e) => e.ply === ply - 1)?.best ?? null;
    el.hidden = false;
    el.className = `review-advice review-advice--${judgment}`;
    const label = document.createElement('span');
    label.className = 'review-advice__label';
    label.textContent = `${LABEL[judgment]}.`;
    el.replaceChildren(label);
    if (best) el.append(document.createTextNode(` ${formatBest(best)} was best.`));
  }

  function renderReveal(decision: MoveAdviceDecision): void {
    el.hidden = false;
    // Colour the row by the DECISION quality; a fine decision uses the neutral 'reveal' tone.
    el.className = `review-advice review-advice--${decision.judgment ?? 'reveal'}`;
    const label = document.createElement('span');
    label.className = 'review-advice__label';
    label.textContent = decision.judgment ? `${LABEL[decision.judgment]} choice.` : 'Reveal.';
    // Luck is a neutral, ungraded readout: which way the dice fell vs the choice's expectation.
    const luck = document.createElement('span');
    const rounded = Math.round(decision.luck);
    const tone = rounded > 0 ? 'lucky' : rounded < 0 ? 'unlucky' : 'even';
    luck.className = `review-advice__luck review-advice__luck--${tone}`;
    const sign = rounded > 0 ? '+' : '';
    luck.textContent = `🎲 ${sign}${rounded}%`;
    el.replaceChildren(label, document.createTextNode(' '), luck);
  }

  return { el, update };
}
