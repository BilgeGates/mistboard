import type { Board, Move, PlayerView, Square } from '@mistboard/game';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

function fileIdx(square: Square): number {
  return FILES.indexOf(square[0] as typeof FILES[number]);
}

function rankCh(square: Square): string {
  return square[1] ?? '';
}

/**
 * Phase A board for fog-aware two-phase animation: the board chessground sees
 * before it animates the canonical move. Equal to `view.board` everywhere
 * except the move's source/target squares, which are restored to their
 * pre-move state. Castling restores the rook too; en-passant restores the
 * captured pawn at its actual square.
 *
 * Why: chessground infers animation from piece-set diffs. In FOW the diff
 * also includes pieces that just got fogged/unfogged, which chessground will
 * pair as phantom moves. Snapping to this intermediate board (animation off)
 * then setting `view.board` (animation on) gives chessground a diff that
 * contains only the canonical move.
 */
export function intermediateBoard(
  prevView: PlayerView,
  view: PlayerView,
  lastMove: Move,
): Board {
  const result: Board = { ...view.board };

  const movedPiece = prevView.board[lastMove.from] ?? view.board[lastMove.to];
  if (!movedPiece) return view.board;

  const target = prevView.board[lastMove.to];
  const isCastling =
    movedPiece.role === 'king'
    && target?.role === 'rook'
    && target.color === movedPiece.color;

  if (isCastling) {
    const rank = rankCh(lastMove.from);
    const kingside = fileIdx(lastMove.to) > fileIdx(lastMove.from);
    const kingDest = `${kingside ? 'g' : 'c'}${rank}` as Square;
    const rookDest = `${kingside ? 'f' : 'd'}${rank}` as Square;
    result[lastMove.from] = movedPiece;
    result[lastMove.to] = target;
    if (kingDest !== lastMove.from && kingDest !== lastMove.to) delete result[kingDest];
    if (rookDest !== lastMove.from && rookDest !== lastMove.to) delete result[rookDest];
    return result;
  }

  result[lastMove.from] = movedPiece;
  if (target) {
    result[lastMove.to] = target;
  } else {
    delete result[lastMove.to];
  }

  const enPassant =
    movedPiece.role === 'pawn'
    && fileIdx(lastMove.from) !== fileIdx(lastMove.to)
    && !target;
  if (enPassant) {
    const epSquare = `${lastMove.to[0]}${rankCh(lastMove.from)}` as Square;
    const captured = prevView.board[epSquare];
    if (captured) result[epSquare] = captured;
  }

  return result;
}
