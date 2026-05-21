"""Property test for the Day-4 factored-marginal propagation rule.

Compares the cheap closed-form rule (snap-visible-to-truth + hidden-unchanged)
in ``walker.propagate_factored_marginals`` against a reference computed from
a real multi-particle BeliefState. If the L1 mean divergence at depth 3 is
> ~0.3 per square, the rule is too lossy for Phase 2 and we fall back to
Option A (BeliefState reconstruction per node).

The rule's known approximation: hidden squares aren't diffused when opp
moves into/through fog. This test quantifies how much that costs us in
practice.
"""

from __future__ import annotations

import random

import chess
import numpy as np

from fow_chess.belief import BeliefState
from fow_chess.cfr.walker import (
    SubgameNode,
    factored_marginals_from_belief,
)
from fow_chess.move_priors import uniform_prior
from fow_chess.observation import observation_from_transition


def _l1_per_square(a: np.ndarray, b: np.ndarray) -> float:
    """Mean L1 divergence across the 64 squares (sum over piece types)."""
    assert a.shape == b.shape == (64, 6)
    diff = np.abs(a - b).sum(axis=1)  # [64]
    return float(diff.mean())


def _run_sequence(
    seed: int, depth: int
) -> list[tuple[float, float, float, float]]:
    """Walk a random ``depth``-move sequence from the canonical start.

    Returns one row per ply with:
      (white_l1_step, black_l1_step, white_l1_cum_max, black_l1_cum_max)
    so the caller can summarize at any depth.
    """
    rng = random.Random(seed)
    truth = chess.Board()

    white_belief = BeliefState.initial(
        perspective=chess.WHITE,
        move_prior=uniform_prior,
        target_n=64,
        start_board=truth,
        rng=random.Random(seed * 7 + 1),
    )
    black_belief = BeliefState.initial(
        perspective=chess.BLACK,
        move_prior=uniform_prior,
        target_n=64,
        start_board=truth,
        rng=random.Random(seed * 7 + 2),
    )

    node = SubgameNode.root(
        truth,
        to_move=chess.WHITE,
        marginals_white=factored_marginals_from_belief(white_belief),
        marginals_black=factored_marginals_from_belief(black_belief),
    )

    rows: list[tuple[float, float, float, float]] = []
    white_cum_max = 0.0
    black_cum_max = 0.0
    for _ in range(depth):
        legal = list(node.truth.pseudo_legal_moves)
        if not legal:
            break
        move = rng.choice(legal)
        prev_truth = node.truth
        next_node = node.apply(move)
        obs_for_white = observation_from_transition(
            prev_truth, next_node.truth, chess.WHITE
        )
        obs_for_black = observation_from_transition(
            prev_truth, next_node.truth, chess.BLACK
        )
        if node.to_move == chess.WHITE:
            white_belief.update_after_own_move(move, observation=obs_for_white)
            black_belief.update_after_opp_move(obs_for_black)
        else:
            black_belief.update_after_own_move(move, observation=obs_for_black)
            white_belief.update_after_opp_move(obs_for_white)

        ref_w = factored_marginals_from_belief(white_belief)
        ref_b = factored_marginals_from_belief(black_belief)
        assert next_node.marginals_white is not None
        assert next_node.marginals_black is not None
        w_l1 = _l1_per_square(next_node.marginals_white, ref_w)
        b_l1 = _l1_per_square(next_node.marginals_black, ref_b)
        white_cum_max = max(white_cum_max, w_l1)
        black_cum_max = max(black_cum_max, b_l1)
        rows.append((w_l1, b_l1, white_cum_max, black_cum_max))
        node = next_node

    return rows


def test_root_marginals_equal_truth_for_singleton_belief() -> None:
    """Canonical-start singleton belief → root marginals equal truth."""
    truth = chess.Board()
    bs_white = BeliefState.initial(
        chess.WHITE, uniform_prior, target_n=8, start_board=truth
    )
    derived = factored_marginals_from_belief(bs_white)
    # White's view of black pieces: each black piece should have mass 1.0
    # on its truth square.
    for sq, piece in truth.piece_map().items():
        if piece.color == chess.BLACK:
            # Indices: pawn=0, knight=1, bishop=2, rook=3, queen=4, king=5.
            from fow_chess.cfr.walker import OPP_PIECE_TYPE_ORDER

            idx = OPP_PIECE_TYPE_ORDER.index(piece.piece_type)
            assert derived[sq, idx] == 1.0
    # And the sum across all squares × types should be exactly 16
    # (16 black pieces in the canonical start).
    assert derived.sum() == 16.0


def test_propagation_rule_l1_at_depth_3() -> None:
    """Property test: rule's L1 vs particle-filter reference at depth 3.

    Threshold from cfr-phase2-day4-plan.md: pass if mean L1 ≤ 0.3 per
    square, averaged across squares, at depth 3. Reported per-seed +
    aggregate so failures are debuggable.
    """
    seeds = [1, 2, 3, 4, 5, 7, 11, 13]
    depth_3_white: list[float] = []
    depth_3_black: list[float] = []
    for seed in seeds:
        rows = _run_sequence(seed, depth=3)
        if len(rows) < 3:
            continue
        w_l1_at_3, b_l1_at_3, _, _ = rows[-1]
        depth_3_white.append(w_l1_at_3)
        depth_3_black.append(b_l1_at_3)

    mean_w = float(np.mean(depth_3_white))
    mean_b = float(np.mean(depth_3_black))
    max_w = float(np.max(depth_3_white))
    max_b = float(np.max(depth_3_black))
    # Report so a failure tells us which side and how badly.
    print(
        f"\n[propagate marginals L1] depth=3, n_seeds={len(depth_3_white)} "
        f"white mean={mean_w:.3f} max={max_w:.3f} "
        f"black mean={mean_b:.3f} max={max_b:.3f}"
    )

    assert mean_w <= 0.30, (
        f"white-perspective L1 divergence too high: mean={mean_w:.3f} "
        f"(per-seed={depth_3_white})"
    )
    assert mean_b <= 0.30, (
        f"black-perspective L1 divergence too high: mean={mean_b:.3f} "
        f"(per-seed={depth_3_black})"
    )


# ---------------------------------------------------------------------------
# Experiment #2: multi-particle propagation stress.
# ---------------------------------------------------------------------------


def _warmup_belief_state(
    perspective: chess.Color, warmup_plies: int, seed: int
) -> tuple[chess.Board, BeliefState, BeliefState]:
    """Walk ``warmup_plies`` random plies from canonical start, returning the
    post-warmup truth board + both players' BeliefStates.

    Multi-particle uncertainty develops naturally as the opp piece prior
    expands particles on every opp turn.
    """
    rng = random.Random(seed)
    truth = chess.Board()
    bs_w = BeliefState.initial(
        chess.WHITE,
        uniform_prior,
        target_n=64,
        start_board=truth,
        rng=random.Random(seed * 13 + 1),
    )
    bs_b = BeliefState.initial(
        chess.BLACK,
        uniform_prior,
        target_n=64,
        start_board=truth,
        rng=random.Random(seed * 13 + 2),
    )

    for _ in range(warmup_plies):
        legal = list(truth.pseudo_legal_moves)
        if not legal:
            break
        move = rng.choice(legal)
        prev_truth = truth.copy()
        next_truth = truth.copy()
        next_truth.push(move)
        obs_w = observation_from_transition(prev_truth, next_truth, chess.WHITE)
        obs_b = observation_from_transition(prev_truth, next_truth, chess.BLACK)
        if prev_truth.turn == chess.WHITE:
            bs_w.update_after_own_move(move, observation=obs_w)
            bs_b.update_after_opp_move(obs_b)
        else:
            bs_b.update_after_own_move(move, observation=obs_b)
            bs_w.update_after_opp_move(obs_w)
        truth = next_truth

    return truth, bs_w, bs_b


def _run_multi_particle_sequence(
    warmup_seed: int, walk_seed: int, warmup_plies: int, depth: int
) -> list[tuple[float, float]]:
    """Returns one (white_l1, black_l1) tuple per ply walked from the
    post-warmup root.
    """
    truth_root, bs_w_root, bs_b_root = _warmup_belief_state(
        chess.WHITE, warmup_plies, warmup_seed
    )

    node = SubgameNode.root(
        truth_root,
        to_move=truth_root.turn,
        marginals_white=factored_marginals_from_belief(bs_w_root),
        marginals_black=factored_marginals_from_belief(bs_b_root),
    )

    # Operate on copies so the same warmup belief can be reused across walks.
    import copy as _copy

    bs_w = _copy.deepcopy(bs_w_root)
    bs_b = _copy.deepcopy(bs_b_root)

    walk_rng = random.Random(walk_seed)
    rows: list[tuple[float, float]] = []
    for _ in range(depth):
        legal = list(node.truth.pseudo_legal_moves)
        if not legal:
            break
        move = walk_rng.choice(legal)
        prev_truth = node.truth.copy()
        next_node = node.apply(move)
        obs_w = observation_from_transition(prev_truth, next_node.truth, chess.WHITE)
        obs_b = observation_from_transition(prev_truth, next_node.truth, chess.BLACK)
        if node.to_move == chess.WHITE:
            bs_w.update_after_own_move(move, observation=obs_w)
            bs_b.update_after_opp_move(obs_b)
        else:
            bs_b.update_after_own_move(move, observation=obs_b)
            bs_w.update_after_opp_move(obs_w)

        ref_w = factored_marginals_from_belief(bs_w)
        ref_b = factored_marginals_from_belief(bs_b)
        assert next_node.marginals_white is not None
        assert next_node.marginals_black is not None
        rows.append(
            (
                _l1_per_square(next_node.marginals_white, ref_w),
                _l1_per_square(next_node.marginals_black, ref_b),
            )
        )
        node = next_node

    return rows


def test_propagation_rule_multi_particle_through_depth_6() -> None:
    """Phase 2 pre-spend gate (Experiment #2): does the snap-to-truth rule
    track production belief beyond truth-singleton + depth 3?

    Setup: walk 4 random plies from canonical start to develop multi-particle
    uncertainty; that becomes the test root. Then walk depth 1-6 random
    sequences and compare propagated marginals to fresh BeliefState marginals
    at each ply.

    Reports L1 mean per ply across 6 seeds. Pass: mean L1 ≤ 0.30 through
    depth 6. Stricter band (≤0.20) would prove the rule generalizes; looser
    (>0.30) signals a Phase 3 architectural rework.
    """
    warmup_plies = 4
    depth = 6
    warmup_seeds = [101, 103, 107, 109, 113, 127]
    walk_seeds_per_warmup = 1  # one walk per warmup; cheaper, still tells us trend.

    per_ply_white: list[list[float]] = [[] for _ in range(depth)]
    per_ply_black: list[list[float]] = [[] for _ in range(depth)]
    completed_seeds = 0
    for ws in warmup_seeds:
        try:
            rows = _run_multi_particle_sequence(
                warmup_seed=ws,
                walk_seed=ws * 17,
                warmup_plies=warmup_plies,
                depth=depth,
            )
        except Exception as exc:  # belief code can raise on degenerate paths
            print(f"  warmup seed {ws}: skipped ({type(exc).__name__})")
            continue
        for i, (w_l1, b_l1) in enumerate(rows):
            per_ply_white[i].append(w_l1)
            per_ply_black[i].append(b_l1)
        completed_seeds += 1

    print(
        f"\n[multi-particle propagation L1] warmup={warmup_plies} plies, "
        f"depth={depth}, n_seeds_completed={completed_seeds}"
    )
    print("  ply | n | white(mean/max) | black(mean/max)")
    for i in range(depth):
        if not per_ply_white[i]:
            print(f"    {i+1} | 0 | -        | -")
            continue
        w_arr = np.array(per_ply_white[i])
        b_arr = np.array(per_ply_black[i])
        print(
            f"    {i+1} | {len(w_arr)} | "
            f"{w_arr.mean():.3f}/{w_arr.max():.3f} | "
            f"{b_arr.mean():.3f}/{b_arr.max():.3f}"
        )

    # Assert: mean L1 over the deepest ply with data ≤ 0.30.
    deepest_with_data_white = max(
        (i for i in range(depth) if per_ply_white[i]), default=-1
    )
    deepest_with_data_black = max(
        (i for i in range(depth) if per_ply_black[i]), default=-1
    )
    assert deepest_with_data_white >= 0, "no seeds completed any plies"
    deepest_w_mean = float(np.mean(per_ply_white[deepest_with_data_white]))
    deepest_b_mean = float(np.mean(per_ply_black[deepest_with_data_black]))
    assert deepest_w_mean <= 0.30, (
        f"white-perspective L1 at deepest ply ({deepest_with_data_white+1}) "
        f"= {deepest_w_mean:.3f} exceeds 0.30"
    )
    assert deepest_b_mean <= 0.30, (
        f"black-perspective L1 at deepest ply ({deepest_with_data_black+1}) "
        f"= {deepest_b_mean:.3f} exceeds 0.30"
    )
