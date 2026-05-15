import type { Board, Square } from '@mistboard/game';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type * as cg from 'chessground/types';
import { boardFen } from './board.js';
import { boardsInLayout, type CompositionLayout } from '../layouts.js';

export type StepperBoardSpec = {
  board: Board;
  fogSquares?: Square[];
  orientation?: 'white' | 'black';
  label?: string;
};

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

function fogSquareClasses(fogSquares: Square[]): cg.SquareClasses {
  const classes = new Map<cg.Key, string>();
  for (const sq of fogSquares) classes.set(sq as cg.Key, 'fog-hidden');
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

export function mountSteppedBoards(host: HTMLElement, opts: SteppedBoardsOptions): StepperController {
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
      highlight: { custom: fogSquareClasses(initialFog) },
      movable: { free: false, color: undefined, dests: new Map() },
      draggable: { enabled: false },
      selectable: { enabled: false },
      premovable: { enabled: false },
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
        highlight: { custom: fogSquareClasses(fog) },
      });
    }
    narrative.textContent = pos.narrative ?? '';
    counter.textContent = `${stepIdx + 1} / ${opts.positions.length}`;
    prev.disabled = stepIdx === 0;
    next.disabled = stepIdx === opts.positions.length - 1;

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
  prev.addEventListener('click', onPrev);
  next.addEventListener('click', onNext);

  render();
  // Re-enable animations after the initial mount so subsequent step
  // changes animate piece movement.
  for (const cell of cells) cell.api.set({ animation: { enabled: true, duration: 220 } });

  return {
    destroy(): void {
      prev.removeEventListener('click', onPrev);
      next.removeEventListener('click', onNext);
      for (const cell of cells) cell.api.destroy();
      host.replaceChildren();
      host.classList.remove('stepper');
      delete host.dataset.layout;
    },
  };
}
