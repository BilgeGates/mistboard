import type { Move, PlayerView, Square } from '@mistboard/game';

/**
 * Fog Chess encodes castling as king-to-rook so Chess960 positions stay
 * unambiguous. The UI also accepts the king's familiar destination square.
 */
export function castlingKingDestinationFromView(view: PlayerView, move: Move): Square | null {
  const king = view.board[move.from];
  const rook = view.board[move.to];
  if (king?.role !== 'king' || rook?.role !== 'rook' || rook.color !== king.color) return null;
  if (rankOf(move.from) !== rankOf(move.to)) return null;

  const destinationFile = move.to.charCodeAt(0) > move.from.charCodeAt(0) ? 'g' : 'c';
  return `${destinationFile}${rankOf(move.from)}` as Square;
}

function rankOf(square: Square): string {
  return square.slice(1);
}
