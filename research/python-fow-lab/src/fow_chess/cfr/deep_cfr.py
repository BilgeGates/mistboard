"""Deep CFR — neural function approximation of regret tables.

Implements Brown et al. 2019 *Deep CFR* with external sampling. The training
loop is structurally the same as ``tabular.solve_subgame`` but replaces the
per-info-set regret dict with a neural network. The network is queried at
every visit to compute the current strategy via regret matching, and the
collected (info_set_features, action_regrets) samples are used to train the
network across iterations.

Phase 2 ships a minimal-viable implementation that validates on Kuhn poker.
For Kuhn we also accumulate the average strategy in a tabular structure
(only 12 info sets — cheap). For FoW (Phase 2 Day 4-5+) we'll need a
separate strategy network.

Public API mirrors ``tabular.solve_subgame`` where possible.
"""

from __future__ import annotations

import random
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Callable, Hashable

import torch
import torch.nn as nn
import torch.optim as optim


@dataclass
class DeepCFRSolution:
    """Output of a Deep CFR solve."""

    strategy_at_root: dict
    """Average (Nash-convergent) strategy at the root info set."""

    value_at_root: float
    """Monte-Carlo estimate of root value under the average strategy,
    from the root-mover's POV (or players[0] if root is chance)."""

    iterations: int
    info_set_count: int
    regret_net_state_dicts: dict
    """Trained regret network states keyed by player; serialize for reuse."""


def _strategy_from_regrets(
    regrets: torch.Tensor, legal_mask: torch.Tensor
) -> torch.Tensor:
    """Regret matching: probabilities proportional to positive regret.

    Falls back to uniform over legal actions when no positive regret.
    Illegal actions get probability 0.
    """
    positive = torch.clamp(regrets, min=0.0) * legal_mask.float()
    total = positive.sum()
    if total > 1e-9:
        return positive / total
    # Uniform over legal actions.
    n_legal = legal_mask.sum().clamp(min=1).float()
    return legal_mask.float() / n_legal


def _sample_action_idx(probs: torch.Tensor, rng: random.Random) -> int:
    """Sample an action index from a probability vector."""
    r = rng.random()
    cum = 0.0
    n = probs.numel()
    for i in range(n):
        cum += probs[i].item()
        if r < cum:
            return i
    return n - 1


def _legal_actions_with_indices(node, encoder):
    """Return (legal_actions, legal_indices, legal_mask_tensor)."""
    legal = node.legal_moves()
    indices = [encoder.action_to_index(a) for a in legal]
    mask = torch.zeros(encoder.num_actions, dtype=torch.bool)
    for idx in indices:
        mask[idx] = True
    return legal, indices, mask


def _cfr_traverse(
    node,
    traversing_player,
    encoder,
    regret_nets: dict,
    samples: dict,
    strategy_sum: dict,
    rng: random.Random,
    device: str,
) -> float:
    """Recursive Deep CFR traversal returning value from traversing_player's POV.

    Side effects:
    - At traversing_player nodes: collect (info_set_features, regrets) into
      ``samples[traversing_player]`` and update ``strategy_sum`` for the
      avg-strategy accumulator (Kuhn-style tabular avg).
    - At non-traversing player nodes: sample one action from their current
      strategy via their regret network.
    """
    if getattr(node, "is_chance", False):
        # Iterate over chance outcomes.
        value = 0.0
        for action, prob in node.chance_outcomes():
            value += prob * _cfr_traverse(
                node.apply(action),
                traversing_player,
                encoder,
                regret_nets,
                samples,
                strategy_sum,
                rng,
                device,
            )
        return value

    if node.is_terminal:
        return node.terminal_value(traversing_player)

    legal, indices, mask = _legal_actions_with_indices(node, encoder)
    if not legal:
        return 0.0

    feat = encoder.encode_info_set(node).to(device)
    net = regret_nets[node.to_move]
    net.eval()
    with torch.no_grad():
        regrets_pred = net(feat.unsqueeze(0)).squeeze(0)
    strategy = _strategy_from_regrets(regrets_pred, mask)

    if node.to_move == traversing_player:
        # Enumerate all actions; compute counterfactual values.
        action_values = torch.zeros(encoder.num_actions, dtype=torch.float32)
        for i, action in zip(indices, legal):
            child = node.apply(action)
            action_values[i] = _cfr_traverse(
                child,
                traversing_player,
                encoder,
                regret_nets,
                samples,
                strategy_sum,
                rng,
                device,
            )
        node_value = (strategy * action_values).sum().item()
        # Compute regret per legal action and store training sample.
        action_regrets = action_values - node_value
        # Mask illegal actions to 0 regret (we don't train on them).
        action_regrets = action_regrets * mask.float()
        samples[traversing_player].append((feat.cpu(), action_regrets.detach().cpu()))

        # Accumulate avg strategy at this info set (tabular for Kuhn).
        info_set_key = node.info_set_id()
        sa = strategy_sum.setdefault(info_set_key, torch.zeros(encoder.num_actions))
        sa += strategy.detach().cpu()
        return node_value

    # Non-traversing player — sample one action via their current strategy.
    chosen_idx = _sample_action_idx(strategy, rng)
    chosen_action = encoder.index_to_action(chosen_idx)
    return _cfr_traverse(
        node.apply(chosen_action),
        traversing_player,
        encoder,
        regret_nets,
        samples,
        strategy_sum,
        rng,
        device,
    )


def _train_regret_net(
    net: nn.Module,
    samples: list[tuple[torch.Tensor, torch.Tensor]],
    epochs: int,
    batch_size: int,
    lr: float,
    device: str,
) -> float:
    """Train ``net`` on accumulated (features, target_regrets) pairs.

    Returns the final epoch's average loss for monitoring.
    """
    if not samples:
        return 0.0
    feats = torch.stack([f for f, _ in samples]).to(device)
    regrets = torch.stack([r for _, r in samples]).to(device)
    n = feats.shape[0]
    net.train()
    optimizer = optim.Adam(net.parameters(), lr=lr)
    loss_fn = nn.MSELoss()
    last_loss = 0.0
    for _ in range(epochs):
        perm = torch.randperm(n)
        total = 0.0
        batches = 0
        for start in range(0, n, batch_size):
            idx = perm[start : start + batch_size]
            pred = net(feats[idx])
            loss = loss_fn(pred, regrets[idx])
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total += loss.item()
            batches += 1
        last_loss = total / max(1, batches)
    net.eval()
    return last_loss


def _rollout_with_avg_strategy(
    node,
    strategy_sum: dict,
    encoder,
    perspective,
    rng: random.Random,
) -> float:
    """One rollout sampling from the accumulated average strategy."""
    if getattr(node, "is_chance", False):
        outcomes = node.chance_outcomes()
        probs = [p for _, p in outcomes]
        idx = _sample_action_idx(torch.tensor(probs), rng)
        return _rollout_with_avg_strategy(
            node.apply(outcomes[idx][0]), strategy_sum, encoder, perspective, rng
        )
    if node.is_terminal:
        return node.terminal_value(perspective)
    legal, indices, mask = _legal_actions_with_indices(node, encoder)
    if not legal:
        return 0.0
    info_set_key = node.info_set_id()
    strat_sum = strategy_sum.get(info_set_key)
    if strat_sum is None:
        # Uniform fallback for info sets we never visited.
        probs = mask.float()
        probs = probs / probs.sum()
    else:
        masked = strat_sum * mask.float()
        total = masked.sum().item()
        if total > 1e-9:
            probs = masked / total
        else:
            probs = mask.float() / mask.sum().float()
    chosen_idx = _sample_action_idx(probs, rng)
    chosen_action = encoder.index_to_action(chosen_idx)
    return _rollout_with_avg_strategy(
        node.apply(chosen_action), strategy_sum, encoder, perspective, rng
    )


def solve_subgame_deep_cfr(
    root,
    encoder,
    regret_net_factory: Callable[[], nn.Module],
    *,
    iterations: int = 50,
    trajectories_per_iter: int = 100,
    regret_train_epochs: int = 10,
    regret_batch_size: int = 256,
    regret_lr: float = 1e-3,
    value_estimate_samples: int = 1000,
    players: tuple = None,
    rng: random.Random = None,
    device: str = "cpu",
) -> DeepCFRSolution:
    """Solve a subgame with Deep CFR.

    Parameters mirror ``tabular.solve_subgame`` where applicable.
    """
    rng = rng or random.Random(0)
    root_is_chance = getattr(root, "is_chance", False)
    if players is None:
        if root_is_chance:
            raise ValueError(
                "players must be supplied explicitly when root is a chance node"
            )
        players = (root.to_move, not root.to_move)

    regret_nets = {p: regret_net_factory().to(device) for p in players}
    samples: dict = {p: [] for p in players}
    strategy_sum: dict = {}

    for it in range(iterations):
        for traversing_player in players:
            for _ in range(trajectories_per_iter):
                _cfr_traverse(
                    root,
                    traversing_player,
                    encoder,
                    regret_nets,
                    samples,
                    strategy_sum,
                    rng,
                    device,
                )
            # Train this player's regret net on accumulated samples.
            _train_regret_net(
                regret_nets[traversing_player],
                samples[traversing_player],
                epochs=regret_train_epochs,
                batch_size=regret_batch_size,
                lr=regret_lr,
                device=device,
            )

    # Strategy at root from accumulated avg strategy.
    if root_is_chance:
        strategy_at_root: dict = {}
        root_perspective = players[0]
    else:
        root_info_set_key = root.info_set_id()
        legal = root.legal_moves()
        sum_vec = strategy_sum.get(
            root_info_set_key, torch.zeros(encoder.num_actions)
        )
        total = sum(sum_vec[encoder.action_to_index(a)].item() for a in legal)
        if total > 1e-9:
            strategy_at_root = {
                a: sum_vec[encoder.action_to_index(a)].item() / total for a in legal
            }
        else:
            strategy_at_root = {a: 1.0 / len(legal) for a in legal}
        root_perspective = root.to_move

    # Value estimate via MC rollouts under the avg strategy.
    value_sum = 0.0
    for _ in range(value_estimate_samples):
        value_sum += _rollout_with_avg_strategy(
            root, strategy_sum, encoder, root_perspective, rng
        )
    value_at_root = value_sum / max(1, value_estimate_samples)

    return DeepCFRSolution(
        strategy_at_root=strategy_at_root,
        value_at_root=value_at_root,
        iterations=iterations,
        info_set_count=len(strategy_sum),
        regret_net_state_dicts={p: regret_nets[p].state_dict() for p in players},
    )
