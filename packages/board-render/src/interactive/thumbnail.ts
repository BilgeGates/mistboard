import type { Board, Color, Square } from '@mistboard/game';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type * as cg from 'chessground/types';
import { boardFen, fogHiddenClass } from './board.js';

export type ThumbnailBoardSpec = {
  board: Board;
  fogSquares?: Square[];
  orientation?: Color;
};

export type ThumbnailBoardController = {
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

function fogSquareClasses(fogSquares: Square[], orientation: Color): cg.SquareClasses {
  const classes = new Map<cg.Key, string>();
  for (const sq of fogSquares) classes.set(sq as cg.Key, fogHiddenClass(sq, orientation));
  return classes;
}

// Single read-only chessground sized to fill its host. Used for the
// articles-index card thumbnails so they pick up the user's board/fog/piece
// theme from :root data attributes, same as every live board.
export function mountThumbnailBoard(
  host: HTMLElement,
  spec: ThumbnailBoardSpec,
): ThumbnailBoardController {
  const fog = spec.fogSquares ?? [];
  const api: Api = Chessground(host, {
    animation: { enabled: false },
    coordinates: false,
    coordinatesOnSquares: false,
    fen: boardFen(visibleBoard(spec.board, fog)),
    orientation: spec.orientation ?? 'white',
    highlight: { custom: fogSquareClasses(fog, spec.orientation ?? 'white') },
    movable: { free: false, color: undefined, dests: new Map() },
    draggable: { enabled: false },
    selectable: { enabled: false },
    premovable: { enabled: false },
    drawable: { enabled: false },
    viewOnly: true,
  });
  return {
    destroy(): void {
      api.destroy();
    },
  };
}
