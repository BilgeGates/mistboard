import type { Board, Color, PieceRole, PlayerView, Square } from '@mistboard/game';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type * as cg from 'chessground/types';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const ranks = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export const allBoardSquares: Square[] = ranks.flatMap((rank) => (
  files.map((file) => `${file}${rank}` as Square)
));

export function createReadOnlyBoard(el: HTMLElement, orientation: Color = 'white'): Api {
  return Chessground(el, {
    animation: { enabled: true, duration: 140 },
    coordinates: false,
    coordinatesOnSquares: false,
    fen: '8/8/8/8/8/8/8/8',
    orientation,
    movable: { free: false, color: undefined, dests: new Map() },
    draggable: { enabled: false },
    selectable: { enabled: false },
    premovable: { enabled: false },
    viewOnly: true,
  });
}

export function setBoardPosition(
  api: Api,
  board: Board,
  squareClasses: cg.SquareClasses = new Map(),
): void {
  api.set({
    fen: boardFen(board),
    highlight: { custom: squareClasses, lastMove: true },
  });
}

export function hiddenSquareClasses(view: Pick<PlayerView, 'variant' | 'status' | 'visibleSquares'>): cg.SquareClasses {
  const classes = new Map<cg.Key, string>();
  if (view.variant !== 'fog-of-war' || view.status.type === 'finished') return classes;

  const visible = new Set(view.visibleSquares);
  for (const square of allBoardSquares) {
    if (!visible.has(square)) classes.set(square as cg.Key, 'fog-hidden');
  }
  return classes;
}

export function boardFen(board: Board): string {
  const fenRanks = [8, 7, 6, 5, 4, 3, 2, 1];
  return fenRanks.map((rank) => boardRankFen(board, rank)).join('/');
}

function boardRankFen(board: Board, rank: number): string {
  let empty = 0;
  let fen = '';
  for (const file of files) {
    const piece = board[`${file}${rank}` as Square];
    if (!piece) {
      empty += 1;
      continue;
    }
    if (empty > 0) {
      fen += String(empty);
      empty = 0;
    }
    fen += pieceFen(piece.role, piece.color);
  }
  return empty > 0 ? `${fen}${empty}` : fen;
}

function pieceFen(role: PieceRole, color: Color): string {
  const map: Record<PieceRole, string> = {
    bishop: 'b',
    king: 'k',
    knight: 'n',
    pawn: 'p',
    queen: 'q',
    rook: 'r',
  };
  const ch = map[role];
  return color === 'white' ? ch.toUpperCase() : ch;
}
