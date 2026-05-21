"""PyTorch regret networks for Deep CFR.

The Deep CFR core (``deep_cfr.py``) is generic over the regret network: it
takes a network factory and trains the produced module on accumulated
(info_set_features, action_regrets) samples. This module ships:

- ``KuhnRegretNet`` — tiny network for Kuhn poker (Gate 2a).
- ``FowRegretNet`` — stub for FoW (Phase 2 Day 4-5+).

Both networks consume an info-set feature tensor and output one regret
value per action (masked to legal actions externally).
"""

from __future__ import annotations

import torch
import torch.nn as nn


class KuhnRegretNet(nn.Module):
    """Tiny regret network for Kuhn poker (Gate 2a).

    Architecture:
        info_set one-hot (12) → Linear(12 → 32) → ReLU → Linear(32 → 4) → regrets

    ~600 parameters. Trains in seconds on Mac CPU.
    """

    def __init__(
        self,
        feature_dim: int = 12,
        hidden_dim: int = 32,
        num_actions: int = 4,
    ) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(feature_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, num_actions),
        )

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        """features: [batch, feature_dim] → [batch, num_actions]"""
        return self.net(features)


class FowRegretNet(nn.Module):
    """Stub for the FoW regret network (Phase 2 Day 4-5+).

    Will consume ~900-dim factored-marginals features + ~133-dim per-action
    features → regret per action. Architecture TBD; aim for 5-10M params.
    """

    def __init__(self, *args, **kwargs) -> None:
        raise NotImplementedError(
            "FowRegretNet is a Phase 2 Day 4-5 deliverable. Use KuhnRegretNet "
            "for Gate 2a validation first."
        )
