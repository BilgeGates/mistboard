"""Tier-1 fog of war engine: belief tracker + per-particle evaluator + weighted vote."""

from __future__ import annotations

import random
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
    own_legal_moves: list[chess.Move],
    *,
    max_particles: int | None = 16,
    risk_aversion: float = 0.0,
    rng: random.Random | None = None,
) -> chess.Move:
    """Pick a move by weighted vote across particles.

    For each candidate move, the evaluator scores it on each sampled particle
    where the move is pseudo-legal. We then collapse those particle scores
    into a single move score:

        final = (1 - risk_aversion) * mean + risk_aversion * worst

    where `mean` is the particle-weight-weighted average and `worst` is the
    minimum across legal particles. `risk_aversion` ∈ [0, 1] interpolates:
    0 is pure mean (current behavior); 1 is CVaR-style worst-case. The
    intermediate range trades off "mean is good" against "no particle
    catastrophes" — useful when Tier-1 walks into traps because the average
    particle says a move is fine but a few particles say it loses material.

    Ties are broken uniformly-at-random within an epsilon band of the best
    score, weighted by the move's particle support. Without random tiebreak,
    an opening with no captures collapses to a fixed deterministic line.

    `max_particles` caps how many particles are scored per move — when
    belief has more particles than the cap, sample weighted by particle weight.
    """
    if not own_legal_moves:
        raise ValueError("best_action called with empty own_legal_moves")
    if not belief.particles:
        return own_legal_moves[0]
    if not 0.0 <= risk_aversion <= 1.0:
        raise ValueError(f"risk_aversion must be in [0, 1], got {risk_aversion}")

    rng = rng or random.Random(0)
    sampled_particles, sampled_weights = _sample_particles(belief, max_particles, rng)

    move_scores: list[tuple[chess.Move, float, float]] = []
    best_score = float("-inf")
    for move in own_legal_moves:
        weighted_sum = 0.0
        total_weight = 0.0
        worst = float("inf")
        for particle, weight in zip(sampled_particles, sampled_weights):
            if not particle.is_pseudo_legal(move):
                continue
            score = evaluator(particle, move, belief.perspective)
            weighted_sum += weight * score
            total_weight += weight
            if score < worst:
                worst = score
        if total_weight <= 0.0:
            continue
        mean = weighted_sum / total_weight
        if risk_aversion == 0.0:
            final = mean
        else:
            final = (1.0 - risk_aversion) * mean + risk_aversion * worst
        move_scores.append((move, final, total_weight))
        if final > best_score:
            best_score = final

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
    probs = [w / total for w in belief.weights]
    indices = rng.choices(range(len(belief.particles)), weights=probs, k=max_particles)
    particles = [belief.particles[i] for i in indices]
    # Each draw contributes 1/k of the sample mass.
    weights = [1.0 / max_particles] * max_particles
    return particles, weights
