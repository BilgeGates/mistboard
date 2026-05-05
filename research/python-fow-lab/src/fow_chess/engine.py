"""Tier-1 fog of war engine: belief tracker + per-particle evaluator + risk-adjusted vote."""

from __future__ import annotations

from typing import Protocol

import chess

from .belief import BeliefState


class Evaluator(Protocol):
    """Scores a candidate move on a concrete (perfect-info) board for `perspective`."""

    def __call__(
        self,
        board: chess.Board,
        move: chess.Move,
        perspective: chess.Color,
    ) -> float: ...


def best_action(
    belief: BeliefState,
    evaluator: Evaluator,
    risk_floor: float | None = None,
) -> chess.Move:
    """Pick a move by weighted vote across particles, optionally penalizing worst-case-particle value."""
    raise NotImplementedError
