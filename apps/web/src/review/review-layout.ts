// Unified postgame review layout. Every variant's /game review page composes
// through this: it owns the shared shell (hugging left/center/right cluster),
// the board-stage (dominant primary board + click-to-promote secondaries), the
// playback scrubber, keyboard nav, flip state, and the viewport-fill board
// sizing. A variant supplies only a ReviewLayoutAdapter — its title/summary/
// actions, its details + moves panels, its board hosts + a renderBoards callback,
// and its board aspect ratio. No per-variant postgame CSS is needed: the primary
// board size is derived from the aspect so the board fills the viewport height
// (scaling up on tall windows, down on short) without a vertical scroll.

import { type BoardStageSlot, createBoardStage } from './board-stage.js';
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
  /** Left-rail details panel (result / clock / date …). */
  details: HTMLElement;
  /** Right-rail move list panel. */
  moves: HTMLElement;
  boards: ReviewBoardEntry[];
  /** Board width / height, e.g. 552 / 612 for xiangqi. Drives the fill sizing. */
  boardAspect: number;
  maxPly: number;
  /** Re-render every board host for the given ply / flip / primary. */
  renderBoards(ctx: ReviewRenderContext): void;
};

const NAV_AND_PADDING_PX = 122; // site nav + shell top/bottom padding
const PRIMARY_LABEL_PX = 30;
const STACK_GAP_PX = 16;
const SECONDARY_LABEL_PX = 24;
const SECONDARY_WIDTH_PX = 150;

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
  const right = railGroup([adapter.moves, scrubber.el]);

  function render(): void {
    adapter.renderBoards({ ply, flipped, primaryKey: stage.primaryKey() });
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

  root.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(ply - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(ply + 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      go(0);
    } else if (event.key === 'End') {
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
      center: stage.el,
      right,
    }),
  );
  render();
}

// The primary board fills the height left after the nav, the secondary row, and
// the labels — projected through the board aspect — so it scales with the
// viewport instead of a fixed vh fraction.
function applyBoardSizing(stageEl: HTMLElement, adapter: ReviewLayoutAdapter): void {
  const aspect = adapter.boardAspect;
  const hasSecondaries = adapter.boards.some((board) => board.tier === 'secondary');
  const secondaryStackPx = hasSecondaries
    ? STACK_GAP_PX + SECONDARY_LABEL_PX + Math.round(SECONDARY_WIDTH_PX / aspect)
    : 0;
  const chromePx = NAV_AND_PADDING_PX + PRIMARY_LABEL_PX + secondaryStackPx;
  stageEl.style.setProperty(
    '--board-stage-primary-max',
    `min(88vw, calc((100svh - ${chromePx}px) * ${aspect.toFixed(4)}))`,
  );
  stageEl.style.setProperty('--board-stage-secondary-max', `${SECONDARY_WIDTH_PX}px`);
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
  return railGroup([card, adapter.details]);
}

function railGroup(children: HTMLElement[]): HTMLElement {
  const group = document.createElement('div');
  group.className = 'review-rail-group';
  group.append(...children);
  return group;
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
  const flip = scrubButton('Flip', 'Flip all boards (f)');
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
