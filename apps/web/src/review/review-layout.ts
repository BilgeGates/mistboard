// Unified review layout. Two things live here:
//
//  1. `createReviewScaffold` — the pure LAYOUT: the hugging left/center/right
//     shell, the review-stage (dominant primary board + click-to-promote
//     secondaries), the underboard region, the rail composition, and the
//     viewport-fill board sizing. It is navigation-agnostic: the caller supplies
//     the right-rail `navigation` element (a linear scrubber, or a tree nav bar).
//
//  2. `mountReviewLayout` — the LINEAR controller every variant's /game review
//     rides: an integer-ply scrubber + keyboard over the scaffold. Its adapter is
//     unchanged, so every postgame page keeps working untouched. The interactive
//     analysis board rides the SAME scaffold with a path-based (tree) controller,
//     so both surfaces share one layout and size identically.

import { type BoardStageHandle, type BoardStageSlot, createBoardStage } from './review-stage.js';
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

// ─────────────────────────────────────────────────────────────────────────────
// Scaffold — the shared, navigation-agnostic layout.
// ─────────────────────────────────────────────────────────────────────────────

export type ReviewScaffoldConfig = {
  ariaLabel: string;
  pageClassName?: string;
  /** Info-card eyebrow ('Game review' for postgame, 'Analysis' for the tool). */
  eyebrow?: string;
  title: string;
  summary: string;
  actions: HTMLElement;
  details?: HTMLElement;
  boards: ReviewBoardEntry[];
  boardAspect: number;
  boardCols?: number;
  boardChromePx?: number;
  secondaryWidthPx?: number;
  underboard?: HTMLElement;
  enginePanel?: HTMLElement;
  moves: HTMLElement;
  moveComment?: HTMLElement;
  /** The right-rail navigation element: a linear scrubber or a tree nav bar. */
  navigation: HTMLElement;
  analysisSummary?: HTMLElement;
  /** Fires after a secondary board is promoted; the caller re-renders. */
  onPromote?(): void;
};

export type ReviewScaffold = {
  /** The composed <main> shell. The caller appends it (typically after site nav). */
  root: HTMLElement;
  stage: BoardStageHandle;
  /** Re-measure and size the primary board to fill the viewport. Call once after
   *  the first render, and whenever the underboard region changes height. */
  refit(): void;
};

export function createReviewScaffold(config: ReviewScaffoldConfig): ReviewScaffold {
  const slots: BoardStageSlot[] = config.boards.map((board) => ({
    key: board.key,
    el: board.el,
    tier: board.tier,
  }));
  const stage = createBoardStage(slots, { onPromote: () => config.onPromote?.() });
  applyBoardSizing(stage.el, config);

  const left = infoRail(config);
  // Right rail, lichess order: engine panel · move list · advice · navigation · summary.
  const right = railGroup(
    [
      config.enginePanel,
      config.moves,
      config.moveComment,
      config.navigation,
      config.analysisSummary,
    ].filter((el): el is HTMLElement => el != null),
  );
  const center = config.underboard ? centerColumn(stage.el, config.underboard) : stage.el;

  const root = createReviewShell({
    ariaLabel: config.ariaLabel,
    pageClassName: config.pageClassName,
    left,
    center,
    right,
  });

  const refit = (): void => {
    applyBoardSizing(stage.el, config);
    fitPrimaryToViewport(stage.el, config.boardAspect);
  };
  // Re-run after layout settles and whenever the stage's available height changes —
  // a window resize, or the page being shown / resized inside the dev postgame-sheet
  // iframe (where a single load-time pass measures a not-yet-sized frame).
  setTimeout(refit, 60);
  setTimeout(refit, 260);
  window.addEventListener('resize', refit);
  // A ResizeObserver on the stage catches the frame being shown/resized (e.g. the
  // dev sheet iframe), but the stage also grows as captures/hands change per ply —
  // and re-fitting on THAT would resize the board mid-scrub, jarring the UI. So
  // only re-fit when the viewport height actually changed; per-ply content growth
  // leaves the board size fixed (it was fit for the fullest ply).
  if (typeof ResizeObserver !== 'undefined') {
    let lastViewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    const observer = new ResizeObserver(() => {
      if (window.innerHeight === lastViewportHeight) return;
      lastViewportHeight = window.innerHeight;
      refit();
    });
    observer.observe(stage.el);
  }

  return { root, stage, refit };
}

// ─────────────────────────────────────────────────────────────────────────────
// Linear controller — every /game review page. Unchanged behavior.
// ─────────────────────────────────────────────────────────────────────────────

export function mountReviewLayout(root: HTMLElement, adapter: ReviewLayoutAdapter): void {
  let ply = adapter.maxPly;
  let flipped = false;

  const scrubber = createReviewScrubber();
  const scaffold = createReviewScaffold({
    ariaLabel: adapter.ariaLabel,
    pageClassName: adapter.pageClassName,
    eyebrow: 'Game review',
    title: adapter.title,
    summary: adapter.summary,
    actions: adapter.actions,
    details: adapter.details,
    boards: adapter.boards,
    boardAspect: adapter.boardAspect,
    boardCols: adapter.boardCols,
    boardChromePx: adapter.boardChromePx,
    secondaryWidthPx: adapter.secondaryWidthPx,
    underboard: adapter.underboard,
    enginePanel: adapter.enginePanel,
    moves: adapter.moves,
    moveComment: adapter.moveComment,
    navigation: scrubber.el,
    analysisSummary: adapter.analysisSummary,
    onPromote: () => render(),
  });

  function render(): void {
    const ctx = { ply, flipped, primaryKey: scaffold.stage.primaryKey() };
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

  installReviewKeyboard({
    stepBack: () => go(ply - 1),
    stepForward: () => go(ply + 1),
    toStart: () => go(0),
    toEnd: () => go(adapter.maxPly),
    flip,
  });

  root.append(scaffold.root);
  render();
  scaffold.refit();
}

// Global playback keys (arrows anywhere on the page, lichess-style), ignoring
// typing targets. Left/Right step; Up/Home jump to start, Down/End to end; `f`
// flips. Shared by the linear scrubber and the tree nav.
export function installReviewKeyboard(
  handlers: {
    stepBack(): void;
    stepForward(): void;
    toStart(): void;
    toEnd(): void;
    flip(): void;
  },
  /** Optional abort signal to remove the listener (e.g. when a surface re-mounts). */
  signal?: AbortSignal,
): void {
  document.addEventListener(
    'keydown',
    (event) => {
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
        handlers.stepBack();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        handlers.stepForward();
      } else if (event.key === 'ArrowUp' || event.key === 'Home') {
        event.preventDefault();
        handlers.toStart();
      } else if (event.key === 'ArrowDown' || event.key === 'End') {
        event.preventDefault();
        handlers.toEnd();
      } else if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        handlers.flip();
      }
    },
    { signal },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Board sizing (viewport-fill). Shared by every scaffold consumer.
// ─────────────────────────────────────────────────────────────────────────────

type SizingConfig = {
  boardAspect: number;
  boardChromePx?: number;
  secondaryWidthPx?: number;
  boardCols?: number;
  boards: ReviewBoardEntry[];
};

// Measure the stage's actual laid-out chrome (labels + capture/hand strips +
// secondary row) and size the primary board so the whole stack exactly fills the
// available height — growing into slack (e.g. empty hands) and shrinking out of
// overflow (full hands / capture pools). Bidirectional and self-measuring, so no
// per-variant chrome estimate is needed. Capped by the center column width so
// wide boards don't overflow horizontally.
function fitPrimaryToViewport(stageEl: HTMLElement, aspect: number): void {
  scheduleAnimationFrame(() => {
    if (typeof window === 'undefined') return;
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

function scheduleAnimationFrame(callback: () => void): void {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(callback);
    return;
  }
  setTimeout(callback, 0);
}

// The primary board fills the height left after the nav, the secondary row, and
// the labels — projected through the board aspect — so it scales with the
// viewport instead of a fixed vh fraction.
function applyBoardSizing(stageEl: HTMLElement, config: SizingConfig): void {
  const aspect = config.boardAspect;
  const extraPerBoard = config.boardChromePx ?? 0;
  const secondaryWidth = config.secondaryWidthPx ?? SECONDARY_WIDTH_PX;
  const hasSecondaries = config.boards.some((board) => board.tier === 'secondary');
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
  stageEl.style.setProperty('--capture-cols', String(config.boardCols ?? 12));
}

// ─────────────────────────────────────────────────────────────────────────────
// Rail composition.
// ─────────────────────────────────────────────────────────────────────────────

function infoRail(config: {
  eyebrow?: string;
  title: string;
  summary: string;
  actions: HTMLElement;
  details?: HTMLElement;
}): HTMLElement {
  const card = document.createElement('section');
  card.className = 'review-info-card';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'review-info-card__eyebrow';
  eyebrow.textContent = config.eyebrow ?? 'Game review';
  const title = document.createElement('h1');
  title.className = 'review-info-card__title';
  title.textContent = config.title;
  const summary = document.createElement('p');
  summary.className = 'review-info-card__summary';
  summary.textContent = config.summary;
  card.append(eyebrow, title, summary, config.actions);
  return railGroup(config.details ? [card, config.details] : [card]);
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

// ─────────────────────────────────────────────────────────────────────────────
// Linear scrubber (the postgame nav).
// ─────────────────────────────────────────────────────────────────────────────

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

/** Build a scrubber-styled nav bar for a non-linear (tree) controller: the same
 *  |< < > >| Flip chrome as the postgame, with a free-form status label. */
export function createReviewNavBar(handlers: {
  first(): void;
  previous(): void;
  next(): void;
  last(): void;
  flip(): void;
}): {
  el: HTMLElement;
  status: HTMLElement;
  setBounds(state: { atStart: boolean; atEnd: boolean }): void;
} {
  const el = document.createElement('div');
  el.className = 'review-scrubber';
  const status = document.createElement('span');
  status.className = 'review-scrubber__status';
  status.setAttribute('aria-live', 'polite');
  const first = scrubButton('|<', 'First move');
  const previous = scrubButton('<', 'Previous move');
  const next = scrubButton('>', 'Next move');
  const last = scrubButton('>|', 'End of line');
  const flip = scrubButton('Flip', 'Flip board');
  flip.title = 'Flip board (f)';
  first.addEventListener('click', handlers.first);
  previous.addEventListener('click', handlers.previous);
  next.addEventListener('click', handlers.next);
  last.addEventListener('click', handlers.last);
  flip.addEventListener('click', handlers.flip);
  el.append(status, first, previous, next, last, flip);
  return {
    el,
    status,
    setBounds({ atStart, atEnd }) {
      first.disabled = atStart;
      previous.disabled = atStart;
      next.disabled = atEnd;
      last.disabled = atEnd;
    },
  };
}
