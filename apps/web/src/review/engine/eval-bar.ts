// The iconic lichess on-board eval bar: a thin vertical gauge flush against the
// board. The light fill grows from the Red end (bottom by default) in proportion
// to Red's win probability; a midline marks equality and the current eval prints
// at the leading end. Driven by the engine panel's live updates (setEval).
//
// The board is sized by the review-stage's viewport fit and is narrower than its
// slot, so the bar is absolutely positioned inside the board host and aligned to
// the board's measured rect (alignTo), re-run on a ResizeObserver — it can't drift
// when the board rescales.
import './eval-bar.css';
import { formatEval, winProbRed } from './eval-format.js';

const BAR_WIDTH_PX = 20;
const BAR_GAP_PX = 8;
/** Gridline count: the bar is divided into eighths (lila renderGauge parity). */
const TICK_DIVISIONS = 8;

export interface EvalBar {
  el: HTMLElement;
  /** Update from a Red-POV score (cp or mate). */
  setEval(cp: number | null, mate: number | null): void;
  /** Show a neutral "thinking" state without a number. */
  setLoading(): void;
  /** Back to the empty even state. */
  reset(): void;
  /** Engine off: dim the bar so it reads as inactive rather than "0.0". */
  setIdle(idle: boolean): void;
  /** Match board orientation: when flipped, Red sits at the top. */
  setFlipped(flipped: boolean): void;
  /** Align the bar to `anchorEl` (default the board), matching the board's height,
   *  and keep it aligned as the board rescales. `side` places the bar just outside
   *  that anchor: 'left' (default) or 'right'. Pass the flank host as the anchor when
   *  capture columns sit beside the board, so the bar clears them. */
  observe(boardEl: HTMLElement, anchorEl?: HTMLElement, side?: 'left' | 'right'): void;
}

export function createEvalBar(): EvalBar {
  const el = document.createElement('div');
  el.className = 'review-eval-bar';
  el.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('div');
  fill.className = 'review-eval-bar__fill';
  // Static gradations at every eighth of the bar (lila renderGauge parity), with
  // the red equality line at dead center supplied by CSS.
  //
  // These are POSITIONAL gridlines, not eval values. Until 2026-07-23 they marked
  // ±1..±6 pawns run through the win-prob curve, i.e. equal steps in EVALUATION
  // plotted on an axis of PROBABILITY — so they landed 7.7% apart near the centre
  // and 4.0% apart out at ±6. Unlabelled ticks read as "equal steps of something",
  // so uneven ones read as arbitrary, and nothing in the UI could tell you
  // otherwise. Even eighths claim only what they can deliver: a scale to judge the
  // fill height against.
  const ticks = document.createElement('div');
  ticks.className = 'review-eval-bar__ticks';
  for (let eighth = 1; eighth < TICK_DIVISIONS; eighth += 1) {
    // Dead centre is the red equality line (CSS ::after); don't double-draw it.
    if (eighth * 2 === TICK_DIVISIONS) continue;
    const tick = document.createElement('div');
    tick.className = 'review-eval-bar__tick';
    tick.style.bottom = `${((eighth / TICK_DIVISIONS) * 100).toFixed(2)}%`;
    ticks.append(tick);
  }
  const label = document.createElement('span');
  label.className = 'review-eval-bar__label';
  el.append(fill, ticks, label);

  function applyProb(prob: number): void {
    fill.style.height = `${(prob * 100).toFixed(1)}%`;
    el.classList.toggle('review-eval-bar--red-ahead', prob >= 0.5);
  }

  function setEval(cp: number | null, mate: number | null): void {
    el.classList.remove('review-eval-bar--loading');
    applyProb(winProbRed(cp, mate));
    label.textContent = formatEval(cp, mate);
  }

  function setLoading(): void {
    el.classList.add('review-eval-bar--loading');
    label.textContent = '';
  }

  function reset(): void {
    el.classList.remove('review-eval-bar--loading');
    applyProb(0.5);
    label.textContent = '';
  }

  function setIdle(idle: boolean): void {
    el.classList.toggle('review-eval-bar--idle', idle);
  }

  function setFlipped(flipped: boolean): void {
    el.classList.toggle('review-eval-bar--flipped', flipped);
  }

  function alignTo(boardEl: HTMLElement, anchorEl: HTMLElement, side: 'left' | 'right'): void {
    const host = el.parentElement;
    if (!host) return;
    const board = boardEl.getBoundingClientRect();
    if (board.height === 0) return;
    const anchorRect = anchorEl.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    // Vertical extent follows the board; horizontally the bar sits just outside the
    // anchor (the board, or the flank host when capture columns are beside it) on the
    // requested side — 'right' hugs the board area toward the move list.
    el.style.top = `${board.top - hostRect.top}px`;
    el.style.height = `${board.height}px`;
    el.style.left =
      side === 'right'
        ? `${anchorRect.right - hostRect.left + BAR_GAP_PX}px`
        : `${anchorRect.left - hostRect.left - BAR_WIDTH_PX - BAR_GAP_PX}px`;
  }

  function observe(
    boardEl: HTMLElement,
    anchorEl: HTMLElement = boardEl,
    side: 'left' | 'right' = 'left',
  ): void {
    const run = () => alignTo(boardEl, anchorEl, side);
    run();
    requestAnimationFrame(run);
    // The review layout sizes the board via a viewport fit at rAF + 60ms + 260ms;
    // re-align just after each so we measure the final board rect (observe() is
    // called before the board is attached, so the first passes read height 0).
    setTimeout(run, 80);
    setTimeout(run, 300);
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(run).observe(boardEl);
    }
    window.addEventListener('resize', run);
  }

  reset();
  return { el, setEval, setLoading, reset, setIdle, setFlipped, observe };
}
