import type { Board, Color, Square } from '@mistboard/game';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { DrawShape } from 'chessground/draw';
import type * as cg from 'chessground/types';
import { boardsInLayout, type CompositionLayout } from '../layouts.js';
import { boardFen, fogHiddenClass } from './board.js';

export type StepperArrow = {
  orig: Square;
  // When dest is omitted, the shape renders as a circle on orig (useful for
  // pointing the reader at a single square — e.g. an attacked square).
  dest?: Square;
  brush?: 'green' | 'red' | 'blue' | 'yellow';
};

export type StepperBoardSpec = {
  board: Board;
  fogSquares?: Square[];
  orientation?: 'white' | 'black';
  label?: string;
  arrows?: StepperArrow[];
  // Squares to draw a gold call-out border on (works on fogged squares too).
  // Used by article diagrams to point the reader at a specific square.
  highlightSquares?: Square[];
};

function toShapes(arrows: StepperArrow[] | undefined): DrawShape[] {
  return (arrows ?? []).map((a) => ({
    orig: a.orig as cg.Key,
    brush: a.brush ?? 'green',
    ...(a.dest !== undefined ? { dest: a.dest as cg.Key } : {}),
  }));
}

// Strip pieces sitting on fogged squares so chessground never renders them.
// The fog square-class is just visual chrome; chessground itself does not
// know about fog. Filtering at the FEN level is what gives us the "you only
// see your visible pieces" semantics for static stepper frames.
function visibleBoard(board: Board, fogSquares: Square[]): Board {
  if (fogSquares.length === 0) return board;
  const fog = new Set(fogSquares);
  const out: Board = {};
  for (const [sq, piece] of Object.entries(board)) {
    if (piece && !fog.has(sq as Square)) out[sq as Square] = piece;
  }
  return out;
}

function fogSquareClasses(
  fogSquares: Square[],
  highlightSquares: Square[],
  orientation: Color,
): cg.SquareClasses {
  const classes = new Map<cg.Key, string>();
  for (const sq of fogSquares) classes.set(sq as cg.Key, fogHiddenClass(sq, orientation));
  for (const sq of highlightSquares) {
    const prior = classes.get(sq as cg.Key);
    classes.set(sq as cg.Key, prior ? `${prior} deduction-highlight` : 'deduction-highlight');
  }
  return classes;
}

export type StepperOutcome = {
  headline: string;
  reason?: string;
  tone?: 'win' | 'loss' | 'draw';
};

export type StepperPosition = {
  boards: StepperBoardSpec[];
  narrative?: string;
  /**
   * If set, renders a result badge over the middle board (or the first
   * board for non-triptych layouts), using the same .board-result
   * component the live game uses for end-of-game.
   */
  outcome?: StepperOutcome;
};

export type SteppedBoardsOptions = {
  layout: CompositionLayout;
  positions: StepperPosition[];
};

export type StepperController = {
  destroy: () => void;
};

export function mountSteppedBoards(
  host: HTMLElement,
  opts: SteppedBoardsOptions,
): StepperController {
  const expectedBoards = boardsInLayout(opts.layout);
  if (opts.positions.length === 0) {
    throw new Error('Stepper requires at least one position');
  }
  for (const pos of opts.positions) {
    if (pos.boards.length !== expectedBoards) {
      throw new Error(
        `Layout '${opts.layout}' expects ${expectedBoards} board(s) per position, got ${pos.boards.length}`,
      );
    }
  }

  host.classList.add('stepper');
  host.dataset.layout = opts.layout;
  // Make the widget focusable so keyboard nav (arrows, Q/E) routes through
  // here when the user tabs into it or clicks the prev/next buttons.
  const ownedTabindex = !host.hasAttribute('tabindex');
  if (ownedTabindex) host.tabIndex = 0;

  const row = document.createElement('div');
  row.className = 'stepper-boards';
  row.dataset.layout = opts.layout;

  const cells: { labelEl: HTMLElement; boardWrap: HTMLElement; api: Api }[] = [];
  for (let i = 0; i < expectedBoards; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'stepper-board-cell';
    const labelEl = document.createElement('div');
    labelEl.className = 'stepper-board-label';
    const boardWrap = document.createElement('div');
    boardWrap.className = 'stepper-board-wrap';
    const boardEl = document.createElement('div');
    boardEl.className = 'stepper-board cg-wrap';
    boardWrap.append(boardEl);
    cell.append(labelEl, boardWrap);
    row.append(cell);
    const initial = opts.positions[0]!.boards[i]!;
    const initialFog = initial.fogSquares ?? [];
    const api = Chessground(boardEl, {
      animation: { enabled: false },
      coordinates: false,
      coordinatesOnSquares: false,
      fen: boardFen(visibleBoard(initial.board, initialFog)),
      orientation: initial.orientation ?? 'white',
      highlight: {
        custom: fogSquareClasses(
          initialFog,
          initial.highlightSquares ?? [],
          initial.orientation ?? 'white',
        ),
      },
      movable: { free: false, color: undefined, dests: new Map() },
      draggable: { enabled: false },
      selectable: { enabled: false },
      premovable: { enabled: false },
      drawable: { enabled: false, shapes: toShapes(initial.arrows) },
      viewOnly: true,
    });
    cells.push({ labelEl, boardWrap, api });
  }

  const narrative = document.createElement('div');
  narrative.className = 'stepper-narrative';

  const controls = document.createElement('div');
  controls.className = 'stepper-controls';
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'stepper-button stepper-button-prev';
  prev.setAttribute('aria-label', 'Previous step');
  prev.textContent = '←';
  const counter = document.createElement('span');
  counter.className = 'stepper-counter';
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'stepper-button stepper-button-next';
  next.setAttribute('aria-label', 'Next step');
  next.textContent = '→';
  controls.append(prev, counter, next);

  host.append(row, controls, narrative);

  let stepIdx = 0;

  function render(): void {
    const pos = opts.positions[stepIdx]!;
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i]!;
      const spec = pos.boards[i]!;
      cell.labelEl.textContent = spec.label ?? '';
      const fog = spec.fogSquares ?? [];
      cell.api.set({
        fen: boardFen(visibleBoard(spec.board, fog)),
        orientation: spec.orientation ?? 'white',
        highlight: {
          custom: fogSquareClasses(fog, spec.highlightSquares ?? [], spec.orientation ?? 'white'),
        },
        drawable: { enabled: false, shapes: toShapes(spec.arrows) },
      });
    }
    narrative.textContent = pos.narrative ?? '';
    counter.textContent = `${stepIdx + 1} / ${opts.positions.length}`;
    // If we're about to disable the currently focused button, hand focus
    // back to the host so its keydown listener keeps catching arrows/Q/E.
    // Disabled buttons drop focus to <body>, breaking keyboard nav.
    const willDisablePrev = stepIdx === 0;
    const willDisableNext = stepIdx === opts.positions.length - 1;
    const focused = document.activeElement;
    if ((focused === prev && willDisablePrev) || (focused === next && willDisableNext)) {
      host.focus();
    }
    prev.disabled = willDisablePrev;
    next.disabled = willDisableNext;

    // Outcome badge — removed on every render so the pop-in animation
    // replays whenever the user steps into the outcome position.
    for (const c of cells) {
      const existing = c.boardWrap.querySelector('.board-result');
      if (existing) existing.remove();
    }
    if (pos.outcome) {
      const middleIdx = Math.floor(cells.length / 2);
      cells[middleIdx]!.boardWrap.append(buildOutcomeBadge(pos.outcome));
    }
  }

  function buildOutcomeBadge(outcome: StepperOutcome): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'board-result board-result--outcome';
    if (outcome.tone) overlay.dataset.outcome = outcome.tone;
    const badge = document.createElement('div');
    badge.className = 'board-result__badge';
    const title = document.createElement('strong');
    title.textContent = outcome.headline;
    badge.append(title);
    if (outcome.reason) {
      const reason = document.createElement('span');
      reason.textContent = outcome.reason;
      badge.append(reason);
    }
    overlay.append(badge);
    return overlay;
  }

  function onPrev(): void {
    if (stepIdx > 0) {
      stepIdx -= 1;
      render();
    }
  }
  function onNext(): void {
    if (stepIdx < opts.positions.length - 1) {
      stepIdx += 1;
      render();
    }
  }
  function onKeyDown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    switch (event.key) {
      case 'ArrowLeft':
      case 'q':
      case 'Q':
        event.preventDefault();
        onPrev();
        return;
      case 'ArrowRight':
      case 'e':
      case 'E':
        event.preventDefault();
        onNext();
        return;
    }
  }

  prev.addEventListener('click', onPrev);
  next.addEventListener('click', onNext);
  host.addEventListener('keydown', onKeyDown);

  render();
  // Arrow coords need chessground to have computed DOM bounds first, which
  // doesn't happen until layout completes. Re-render shapes on the next
  // animation frame to lock in real pixel coordinates instead of NaN.
  requestAnimationFrame(() => {
    for (const cell of cells) cell.api.redrawAll();
  });
  // Animations stay off: with fog applied, chessground sees pieces appear
  // and disappear as visibility changes and would animate "movement" that
  // didn't actually happen. The stepper transitions are discrete frames,
  // not a move feed — instant updates are correct.

  return {
    destroy(): void {
      prev.removeEventListener('click', onPrev);
      next.removeEventListener('click', onNext);
      host.removeEventListener('keydown', onKeyDown);
      for (const cell of cells) cell.api.destroy();
      host.replaceChildren();
      host.classList.remove('stepper');
      if (ownedTabindex) host.removeAttribute('tabindex');
      delete host.dataset.layout;
    },
  };
}
