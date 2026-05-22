import type { Board, Color, Square } from '@mistboard/game';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type * as cg from 'chessground/types';
import { boardFen } from './board.js';

export type LiveBoardArrow = {
  orig: Square;
  dest: Square;
  brush?: 'green' | 'red' | 'blue' | 'yellow';
};

export type LiveBoardSpec = {
  board: Board;
  fogSquares?: Square[];
  orientation?: Color;
  label?: string;
  arrows?: LiveBoardArrow[];
};

export type LiveBoardsLayout = 'single' | 'pair' | 'triptych' | 'grid';

export type LiveBoardsOptions = {
  layout: LiveBoardsLayout;
  boards: LiveBoardSpec[];
};

export type LiveBoardsController = {
  destroy: () => void;
};

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

export function mountLiveBoards(host: HTMLElement, opts: LiveBoardsOptions): LiveBoardsController {
  host.classList.add('live-boards');
  host.dataset.layout = opts.layout;

  const apis: Api[] = [];
  for (const spec of opts.boards) {
    const cell = document.createElement('div');
    cell.className = 'live-boards-cell';

    const labelEl = document.createElement('div');
    labelEl.className = 'live-boards-label';
    if (spec.label) labelEl.textContent = spec.label;
    else labelEl.classList.add('live-boards-label-empty');

    const boardWrap = document.createElement('div');
    boardWrap.className = 'live-boards-board-wrap';
    const boardEl = document.createElement('div');
    boardEl.className = 'live-boards-board cg-wrap';
    boardWrap.append(boardEl);

    cell.append(labelEl, boardWrap);
    host.append(cell);

    const fog = spec.fogSquares ?? [];
    const shapes = (spec.arrows ?? []).map((a) => ({
      orig: a.orig as cg.Key,
      dest: a.dest as cg.Key,
      brush: a.brush ?? 'green',
    }));
    const api = Chessground(boardEl, {
      animation: { enabled: false },
      coordinates: false,
      coordinatesOnSquares: false,
      fen: boardFen(visibleBoard(spec.board, fog)),
      orientation: spec.orientation ?? 'white',
      highlight: { custom: fogSquareClasses(fog) },
      movable: { free: false, color: undefined, dests: new Map() },
      draggable: { enabled: false },
      selectable: { enabled: false },
      premovable: { enabled: false },
      drawable: { enabled: false, shapes },
      viewOnly: true,
    });
    apis.push(api);
  }

  return {
    destroy(): void {
      for (const api of apis) api.destroy();
      host.replaceChildren();
      host.classList.remove('live-boards');
      delete host.dataset.layout;
    },
  };
}
