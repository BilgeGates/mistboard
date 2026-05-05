"""Particle-filter belief state for fog of war chess."""

from __future__ import annotations

import random
from dataclasses import dataclass, field

import chess

from .move_priors import OpponentMovePrior
from .observation import Observation, consistent_with


@dataclass
class BeliefState:
    """A weighted particle distribution over true boards consistent with observation history."""

    perspective: chess.Color
    move_prior: OpponentMovePrior
    target_n: int = 256
    particles: list[chess.Board] = field(default_factory=list)
    weights: list[float] = field(default_factory=list)
    rng: random.Random = field(default_factory=random.Random)

    @classmethod
    def initial(
        cls,
        perspective: chess.Color,
        move_prior: OpponentMovePrior,
        target_n: int = 256,
        start_board: chess.Board | None = None,
        rng: random.Random | None = None,
    ) -> "BeliefState":
        """Build a belief seeded with a single known starting board."""
        seed_board = (start_board or chess.Board()).copy()
        return cls(
            perspective=perspective,
            move_prior=move_prior,
            target_n=target_n,
            particles=[seed_board],
            weights=[1.0],
            rng=rng or random.Random(),
        )

    def update_after_own_move(self, my_move: chess.Move) -> None:
        """Apply perspective's own move to every particle; drop particles where the move is illegal."""
        next_particles: list[chess.Board] = []
        next_weights: list[float] = []
        for board, weight in zip(self.particles, self.weights):
            if not board.is_pseudo_legal(my_move):
                continue
            advanced = board.copy()
            advanced.push(my_move)
            next_particles.append(advanced)
            next_weights.append(weight)
        self.particles = next_particles
        self.weights = next_weights

    def update_after_opp_move(self, obs: Observation) -> None:
        """Expand each particle by opponent's pseudo-legal moves, filter by `obs`, then resample to `target_n`."""
        expanded_particles: list[chess.Board] = []
        expanded_weights: list[float] = []

        for prev_board, prev_weight in zip(self.particles, self.weights):
            legal = list(prev_board.pseudo_legal_moves)
            if not legal:
                continue
            priors = self.move_prior(prev_board, legal)
            for mv, p in zip(legal, priors):
                if p <= 0.0:
                    continue
                next_board = prev_board.copy()
                next_board.push(mv)
                if not consistent_with(next_board, prev_board, obs, self.perspective):
                    continue
                expanded_particles.append(next_board)
                expanded_weights.append(prev_weight * p)

        if not expanded_particles:
            self.particles = []
            self.weights = []
            return

        self.particles, self.weights = _resample(
            expanded_particles, expanded_weights, self.target_n, self.rng
        )

    def marginal_piece_at(
        self, square: chess.Square
    ) -> dict[chess.Piece | None, float]:
        """Marginal distribution over what occupies `square` (None = empty)."""
        if not self.particles:
            return {}
        total = sum(self.weights)
        if total <= 0:
            return {}
        result: dict[chess.Piece | None, float] = {}
        for board, weight in zip(self.particles, self.weights):
            piece = board.piece_at(square)
            result[piece] = result.get(piece, 0.0) + weight / total
        return result

    def collapsed(self) -> bool:
        """True if no particle survived the most recent update; signals a tracker bug or rule mismatch."""
        return not self.particles


def _resample(
    particles: list[chess.Board],
    weights: list[float],
    target_n: int,
    rng: random.Random,
) -> tuple[list[chess.Board], list[float]]:
    total = sum(weights)
    if total <= 0:
        return [], []
    probs = [w / total for w in weights]
    indices = rng.choices(range(len(particles)), weights=probs, k=target_n)
    new_particles = [particles[i].copy() for i in indices]
    new_weights = [1.0 / target_n] * target_n
    return new_particles, new_weights
