"""Info-set and action encoders for Deep CFR.

For Phase 2, the encoders are duck-typed objects with ``encode_info_set``,
``encode_action``, and ``num_actions`` methods. Each game (Kuhn, FoW) has its
own encoder. The Deep CFR core (``deep_cfr.py``) is generic over them.

Phase 2 ships Kuhn encoders (validation) + a FoW factored-marginals encoder
stub. Phase 3 will swap the FoW encoder for a learned belief representation
without changing the Deep CFR loop or regret network interface.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

import torch


# ---------------------------------------------------------------------------
# Protocol — what the Deep CFR core expects from any encoder.
# ---------------------------------------------------------------------------


@runtime_checkable
class InfoSetEncoder(Protocol):
    """Encodes a SubgameNode-like object into a feature tensor."""

    @property
    def num_actions(self) -> int: ...

    def encode_info_set(self, node) -> torch.Tensor:
        """Return a 1-D feature tensor for the info set the player faces here."""
        ...

    def action_to_index(self, action) -> int:
        """Map an action (move-like object) to an integer in [0, num_actions)."""
        ...

    def index_to_action(self, idx: int):
        """Inverse of ``action_to_index``."""
        ...


# ---------------------------------------------------------------------------
# Kuhn poker — used for Gate 2a (Deep CFR correctness).
# ---------------------------------------------------------------------------


class KuhnEncoder:
    """Encodes the 12 Kuhn poker information sets + 4 actions.

    Info set ID is ``(to_move, own_card, history)`` from the Kuhn fixture
    in ``tests/test_cfr_kuhn.py``. We enumerate all 12 ahead of time so
    encoding is a dictionary lookup → integer.

    Encoded feature is a one-hot of dimension 12. Tiny network because
    Kuhn is tiny.
    """

    _ACTIONS = ("check", "bet", "fold", "call")

    def __init__(self) -> None:
        self._info_set_to_idx: dict = {}
        # Build the 12 non-terminal info sets enumeratively.
        # Non-terminal histories that lead to a decision node:
        #   ()                — P0 to move at start (depth 0)
        #   ("check",)        — P1 to move (depth 1)
        #   ("bet",)          — P1 to move (depth 1)
        #   ("check", "bet")  — P0 to move (depth 2)
        for card in (0, 1, 2):
            self._info_set_to_idx[(0, card, ())] = len(self._info_set_to_idx)
        for card in (0, 1, 2):
            self._info_set_to_idx[(1, card, ("check",))] = len(self._info_set_to_idx)
        for card in (0, 1, 2):
            self._info_set_to_idx[(1, card, ("bet",))] = len(self._info_set_to_idx)
        for card in (0, 1, 2):
            self._info_set_to_idx[(0, card, ("check", "bet"))] = len(
                self._info_set_to_idx
            )

    @property
    def num_info_sets(self) -> int:
        return len(self._info_set_to_idx)

    @property
    def num_actions(self) -> int:
        return len(self._ACTIONS)

    @property
    def feature_dim(self) -> int:
        return self.num_info_sets

    def encode_info_set(self, node) -> torch.Tensor:
        """One-hot over the 12 Kuhn info sets."""
        info_set_id = node.info_set_id()
        idx = self._info_set_to_idx[info_set_id]
        feat = torch.zeros(self.num_info_sets, dtype=torch.float32)
        feat[idx] = 1.0
        return feat

    def info_set_index(self, node) -> int:
        return self._info_set_to_idx[node.info_set_id()]

    def action_to_index(self, action: str) -> int:
        return self._ACTIONS.index(action)

    def index_to_action(self, idx: int) -> str:
        return self._ACTIONS[idx]

    def legal_action_mask(self, legal_actions: list[str]) -> torch.Tensor:
        """Boolean mask of length ``num_actions``, True where action is legal."""
        mask = torch.zeros(self.num_actions, dtype=torch.bool)
        for a in legal_actions:
            mask[self.action_to_index(a)] = True
        return mask


# ---------------------------------------------------------------------------
# FoW (Phase 2 Day 4-5 work — stub below).
# ---------------------------------------------------------------------------


class FowFactoredMarginalsEncoder:
    """Stub for the FoW info-set encoder (factored marginals).

    Phase 2 implementation will compute marginals from a ``BeliefState``
    derivable from observation history. For now this is a placeholder so
    the Deep CFR core can be developed against the Kuhn encoder and
    swapped in later without API changes.
    """

    def __init__(self) -> None:
        raise NotImplementedError(
            "FowFactoredMarginalsEncoder is a Phase 2 Day 4-5 deliverable. "
            "Use KuhnEncoder for Gate 2a validation first."
        )
