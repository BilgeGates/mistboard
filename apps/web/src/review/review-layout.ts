// Unified postgame review layout. Every variant's /game review page composes
// through this: it owns the shared shell (hugging left/center/right cluster),
// the review-stage (dominant primary board + click-to-promote secondaries), the
// playback scrubber, keyboard nav, flip state, and the viewport-fill board
// sizing. A variant supplies only a ReviewLayoutAdapter — its title/summary/
// actions, its details + moves panels, its board hosts + a renderBoards callback,
// and its board aspect ratio. No per-variant postgame CSS is needed: the primary
// board size is derived from the aspect so the board fills the viewport height
// (scaling up on tall windows, down on short) without a vertical scroll.

import { type BoardStageSlot, createBoardStage } from './review-stage.js';
import './review-shell.css';
import { createReviewShell } from './review-shell.js';

export type ReviewBoardEntry = {
  /** Stable identity (e.g. 'truth' | 'white' | 'black' | 'red'). */
  key: string;
  tier: 'primary' | 'secondary';
  /** The board host element (its own label + board) the variant renders into. */
  el: HTMLElement;
};

export type ReviewRenderContext = {
  ply: number;
  flipped: boolean;
  primaryKey: string;
};

export type ReviewLayoutAdapter = {
  /** Root <main> class hook (e.g. 'dark-xiangqi-review'). */
  pageClassName?: string;
  ariaLabel: string;
  title: string;
  summary: string;
  /** Play again / home / room actions row. */
  actions: HTMLElement;
  /** Left-rail details panel (result / clock / date …). Optional. */
  details?: HTMLElement;
  /** Right-rail move list container (the layout owns the scrubber below it). */
  moves: HTMLElement;
  /** Optional analysis slots (lichess-shaped), placed by the shell around the move
   *  list / under the board. Absent on existing variants — they render unchanged;
   *  the engine phases fill them:
   *  - `enginePanel` sits at the top of the right rail (engine widget + PV lines in
   *    perfect-info mode, or a full ranked-move list in fog mode).
   *  - `analysisSummary` sits at the bottom of the right rail (per-player accuracy /
   *    metrics). Named to avoid colliding with the `summary` string field above.
   *  - `underboard` sits under the board in the center (advantage chart in perfect-info
   *    mode, or the cycleable POV boards in fog mode). The fill sizing subtracts its
   *    height so the board still fits without a vertical scroll. */
  enginePanel?: HTMLElement;
  analysisSummary?: HTMLElement;
  underboard?: HTMLElement;
  /** Optional line right below the move list (lichess "Mistake. X was best."). */
  moveComment?: HTMLElement;
  boards: ReviewBoardEntry[];
  /** Board width / height, e.g. 552 / 612 for xiangqi. Drives the fill sizing. */
  boardAspect: number;
  /** Board columns (files). Sizes captured-material tiles to ≈ one board cell so
   *  they match the on-board pieces. Default 12 (small, generic). */
  boardCols?: number;
  /** Extra vertical px each board host adds beyond the board itself (reserve /
   *  hand / capture strips). Budgeted into the fill sizing so the page still
   *  fits without a vertical scroll. Default 0. */
  boardChromePx?: number;
  /** Width (px) of each click-to-promote secondary board. Default 92. Raise for
   *  variants whose secondaries read too small at the shared default. */
  secondaryWidthPx?: number;
  maxPly: number;
  /** Re-render every board host for the given ply / flip / primary. */
  renderBoards(ctx: ReviewRenderContext): void;
  /** Optional: re-render an interactive move list for the ply; `jump` moves to a
   *  ply when a move row is clicked. Called on every ply change. */
  renderMoves?(ctx: ReviewRenderContext, jump: (ply: number) => void): void;
};

const NAV_AND_PADDING_PX = 122; // site nav + shell top/bottom padding
// Chrome outside the review-stage region (nav + shell padding). Matches the
// cluster's `min-height: calc(100svh - 108px)` so the fit targets the same region.
const VIEWPORT_CHROME_PX = 108;
// Horizontal space the two rails + gaps + shell side padding take, so the board
// can be capped to the width actually left for the center column.
const RAILS_AND_GUTTERS_PX = 640;
const PRIMARY_LABEL_PX = 30;
const STACK_GAP_PX = 16;
const SECONDARY_LABEL_PX = 24;
const SECONDARY_WIDTH_PX = 92;
// Gap between a flank capture column and the board (mirrors `.review-flank { gap }`).
const FLANK_GAP_PX = 8;

export function mountReviewLayout(root: HTMLElement, adapter: ReviewLayoutAdapter): void {
  let ply = adapter.maxPly;
  let flipped = false;

  const slots: BoardStageSlot[] = adapter.boards.map((board) => ({
    key: board.key,
    el: board.el,
    tier: board.tier,
  }));

  const stage = createBoardStage(slots, { onPromote: () => render() });
  applyBoardSizing(stage.el, adapter);

  const scrubber = createReviewScrubber();
  const left = infoRail(adapter);
  // Right rail, lichess order: engine panel · move list · advice · scrubber · summary.
  const right = railGroup(
    [
      adapter.enginePanel,
      adapter.moves,
      adapter.moveComment,
      scrubber.el,
      adapter.analysisSummary,
    ].filter((el): el is HTMLElement => el != null),
  );
  // Center: board-stage, plus an optional underboard region stacked beneath it.
  const center = adapter.underboard ? centerColumn(stage.el, adapter.underboard) : stage.el;

  function render(): void {
    const ctx = { ply, flipped, primaryKey: stage.primaryKey() };
    adapter.renderBoards(ctx);
    adapter.renderMoves?.(ctx, go);
    scrubber.status.textContent = `Ply ${ply} of ${adapter.maxPly}`;
    scrubber.setBounds(ply, adapter.maxPly);
  }

  const go = (target: number): void => {
    ply = Math.max(0, Math.min(adapter.maxPly, target));
    render();
  };
  const flip = (): void => {
    flipped = !flipped;
    render();
  };

  scrubber.first.addEventListener('click', () => go(0));
  scrubber.previous.addEventListener('click', () => go(ply - 1));
  scrubber.next.addEventListener('click', () => go(ply + 1));
  scrubber.last.addEventListener('click', () => go(adapter.maxPly));
  scrubber.flip.addEventListener('click', flip);

  // Global playback keys (arrows anywhere on the page, lichess-style), ignoring
  // typing targets. Left/Right step a ply; Up/Home jump to start, Down/End to end;
  // `f` flips.
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT')
    ) {
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(ply - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(ply + 1);
    } else if (event.key === 'ArrowUp' || event.key === 'Home') {
      event.preventDefault();
      go(0);
    } else if (event.key === 'ArrowDown' || event.key === 'End') {
      event.preventDefault();
      go(adapter.maxPly);
    } else if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      flip();
    }
  });

  root.append(
    createReviewShell({
      ariaLabel: adapter.ariaLabel,
      pageClassName: adapter.pageClassName,
      left,
      center,
      right,
    }),
  );
  render();

  // Size the primary board to the measured available space. The aspect estimate
  // (applyBoardSizing) is only a starting point; fitPrimaryToViewport measures the
  // real laid-out chrome and fills the height. Re-run after layout settles and
  // whenever the stage's available height changes — a window resize, or the page
  // being shown / resized inside the dev postgame-sheet iframe (where a single
  // load-time pass measures a not-yet-sized frame).
  const refit = (): void => {
    applyBoardSizing(stage.el, adapter);
    fitPrimaryToViewport(stage.el, adapter.boardAspect);
  };
  refit();
  setTimeout(refit, 60);
  setTimeout(refit, 260);
  window.addEventListener('resize', refit);
  // A ResizeObserver on the stage catches the frame being shown/resized (e.g. the
  // dev sheet iframe), but the stage also grows as captures/hands change per ply —
  // and re-fitting on THAT would resize the board mid-scrub, jarring the UI. So
  // only re-fit when the viewport height actually changed; per-ply content growth
  // leaves the board size fixed (it was fit for the fullest ply).
  if (typeof ResizeObserver !== 'undefined') {
    let lastViewportHeight = window.innerHeight;
    const observer = new ResizeObserver(() => {
      if (window.innerHeight === lastViewportHeight) return;
      lastViewportHeight = window.innerHeight;
      refit();
    });
    observer.observe(stage.el);
  }
}

// Measure the stage's actual laid-out chrome (labels + capture/hand strips +
// secondary row) and size the primary board so the whole stack exactly fills the
// available height — growing into slack (e.g. empty hands) and shrinking out of
// overflow (full hands / capture pools). Bidirectional and self-measuring, so no
// per-variant chrome estimate is needed. Capped by the center column width so
// wide boards don't overflow horizontally.
function fitPrimaryToViewport(stageEl: HTMLElement, aspect: number): void {
  requestAnimationFrame(() => {
    // Measure against the VIEWPORT, not the stage's own height: the stage stretches
    // to the board, so reading its height and then resizing the board would feed
    // back into a runaway ResizeObserver loop. This region height is stable.
    // An underboard region (advantage chart / POV boards) sits below the stage in
    // the center column and eats into the height the board can fill — subtract it so
    // the whole center column, not just the board, fits the viewport (no scroll).
    const centerCol = stageEl.parentElement;
    const underboard = centerCol?.classList.contains('review-center-column')
      ? centerCol.querySelector<HTMLElement>('.review-underboard')
      : null;
    const underboardPx = underboard ? underboard.getBoundingClientRect().height + STACK_GAP_PX : 0;
    const available = window.innerHeight - VIEWPORT_CHROME_PX - underboardPx;
    const slot = stageEl.querySelector<HTMLElement>('.review-stage__slot--primary');
    if (available <= 0 || !slot) return;
    const gaps = Math.max(0, stageEl.children.length - 1) * STACK_GAP_PX;
    const contentHeight =
      [...stageEl.children].reduce((h, child) => h + child.getBoundingClientRect().height, 0) +
      gaps;
    const currentWidth = slot.getBoundingClientRect().width;
    // Flank layout puts capture columns beside the board, so the board is narrower
    // than the slot. The fixed side budget is the columns' OWN width (+ their gaps),
    // NOT slot-minus-board: a portrait board that doesn't fill its slot leaves slack
    // that slot-minus-board would count as flank width and run the slot away each
    // pass (board 462 in a 1268 slot → flankPx 806 → wider slot → …).
    const flankBoard = slot.querySelector<HTMLElement>('.review-flank__board');
    const boardWidth = flankBoard ? flankBoard.getBoundingClientRect().width : currentWidth;
    const flankCols = flankBoard
      ? [...slot.querySelectorAll<HTMLElement>('.review-flank__col')]
      : [];
    const flankPx = flankCols.reduce(
      (width, col) => width + col.getBoundingClientRect().width + FLANK_GAP_PX,
      0,
    );
    // Everything in the stage except the primary board itself (its own label /
    // strips, plus the secondary row and gaps) stays fixed as the primary scales.
    const nonBoardChrome = Math.max(0, contentHeight - boardWidth / aspect);
    const widthCap = Math.max(240, window.innerWidth - RAILS_AND_GUTTERS_PX);
    const targetBoardWidth = Math.floor((available - nonBoardChrome - 6) * aspect);
    const targetWidth = Math.max(160, Math.min(widthCap, targetBoardWidth + flankPx));
    stageEl.style.setProperty('--review-stage-primary-max', `${targetWidth}px`);
  });
}

// The primary board fills the height left after the nav, the secondary row, and
// the labels — projected through the board aspect — so it scales with the
// viewport instead of a fixed vh fraction.
function applyBoardSizing(stageEl: HTMLElement, adapter: ReviewLayoutAdapter): void {
  const aspect = adapter.boardAspect;
  const extraPerBoard = adapter.boardChromePx ?? 0;
  const secondaryWidth = adapter.secondaryWidthPx ?? SECONDARY_WIDTH_PX;
  const hasSecondaries = adapter.boards.some((board) => board.tier === 'secondary');
  const secondaryStackPx = hasSecondaries
    ? STACK_GAP_PX + SECONDARY_LABEL_PX + Math.round(secondaryWidth / aspect) + extraPerBoard
    : 0;
  const chromePx = NAV_AND_PADDING_PX + PRIMARY_LABEL_PX + extraPerBoard + secondaryStackPx;
  // The board is the largest that fits BOTH the center column width (≈ viewport
  // minus the two rails + gaps) and the height left after chrome (projected
  // through the aspect). Wide boards are width-bound; tall boards height-bound.
  stageEl.style.setProperty(
    '--review-stage-primary-max',
    `min(max(240px, calc(100vw - ${RAILS_AND_GUTTERS_PX}px)), calc((100svh - ${chromePx}px) * ${aspect.toFixed(4)}))`,
  );
  stageEl.style.setProperty('--review-stage-secondary-max', `${secondaryWidth}px`);
  // Capture tiles size to ≈ one board cell (board width / columns) so they read
  // at the same scale as the on-board pieces.
  stageEl.style.setProperty('--capture-cols', String(adapter.boardCols ?? 12));
}

function infoRail(adapter: ReviewLayoutAdapter): HTMLElement {
  const card = document.createElement('section');
  card.className = 'review-info-card';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'review-info-card__eyebrow';
  eyebrow.textContent = 'Game review';
  const title = document.createElement('h1');
  title.className = 'review-info-card__title';
  title.textContent = adapter.title;
  const summary = document.createElement('p');
  summary.className = 'review-info-card__summary';
  summary.textContent = adapter.summary;
  card.append(eyebrow, title, summary, adapter.actions);
  return railGroup(adapter.details ? [card, adapter.details] : [card]);
}

function railGroup(children: HTMLElement[]): HTMLElement {
  const group = document.createElement('div');
  group.className = 'review-rail-group';
  group.append(...children);
  return group;
}

// The center column: the board-stage with an underboard region stacked beneath it
// (advantage chart / cycleable POV boards). The shell still vertically centers the
// whole column; fitPrimaryToViewport subtracts the underboard height so the board
// fills only the space above it.
function centerColumn(stageEl: HTMLElement, underboard: HTMLElement): HTMLElement {
  const col = document.createElement('div');
  col.className = 'review-center-column';
  underboard.classList.add('review-underboard');
  col.append(stageEl, underboard);
  return col;
}

type ReviewScrubber = {
  el: HTMLElement;
  status: HTMLElement;
  first: HTMLButtonElement;
  previous: HTMLButtonElement;
  next: HTMLButtonElement;
  last: HTMLButtonElement;
  flip: HTMLButtonElement;
  setBounds(ply: number, maxPly: number): void;
};

function createReviewScrubber(): ReviewScrubber {
  const el = document.createElement('div');
  el.className = 'review-scrubber';
  const status = document.createElement('span');
  status.className = 'review-scrubber__status';
  status.setAttribute('aria-live', 'polite');
  const first = scrubButton('|<', 'First ply');
  const previous = scrubButton('<', 'Previous ply');
  const next = scrubButton('>', 'Next ply');
  const last = scrubButton('>|', 'Final ply');
  const flip = scrubButton('Flip', 'Flip all boards');
  flip.title = 'Flip all boards (f)';
  el.append(status, first, previous, next, last, flip);
  return {
    el,
    status,
    first,
    previous,
    next,
    last,
    flip,
    setBounds(ply, maxPly) {
      first.disabled = ply <= 0;
      previous.disabled = ply <= 0;
      next.disabled = ply >= maxPly;
      last.disabled = ply >= maxPly;
    },
  };
}

function scrubButton(text: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'review-scrubber__button';
  button.setAttribute('aria-label', label);
  button.textContent = text;
  return button;
}
