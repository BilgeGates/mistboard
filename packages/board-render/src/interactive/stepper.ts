import type { Board } from '@mistboard/game';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import { boardFen } from './board.js';
import { boardsInLayout, type CompositionLayout } from '../layouts.js';

export type StepperBoardSpec = {
  board: Board;
  orientation?: 'white' | 'black';
  label?: string;
};

export type StepperPosition = {
  boards: StepperBoardSpec[];
  narrative?: string;
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

  const cells: { labelEl: HTMLElement; api: Api }[] = [];
  for (let i = 0; i < expectedBoards; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'stepper-board-cell';
    const labelEl = document.createElement('div');
    labelEl.className = 'stepper-board-label';
    const boardEl = document.createElement('div');
    boardEl.className = 'stepper-board cg-wrap';
    cell.append(labelEl, boardEl);
    row.append(cell);
    const initial = opts.positions[0]!.boards[i]!;
    const api = Chessground(boardEl, {
      animation: { enabled: false },
      coordinates: false,
      coordinatesOnSquares: false,
      fen: boardFen(initial.board),
      orientation: initial.orientation ?? 'white',
      movable: { free: false, color: undefined, dests: new Map() },
      draggable: { enabled: false },
      selectable: { enabled: false },
      premovable: { enabled: false },
      viewOnly: true,
    });
    cells.push({ labelEl, api });
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

  host.append(row, narrative, controls);

  let stepIdx = 0;

  function render(): void {
    const pos = opts.positions[stepIdx]!;
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i]!;
      const spec = pos.boards[i]!;
      cell.labelEl.textContent = spec.label ?? '';
      cell.api.set({
        fen: boardFen(spec.board),
        orientation: spec.orientation ?? 'white',
      });
    }
    narrative.textContent = pos.narrative ?? '';
    counter.textContent = `${stepIdx + 1} / ${opts.positions.length}`;
    prev.disabled = stepIdx === 0;
    next.disabled = stepIdx === opts.positions.length - 1;
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
