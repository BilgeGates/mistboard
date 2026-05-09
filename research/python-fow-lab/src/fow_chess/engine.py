"""Tier-1 fog of war engine: belief tracker + per-particle evaluator + weighted vote."""

from __future__ import annotations

import random
import time
import math
from typing import TYPE_CHECKING, Callable, Protocol

import chess

from .belief import BeliefState

if TYPE_CHECKING:
    from .selfplay import PerspectiveView


class Evaluator(Protocol):
    """Scores a candidate move on a concrete (perfect-info) board for `perspective`."""

    def __call__(
        self,
        board: chess.Board,
        move: chess.Move,
        perspective: chess.Color,
    ) -> float: ...


# An EvaluatorBuilder produces a per-move Evaluator, optionally informed by the
# current PerspectiveView. Strategies that need visibility-grounded heuristics
# (threats counted from observed truth rather than particle hypotheses) build a
# fresh evaluator per move; view-independent evaluators wrap with `static_builder`.
EvaluatorBuilder = Callable[["PerspectiveView"], Evaluator]


def static_builder(evaluator: Evaluator) -> EvaluatorBuilder:
    """Wrap a view-independent Evaluator as an EvaluatorBuilder."""

    def build(view: "PerspectiveView") -> Evaluator:
        return evaluator

    return build


def best_action(
    belief: BeliefState,
    evaluator: Evaluator,
    own_legal_moves: list[chess.Move],
    *,
    max_particles: int | None = 16,
    risk_aversion: float = 0.0,
    rng: random.Random | None = None,
    deadline_monotonic: float | None = None,
    out_scored_moves: list[tuple[chess.Move, float, float]] | None = None,
) -> chess.Move:
    """Pick a move by weighted vote across particles.

    Evaluation order is **particle-major** so the algorithm is anytime:
    every move is scored on particle[0] before any move is scored on
    particle[1], etc. This satisfies the floor guarantee — every legal
    move has a score before the deadline can interrupt. After round 1
    completes, the deadline is checked between subsequent particle rounds.

    `final = (1 - risk_aversion) * mean + risk_aversion * worst` where
    `mean` is the particle-weight-weighted average and `worst` is the
    minimum across legal particles. `risk_aversion` ∈ [0, 1] interpolates:
    0 is pure mean; 1 is CVaR-style worst-case.

    Ties are broken uniformly-at-random within an epsilon band of the best
    score, weighted by the move's particle support.

    `max_particles` caps how many particles are scored per move (sampled by
    weight when belief has more). `deadline_monotonic` is a `time.monotonic()`
    target after which the algorithm returns the best move found so far —
    None = no deadline (regime-1 / untimed).
    """
    if not own_legal_moves:
        raise ValueError("best_action called with empty own_legal_moves")
    if not belief.particles:
        return own_legal_moves[0]
    if not 0.0 <= risk_aversion <= 1.0:
        raise ValueError(f"risk_aversion must be in [0, 1], got {risk_aversion}")

    rng = rng or random.Random(0)
    sampled_particles, sampled_weights = _sample_particles(belief, max_particles, rng)

    n_moves = len(own_legal_moves)
    weighted_sum = [0.0] * n_moves
    total_weight = [0.0] * n_moves
    worst = [float("inf")] * n_moves

    for round_idx, (particle, weight) in enumerate(
        zip(sampled_particles, sampled_weights)
    ):
        for move_idx, move in enumerate(own_legal_moves):
            if not particle.is_pseudo_legal(move):
                continue
            score = evaluator(particle, move, belief.perspective)
            weighted_sum[move_idx] += weight * score
            total_weight[move_idx] += weight
            if score < worst[move_idx]:
                worst[move_idx] = score
        # Floor: round 0 must complete (every move scored on particle 0)
        # before we can interrupt. After that, check deadline between rounds.
        if (
            round_idx >= 0
            and deadline_monotonic is not None
            and time.monotonic() >= deadline_monotonic
        ):
            break

    move_scores: list[tuple[chess.Move, float, float]] = []
    best_score = float("-inf")
    for move_idx, move in enumerate(own_legal_moves):
        if total_weight[move_idx] <= 0.0:
            continue
        mean = weighted_sum[move_idx] / total_weight[move_idx]
        if risk_aversion == 0.0:
            final = mean
        else:
            final = (1.0 - risk_aversion) * mean + risk_aversion * worst[move_idx]
        move_scores.append((move, final, total_weight[move_idx]))
        if final > best_score:
            best_score = final

    if out_scored_moves is not None:
        out_scored_moves.extend(move_scores)

    if not move_scores:
        return own_legal_moves[0]

    epsilon = 1e-6
    candidates = [
        (move, support)
        for move, score, support in move_scores
        if score >= best_score - epsilon
    ]
    moves = [m for m, _ in candidates]
    weights = [s for _, s in candidates]
    return rng.choices(moves, weights=weights, k=1)[0]


def _sample_particles(
    belief: BeliefState,
    max_particles: int | None,
    rng: random.Random,
) -> tuple[list[chess.Board], list[float]]:
    if max_particles is None or len(belief.particles) <= max_particles:
        return list(belief.particles), list(belief.weights)

    total = sum(belief.weights)
    if total <= 0:
        return [], []
    if len(belief.particles) <= max_particles:
        return list(belief.particles), list(belief.weights)

    probs = [w / total for w in belief.weights]
    keyed = [
        (-math.log(max(rng.random(), 1e-12)) / prob, idx)
        for idx, prob in enumerate(probs)
        if prob > 0.0
    ]
    keyed.sort()
    indices = [idx for _, idx in keyed[:max_particles]]
    particles = [belief.particles[i] for i in indices]
    selected_total = sum(belief.weights[i] for i in indices)
    if selected_total <= 0:
        return [], []
    weights = [belief.weights[i] / selected_total for i in indices]
    return particles, weights
