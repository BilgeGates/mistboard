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

export interface EvalBar {
  el: HTMLElement;
  /** Update from a Red-POV score (cp or mate). */
  setEval(cp: number | null, mate: number | null): void;
  /** Show a neutral "thinking" state without a number. */
  setLoading(): void;
  /** Back to the empty even state. */
  reset(): void;
  /** Match board orientation: when flipped, Red sits at the top. */
  setFlipped(flipped: boolean): void;
  /** Position the bar flush to the board's left edge, matching its height. Keeps
   *  the bar aligned as the board rescales (call once, then let the observer run). */
  observe(boardEl: HTMLElement): void;
}

export function createEvalBar(): EvalBar {
  const el = document.createElement('div');
  el.className = 'review-eval-bar';
  el.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('div');
  fill.className = 'review-eval-bar__fill';
  const label = document.createElement('span');
  label.className = 'review-eval-bar__label';
  el.append(fill, label);

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

  function setFlipped(flipped: boolean): void {
    el.classList.toggle('review-eval-bar--flipped', flipped);
  }

  function alignTo(boardEl: HTMLElement): void {
    const host = el.parentElement;
    if (!host) return;
    const board = boardEl.getBoundingClientRect();
    const anchor = host.getBoundingClientRect();
    if (board.height === 0) return;
    el.style.top = `${board.top - anchor.top}px`;
    el.style.height = `${board.height}px`;
    el.style.left = `${board.left - anchor.left - BAR_WIDTH_PX - BAR_GAP_PX}px`;
  }

  function observe(boardEl: HTMLElement): void {
    const run = () => alignTo(boardEl);
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
  return { el, setEval, setLoading, reset, setFlipped, observe };
}
