"""Opponent move priors used by the particle filter."""

from __future__ import annotations

from typing import Protocol

import chess


class OpponentMovePrior(Protocol):
    """Probability over an opponent's legal moves given a candidate true board."""

    def __call__(
        self, board: chess.Board, legal: list[chess.Move]
    ) -> list[float]: ...


def uniform_prior(board: chess.Board, legal: list[chess.Move]) -> list[float]:
    """Uniform distribution over legal moves; the simplest baseline."""
    n = len(legal)
    return [1.0 / n] * n if n else []
