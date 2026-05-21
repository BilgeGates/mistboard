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
    """FoW regret network — Phase 2 Day 4 implementation.

    Architecture:
        info-set features (832) → Linear(832 → 512) → ReLU
                              → Linear(512 → 512) → ReLU
                              → Linear(512 → 256) → ReLU
                              → Linear(256 → num_actions) → regrets

    ~1.7M params at the default sizes — leaner than the spec's 5-10M
    target band. Phase 2 is a correctness gate, not a strength gate; if
    Gate 2b loss plateaus on capacity grounds, widen the hidden layers
    (256→512→1024) before reaching for the per-action MLP head from
    cfr-phase2-spec.md (that's Phase 3 territory).

    Output is a fixed-size regret vector across the global FoW chess
    action space (``encoders.NUM_FOW_CHESS_ACTIONS``). Illegal actions
    are masked at inference by deep_cfr.py; their heads receive no
    training signal and stay near initialization.
    """

    def __init__(
        self,
        feature_dim: int = 832,
        num_actions: int = 4272,
        hidden_dims: tuple[int, ...] = (512, 512, 256),
    ) -> None:
        super().__init__()
        layers: list[nn.Module] = []
        prev = feature_dim
        for h in hidden_dims:
            layers.append(nn.Linear(prev, h))
            layers.append(nn.ReLU())
            prev = h
        layers.append(nn.Linear(prev, num_actions))
        self.net = nn.Sequential(*layers)

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        """features: [batch, feature_dim] → [batch, num_actions]"""
        return self.net(features)
