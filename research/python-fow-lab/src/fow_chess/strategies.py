"""Concrete fog-of-war strategies for the self-play harness."""

from __future__ import annotations

import random
from dataclasses import dataclass, field

import chess

from .belief import BeliefState
from .engine import EvaluatorBuilder, best_action
from .move_priors import OpponentMovePrior, uniform_prior
from .observation import Observation
from .selfplay import PerspectiveView


class RandomStrategy:
    """Picks uniformly at random from legal moves. Baseline opponent."""

    def __init__(self, seed: int = 0) -> None:
        self.rng = random.Random(seed)

    def reset(self, perspective: chess.Color) -> None:
        self.perspective = perspective

    def observe_own_move(self, move: chess.Move) -> None:
        pass

    def observe_opp_move(self, observation: Observation) -> None:
        pass

    def pick_move(self, view: PerspectiveView) -> chess.Move:
        return self.rng.choice(view.own_legal_moves)


@dataclass
class Tier1Strategy:
    """Belief tracker + per-particle evaluator vote.

    The evaluator is taken in via an `EvaluatorBuilder`: a callable that
    produces a per-move Evaluator given the current PerspectiveView. View-
    independent evaluators (material, Stockfish) wrap with
    `engine.static_builder`. Visibility-grounded evaluators close over the
    view to compute threats from observed truth.
    """

    evaluator_builder: EvaluatorBuilder
    move_prior: OpponentMovePrior = field(default=uniform_prior)
    target_n: int = 256
    max_eval_particles: int = 16
    risk_aversion: float = 0.0
    seed: int = 0

    def __post_init__(self) -> None:
        self._rng = random.Random(self.seed)
        self._belief: BeliefState | None = None

    def reset(self, perspective: chess.Color) -> None:
        self._belief = BeliefState.initial(
            perspective=perspective,
            move_prior=self.move_prior,
            target_n=self.target_n,
            rng=random.Random(self.seed + (1 if perspective == chess.BLACK else 0)),
        )

    def observe_own_move(self, move: chess.Move) -> None:
        assert self._belief is not None
        self._belief.update_after_own_move(move)

    def observe_opp_move(self, observation: Observation) -> None:
        assert self._belief is not None
        self._belief.update_after_opp_move(observation)

    def pick_move(self, view: PerspectiveView) -> chess.Move:
        assert self._belief is not None
        evaluator = self.evaluator_builder(view)
        return best_action(
            self._belief,
            evaluator,
            view.own_legal_moves,
            max_particles=self.max_eval_particles,
            risk_aversion=self.risk_aversion,
            rng=self._rng,
        )
