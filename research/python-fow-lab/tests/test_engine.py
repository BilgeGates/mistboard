"""Tier-1 engine plumbing tests (Stockfish-independent)."""

from __future__ import annotations

import chess

from fow_chess.belief import BeliefState
from fow_chess.engine import best_action
from fow_chess.move_priors import uniform_prior


def test_best_action_picks_move_preferred_by_evaluator() -> None:
    belief = BeliefState.initial(
        perspective=chess.WHITE,
        move_prior=uniform_prior,
        target_n=8,
    )
    e2e4 = chess.Move.from_uci("e2e4")
    a2a3 = chess.Move.from_uci("a2a3")

    def evaluator(board, move, perspective):
        return 100.0 if move == e2e4 else 0.0

    chosen = best_action(belief, evaluator, [a2a3, e2e4], max_particles=None)
    assert chosen == e2e4


def test_best_action_returns_first_move_when_belief_empty() -> None:
    belief = BeliefState(
        perspective=chess.WHITE,
        move_prior=uniform_prior,
        particles=[],
        weights=[],
    )

    def evaluator(board, move, perspective):
        return 0.0

    chosen = best_action(
        belief, evaluator, [chess.Move.from_uci("e2e4"), chess.Move.from_uci("d2d4")]
    )
    assert chosen == chess.Move.from_uci("e2e4")


def test_best_action_skips_moves_no_particle_considers_legal() -> None:
    # All particles share the standard initial position, so e7e5 is illegal
    # for white to play (not a white piece on e7). best_action should ignore
    # it and pick e2e4.
    belief = BeliefState.initial(
        perspective=chess.WHITE,
        move_prior=uniform_prior,
        target_n=8,
    )

    def evaluator(board, move, perspective):
        return 1.0  # uniform — only legality differs

    e2e4 = chess.Move.from_uci("e2e4")
    e7e5_white_attempt = chess.Move.from_uci("e7e5")
    chosen = best_action(
        belief, evaluator, [e7e5_white_attempt, e2e4], max_particles=None
    )
    assert chosen == e2e4
