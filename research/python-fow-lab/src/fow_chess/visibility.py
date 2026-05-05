"""Visibility helpers for fog of war chess.

Visibility follows the bichess canonical rule: a player sees their own occupied
squares plus the destination square of every pseudo-legal move they can make
under the current board state, regardless of whose turn it is. Castling moves
contribute the rook's original square (matching the bichess fog castling
representation). En passant moves additionally contribute the captured pawn's
square.
"""

from __future__ import annotations

import chess


def visible_squares(board: chess.Board, color: chess.Color) -> chess.SquareSet:
    """Return squares visible to `color` under fog of war."""
    visible = chess.SquareSet(board.occupied_co[color])
    work = board if board.turn == color else _with_turn(board, color)

    for move in work.pseudo_legal_moves:
        if work.is_castling(move):
            rook_sq = _castling_rook_square(work, move)
            if rook_sq is not None:
                visible.add(rook_sq)
            continue
        visible.add(move.to_square)
        if work.is_en_passant(move):
            captured_sq = chess.square(
                chess.square_file(move.to_square),
                chess.square_rank(move.from_square),
            )
            visible.add(captured_sq)

    return visible


def visible_piece_map(
    board: chess.Board, color: chess.Color
) -> dict[chess.Square, chess.Piece]:
    """Return the pieces visible to `color`, keyed by square."""
    visible = visible_squares(board, color)
    return {
        square: piece
        for square, piece in board.piece_map().items()
        if square in visible
    }


def _with_turn(board: chess.Board, color: chess.Color) -> chess.Board:
    work = board.copy()
    work.turn = color
    return work


def _castling_rook_square(
    board: chess.Board, move: chess.Move
) -> chess.Square | None:
    king_from_file = chess.square_file(move.from_square)
    king_to_file = chess.square_file(move.to_square)
    rank = chess.square_rank(move.from_square)
    side_kingside = king_to_file > king_from_file

    for rook_sq in chess.SquareSet(board.castling_rights):
        if chess.square_rank(rook_sq) != rank:
            continue
        rook_file = chess.square_file(rook_sq)
        if side_kingside and rook_file > king_from_file:
            return rook_sq
        if not side_kingside and rook_file < king_from_file:
            return rook_sq
    return None
