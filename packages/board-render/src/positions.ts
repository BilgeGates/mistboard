import type { PieceRole } from '@mistboard/game';
import type { PieceOnBoard } from './board-svg.js';

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
