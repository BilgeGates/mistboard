"""Strategy purification with stable-actions filter (Obscuro Appendix C.8).

CFR returns a probability distribution over actions at the root infoset.
For move SELECTION in a real game, we don't play that mixed strategy
verbatim — we purify it down to 1-3 actions and play deterministically
or near-deterministically.

Purification rules per Obscuro:

* **Resolve regime** (some subgame margins negative): play the top
  action deterministically. ``max_actions=1``.
* **Maxmargin regime** (all margins nonneg, strategy provably safe):
  allow mixing between top-m actions, ``m ≤ 3``.

**Stable-actions filter:** non-top actions are only included if they
were in the strategy's support continuously for every iteration
``t > T_{1/2}`` (where ``T_{1/2}`` is the iteration count at which
half the time budget had elapsed). This filters out transient
fluctuations during search.

Until A6.2 ships Resolve + Maxmargin gadgets, callers default to
``max_actions=1`` (Resolve regime).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Hashable


@dataclass
class PurifiedStrategy:
    """Output of purify_strategy."""

    strategy: dict
    """{action: probability}, summing to 1.0. May have 1-3 entries."""

    n_actions: int
    """How many actions made it into the purified support."""

    excluded_unstable: list
    """Actions with high last-iterate probability that were dropped by
    the stable-actions filter. Useful for diagnostics."""


def purify_strategy(
    last_strategy: dict,
    strategy_history: list[dict],
    t_half: int,
    *,
    max_actions: int = 1,
) -> PurifiedStrategy:
    """Purify a CFR last-iterate strategy.

    Args:
        last_strategy: ``{action: probability}`` from the final iteration.
        strategy_history: per-iteration strategy snapshots at the root
            infoset. ``strategy_history[t]`` is the strategy at iteration
            ``t``. Length matches the number of iterations completed.
        t_half: iteration count at which half the time budget had
            elapsed. Stable-actions filter checks support continuously
            for ``t > t_half``.
        max_actions: maximum support size of the purified strategy.
            1 for Resolve regime (deterministic top action), up to 3
            for Maxmargin regime.

    Returns:
        PurifiedStrategy with at most ``max_actions`` entries,
        renormalized to sum to 1.0.
    """
    if not last_strategy:
        return PurifiedStrategy(strategy={}, n_actions=0, excluded_unstable=[])
    if max_actions < 1:
        raise ValueError(f"max_actions must be >= 1, got {max_actions}")

    # Rank actions by their last-iterate probability.
    ranked = sorted(last_strategy.items(), key=lambda kv: -kv[1])

    # Top action is always included (even if its probability is tiny —
    # CFR converged to it as the best response).
    selected: list = [ranked[0][0]]
    excluded: list = []

    if max_actions > 1:
        # Stable-actions filter for candidates 2..max_actions.
        for action, prob in ranked[1:max_actions]:
            if _action_was_continuously_in_support(
                action, strategy_history, t_half
            ):
                selected.append(action)
            else:
                excluded.append(action)

    # Renormalize the selected actions' last-iterate probabilities.
    raw = {a: last_strategy[a] for a in selected}
    total = sum(raw.values())
    if total > 0:
        purified = {a: p / total for a, p in raw.items()}
    else:
        # All selected actions had zero probability in the last iterate
        # — fall back to uniform over selected.
        n = len(selected)
        purified = {a: 1.0 / n for a in selected}

    return PurifiedStrategy(
        strategy=purified,
        n_actions=len(selected),
        excluded_unstable=excluded,
    )


def _action_was_continuously_in_support(
    action: Hashable,
    strategy_history: list[dict],
    t_half: int,
) -> bool:
    """True iff strategy_history[t][action] > 0 for every t > t_half.

    Empty history or t_half ≥ len(history) means there are no post-
    half-time iterations to validate against — be conservative and
    return False (exclude the action).
    """
    if t_half >= len(strategy_history):
        return False
    for t in range(t_half + 1, len(strategy_history)):
        prob = strategy_history[t].get(action, 0.0)
        if prob <= 0.0:
            return False
    return True
