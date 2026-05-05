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
    rng: random.Random | None = None,
) -> chess.Move:
    """Pick a move by weighted vote across particles.

    For each candidate move, average the evaluator's score across particles
    in which the move is pseudo-legal, weighted by particle weight. Particles
    where the move is illegal abstain (don't penalize, don't reward).

    `max_particles` caps how many particles are scored per move — Stockfish
    calls dominate cost, so subsampling controls per-move latency. When the
    belief has more particles than the cap, sample without replacement
    weighted by particle weight.
    """
    if not own_legal_moves:
        raise ValueError("best_action called with empty own_legal_moves")
    if not belief.particles:
        # Belief collapsed (no consistent particles) — fall back to first legal.
        # Caller should treat this as a known degenerate case.
        return own_legal_moves[0]

    rng = rng or random.Random(0)
    sampled_particles, sampled_weights = _sample_particles(belief, max_particles, rng)

    # Score each candidate move; break ties uniformly at random over moves
    # whose score is within an epsilon band of the best. Without this, all
    # equal-scored moves resolve to the first legal one (alphabetic on
    # from-square), so an early-opening move set with no captures collapses
    # to a fixed deterministic line — a real handicap when the opening has
    # no material gradient.
    move_scores: list[tuple[chess.Move, float, float]] = []
    best_score = float("-inf")
    for move in own_legal_moves:
        weighted_sum = 0.0
        total_weight = 0.0
        for particle, weight in zip(sampled_particles, sampled_weights):
            if not particle.is_pseudo_legal(move):
                continue
            score = evaluator(particle, move, belief.perspective)
            weighted_sum += weight * score
            total_weight += weight
        if total_weight <= 0.0:
            continue
        avg = weighted_sum / total_weight
        move_scores.append((move, avg, total_weight))
        if avg > best_score:
            best_score = avg

    if not move_scores:
        return own_legal_moves[0]

    epsilon = 1e-6
    candidates = [
        (move, support)
        for move, score, support in move_scores
        if score >= best_score - epsilon
    ]
    # Tiebreak by sample over equal-score moves; weight by support so moves
    # legal in more particles are slightly preferred among equals.
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
