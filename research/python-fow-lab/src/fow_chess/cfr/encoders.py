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

import chess
import numpy as np
import torch

from .walker import OPP_PIECE_TYPE_ORDER


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


# ---------------------------------------------------------------------------
# FoW chess — Phase 2 Day 4 implementation.
# ---------------------------------------------------------------------------


_ALL_PIECE_TYPES: tuple[chess.PieceType, ...] = (
    chess.PAWN,
    chess.KNIGHT,
    chess.BISHOP,
    chess.ROOK,
    chess.QUEEN,
    chess.KING,
)


def _build_action_table() -> tuple[list[chess.Move], dict[str, int]]:
    """Enumerate every possible chess move once at import.

    Includes all 4096 from×to pairs plus the legal pawn promotion (from,
    to, promo) triples. Indices stay stable across the project life and
    are usable by the regret net as a fixed output dimension.
    """
    moves: list[chess.Move] = []
    for from_sq in range(64):
        for to_sq in range(64):
            if from_sq == to_sq:
                continue
            moves.append(chess.Move(from_sq, to_sq))

    # Promotions: white pawn from rank 7 (0-indexed 6) → rank 8 (7);
    # black pawn from rank 2 (1) → rank 1 (0). Files shift by -1/0/+1.
    for from_rank, to_rank in ((6, 7), (1, 0)):
        for from_file in range(8):
            for df in (-1, 0, 1):
                to_file = from_file + df
                if not 0 <= to_file < 8:
                    continue
                from_sq = chess.square(from_file, from_rank)
                to_sq = chess.square(to_file, to_rank)
                for promo in (
                    chess.QUEEN,
                    chess.ROOK,
                    chess.BISHOP,
                    chess.KNIGHT,
                ):
                    moves.append(chess.Move(from_sq, to_sq, promotion=promo))

    index = {move.uci(): i for i, move in enumerate(moves)}
    return moves, index


_FOW_MOVES, _FOW_MOVE_INDEX = _build_action_table()
NUM_FOW_CHESS_ACTIONS: int = len(_FOW_MOVES)


class FowFactoredMarginalsEncoder:
    """FoW info-set encoder consuming propagated factored marginals.

    Reads each player's ``[64, 6]`` opp-piece marginal table from the
    ``SubgameNode`` (set at the subgame root and propagated by
    ``walker.propagate_factored_marginals``). Emits a fixed-shape feature
    tensor for the to-move player's info set.

    Feature layout (length 832):
    - First 384 floats: 64 squares × 6 own piece types, one-hot from
      truth board (own pieces are deterministic — the player knows them).
    - Next 384 floats: 64 squares × 6 opp piece types, read from the
      to-move player's factored marginals.
    - Last 64 floats: own-piece-any mask (1 where the player has any
      piece). Redundant with the first block but matches spec, and helps
      the network short-circuit "is my own piece here?" checks.

    The "last-seen heatmap" mentioned in the spec is left out for Phase 2
    (zeros aren't included). Add if Gate 2b shows the encoder is
    capacity-bound on temporal cues.

    Action space: ``NUM_FOW_CHESS_ACTIONS`` ≈ 4272 — all 4032 from→to
    non-promotion pairs (excluding same-square) plus pawn-promotion
    triples. Most output heads will never train (illegal in any reachable
    position); the legal-action mask in deep_cfr.py zeros them at
    inference. Acceptable Phase 2 trade — see ``cfr-phase2-day4-plan.md``.
    """

    OWN_BLOCK_DIM = 64 * 6
    OPP_BLOCK_DIM = 64 * 6
    MASK_BLOCK_DIM = 64
    FEATURE_DIM = OWN_BLOCK_DIM + OPP_BLOCK_DIM + MASK_BLOCK_DIM

    @property
    def feature_dim(self) -> int:
        return self.FEATURE_DIM

    @property
    def num_actions(self) -> int:
        return NUM_FOW_CHESS_ACTIONS

    def encode_info_set(self, node) -> torch.Tensor:
        perspective = node.to_move
        if perspective == chess.WHITE:
            opp_marginals = node.marginals_white
        else:
            opp_marginals = node.marginals_black
        if opp_marginals is None:
            raise ValueError(
                "FowFactoredMarginalsEncoder requires propagated marginals on "
                "the SubgameNode. Build the root via SubgameNode.root("
                "..., marginals_white=..., marginals_black=...)."
            )

        own_block = np.zeros((64, len(_ALL_PIECE_TYPES)), dtype=np.float32)
        own_mask = np.zeros(64, dtype=np.float32)
        for sq, piece in node.truth.piece_map().items():
            if piece.color != perspective:
                continue
            own_mask[sq] = 1.0
            own_block[sq, _ALL_PIECE_TYPES.index(piece.piece_type)] = 1.0

        # Both marginal slabs are already [64, 6] float32 from the walker.
        flat = np.concatenate(
            [own_block.reshape(-1), opp_marginals.reshape(-1), own_mask]
        )
        return torch.from_numpy(flat)

    def action_to_index(self, action: chess.Move) -> int:
        try:
            return _FOW_MOVE_INDEX[action.uci()]
        except KeyError as exc:
            raise ValueError(f"Unrecognized chess move: {action.uci()}") from exc

    def index_to_action(self, idx: int) -> chess.Move:
        return _FOW_MOVES[idx]
