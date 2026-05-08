"""Per-ply observation a perspective player makes in fog of war chess."""

from __future__ import annotations

from dataclasses import dataclass, field

import chess

from .visibility import visible_piece_map, visible_squares


@dataclass(frozen=True)
class GameOver:
    """Terminal signal observed when the game ends."""

    winner: chess.Color | None
    reason: str


@dataclass(frozen=True)
class Observation:
    """What the perspective player learns immediately after the opponent moves."""

    visibility_mask: chess.SquareSet
    visible_pieces: dict[chess.Square, chess.Piece] = field(default_factory=dict)
    own_capture_square: chess.Square | None = None
    # When an opponent normally captures one of our pieces, we may not know the
    # capturer's type, but we do know an opponent piece landed on the captured
    # square. En passant is the exception; then the captured square is not the
    # landing square, so this stays None unless the landing square is otherwise
    # inferable by visibility.
    opp_capture_landing_square: chess.Square | None = None
    game_over: GameOver | None = None


def consistent_with(
    next_board: chess.Board,
    prev_board: chess.Board,
    obs: Observation,
    perspective: chess.Color,
) -> bool:
    """True iff `next_board` could have produced `obs` for `perspective` from `prev_board`."""
    if visible_squares(next_board, perspective) != obs.visibility_mask:
        return False
    if visible_piece_map(next_board, perspective) != obs.visible_pieces:
        return False

    own_before = {
        sq for sq, p in prev_board.piece_map().items() if p.color == perspective
    }
    own_after = {
        sq for sq, p in next_board.piece_map().items() if p.color == perspective
    }
    captures = own_before - own_after

    if obs.own_capture_square is None:
        if captures:
            return False
    elif captures != {obs.own_capture_square}:
        return False

    if obs.opp_capture_landing_square is not None:
        landing_piece = next_board.piece_at(obs.opp_capture_landing_square)
        if landing_piece is None or landing_piece.color == perspective:
            return False

    return True


def observation_from_transition(
    prev_board: chess.Board,
    next_board: chess.Board,
    perspective: chess.Color,
) -> Observation:
    """Build the Observation `perspective` makes from the canonical transition `prev_board` -> `next_board`."""
    own_before = {
        sq for sq, p in prev_board.piece_map().items() if p.color == perspective
    }
    own_after = {
        sq for sq, p in next_board.piece_map().items() if p.color == perspective
    }
    captures = own_before - own_after
    captured = next(iter(captures), None)
    opp_capture_landing_square: chess.Square | None = None
    if captured is not None:
        landing_piece = next_board.piece_at(captured)
        if landing_piece is not None and landing_piece.color != perspective:
            opp_capture_landing_square = captured

    game_over: GameOver | None = None
    if (
        prev_board.king(perspective) is not None
        and next_board.king(perspective) is None
    ):
        game_over = GameOver(winner=not perspective, reason="king-captured")

    return Observation(
        visibility_mask=visible_squares(next_board, perspective),
        visible_pieces=visible_piece_map(next_board, perspective),
        own_capture_square=captured,
        opp_capture_landing_square=opp_capture_landing_square,
        game_over=game_over,
    )
