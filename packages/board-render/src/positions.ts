import type { Board, PieceRole, Square } from '@mistboard/game';
import type { PieceOnBoard } from './board-svg.js';

const FILE_CHARS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

// Given an 8-piece back rank, return the full starting position
// (back rank + 8 pawns each side). Suitable for standard chess and
// any valid Chess960 setup.
export function startingPositionFromBackRank(backRank: PieceRole[]): PieceOnBoard[] {
  if (backRank.length !== 8) {
    throw new Error(`Back rank must have exactly 8 pieces, got ${backRank.length}`);
  }
  const pieces: PieceOnBoard[] = [];
  for (let f = 0; f < 8; f += 1) {
    pieces.push({ file: f, rank: 0, color: 'white', role: backRank[f]! });
    pieces.push({ file: f, rank: 1, color: 'white', role: 'pawn' });
    pieces.push({ file: f, rank: 6, color: 'black', role: 'pawn' });
    pieces.push({ file: f, rank: 7, color: 'black', role: backRank[f]! });
  }
  return pieces;
}

// Convert the file/rank-indexed PieceOnBoard[] used by the static SVG
// renderer into the canonical Square-keyed Board used by chessground and
// game logic.
export function piecesToBoard(pieces: PieceOnBoard[]): Board {
  const board: Board = {};
  for (const p of pieces) {
    const square = `${FILE_CHARS[p.file]}${p.rank + 1}` as Square;
    board[square] = { color: p.color, role: p.role };
  }
  return board;
}

// Inverse of piecesToBoard. Square 'a1' → { file: 0, rank: 0 }, etc.
export function boardToPieces(board: Board): PieceOnBoard[] {
  const pieces: PieceOnBoard[] = [];
  for (const [sq, piece] of Object.entries(board)) {
    if (!piece) continue;
    const file = FILE_CHARS.indexOf(sq[0] as (typeof FILE_CHARS)[number]);
    const rank = Number(sq[1]) - 1;
    pieces.push({ file, rank, color: piece.color, role: piece.role });
  }
  return pieces;
}

// All 64 squares minus the visible set. Useful for converting a PlayerView's
// visibleSquares into the fogSquares input that the static composer takes.
const ALL_SQUARES: Square[] = (() => {
  const out: Square[] = [];
  for (const f of FILE_CHARS) for (let r = 1; r <= 8; r += 1) out.push(`${f}${r}` as Square);
  return out;
})();

export function fogSquaresFromVisible(visibleSquares: Square[]): Square[] {
  const visible = new Set(visibleSquares);
  return ALL_SQUARES.filter((sq) => !visible.has(sq));
}
