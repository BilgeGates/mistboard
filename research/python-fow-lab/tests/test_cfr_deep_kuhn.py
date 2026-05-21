"""Gate 2a: Deep CFR correctness on Kuhn poker.

Mirror of ``test_cfr_kuhn.py`` (tabular) with the regret table replaced by
a neural regret network. Same convergence target: value at root converges
to Kuhn's Nash equilibrium value of -1/18 from player 0's POV.

Tolerance is looser than tabular (0.10 vs 0.05) to account for the
inherent noise of neural function approximation at this small scale.

Runs on Mac CPU in minutes. No compute spend.
"""

from __future__ import annotations

import random

from fow_chess.cfr.deep_cfr import solve_subgame_deep_cfr
from fow_chess.cfr.encoders import KuhnEncoder
from fow_chess.cfr.regret_net import KuhnRegretNet

from tests.test_cfr_kuhn import KuhnRoot  # reuse the fixture


def test_deep_cfr_kuhn_converges_to_neg_1_over_18():
    """Deep CFR's value at root should approach -1/18 within tolerance."""
    encoder = KuhnEncoder()

    def make_net():
        return KuhnRegretNet(
            feature_dim=encoder.feature_dim,
            hidden_dim=32,
            num_actions=encoder.num_actions,
        )

    root = KuhnRoot()
    solution = solve_subgame_deep_cfr(
        root,
        encoder=encoder,
        regret_net_factory=make_net,
        iterations=100,
        trajectories_per_iter=50,
        regret_train_epochs=5,
        regret_batch_size=64,
        regret_lr=1e-3,
        value_estimate_samples=2000,
        players=(0, 1),
        rng=random.Random(42),
        device="cpu",
    )
    target = -1.0 / 18.0
    assert abs(solution.value_at_root - target) < 0.10, (
        f"value_at_root={solution.value_at_root:.4f} target={target:.4f} "
        f"info_sets={solution.info_set_count}"
    )


def test_deep_cfr_kuhn_visits_all_12_info_sets():
    """Deep CFR should visit all 12 Kuhn info sets across training."""
    encoder = KuhnEncoder()

    def make_net():
        return KuhnRegretNet(
            feature_dim=encoder.feature_dim,
            hidden_dim=32,
            num_actions=encoder.num_actions,
        )

    root = KuhnRoot()
    solution = solve_subgame_deep_cfr(
        root,
        encoder=encoder,
        regret_net_factory=make_net,
        iterations=20,
        trajectories_per_iter=50,
        regret_train_epochs=2,
        regret_batch_size=64,
        regret_lr=1e-3,
        value_estimate_samples=10,
        players=(0, 1),
        rng=random.Random(0),
    )
    # All 12 non-terminal info sets should be visited at least once.
    assert solution.info_set_count == 12, (
        f"expected 12 info sets visited; got {solution.info_set_count}"
    )
