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
        return not captures
    return captures == {obs.own_capture_square}


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
        game_over=game_over,
    )
