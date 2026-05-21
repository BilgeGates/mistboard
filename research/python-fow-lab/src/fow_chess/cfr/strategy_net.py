"""Average-strategy networks for Deep CFR.

The Kuhn validation path accumulates the average strategy in a tabular
``{info_set_id: weighted_sum}`` dict — fine for 12 info sets. FoW's
info-set count is astronomical (each unique observation history is its
own info set), so tabular accumulation doesn't scale. We add a neural
average-strategy net that mirrors the regret net's architecture and
trains on ``(info_set_features, current_strategy)`` samples.

At evaluation time, ``solve_subgame_deep_cfr`` queries the strategy net
at the root info-set features and softmaxes the output over legal
actions to recover the average strategy.

Decision rationale: see ``lab/diag/cfr-phase2-day4-plan.md`` §"Decision 3".
"""

from __future__ import annotations

import torch
import torch.nn as nn


class FowStrategyNet(nn.Module):
    """Average-strategy network for FoW Deep CFR.

    Structurally identical to ``FowRegretNet`` — same input feature shape,
    same hidden topology, same output dimension. The semantic difference
    is purely in training:

    - Regret net: target = action regrets (counterfactual values minus
      node value), MSE loss.
    - Strategy net: target = current strategy at the visited info set
      (a probability vector over legal actions), cross-entropy or MSE on
      probabilities loss.

    Held in its own module so callers can swap one without disturbing the
    other (e.g., a larger strategy net for FoW if the regret net is fine
    smaller).
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
        """features: [batch, feature_dim] → [batch, num_actions] (pre-softmax)."""
        return self.net(features)
