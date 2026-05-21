"""Depth-bounded subgame walker for tabular CFR over Fog of War chess.

The walker does not carry a full `BeliefState` through nodes. Belief is implicit
in each player's observation history; tabular CFR identifies information sets
by `(to_move, observation_history)`. This is sufficient for Phase 1 validation
with a position-only leaf evaluator. Phase 2 (value-net leaf consuming factored
marginals) will reconstruct belief at leaves from the observation history.

Phase 2 Day 4: nodes can optionally carry per-player factored marginals over
opp pieces (`marginals_white`, `marginals_black`). The marginals propagate
through `apply()` via a closed-form rule — see ``cfr-phase2-day4-plan.md``.
Tabular CFR and Kuhn paths leave marginals as ``None`` and are unaffected.

Mechanics-correctness contract: see ``lab/diag/cfr-walker-test-plan.md``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Hashable

import chess
import numpy as np

from ..observation import Observation, observation_from_transition

# Column order for factored marginal tensors. `marginals[sq, i]` = probability
# that opp piece type ``OPP_PIECE_TYPE_ORDER[i]`` sits on ``sq`` from this
# player's POV. Keep in sync with `FowFactoredMarginalsEncoder` and any
# downstream consumers.
OPP_PIECE_TYPE_ORDER: tuple[chess.PieceType, ...] = (
    chess.PAWN,
    chess.KNIGHT,
    chess.BISHOP,
    chess.ROOK,
    chess.QUEEN,
    chess.KING,
)
_PIECE_TYPE_TO_INDEX: dict[chess.PieceType, int] = {
    pt: i for i, pt in enumerate(OPP_PIECE_TYPE_ORDER)
}


def factored_marginals_from_truth(
    board: chess.Board, perspective: chess.Color
) -> np.ndarray:
    """[64, 6] marginals deterministically derived from the truth board.

    Used for the Phase 2 simplification where the subgame-root belief is a
    singleton particle at the known truth. Phase 3 will swap this for
    ``factored_marginals_from_belief`` against a multi-particle BeliefState.
    """
    out = np.zeros((64, len(OPP_PIECE_TYPE_ORDER)), dtype=np.float32)
    opp = not perspective
    for sq, piece in board.piece_map().items():
        if piece.color != opp:
            continue
        out[sq, _PIECE_TYPE_TO_INDEX[piece.piece_type]] = 1.0
    return out


def factored_marginals_from_belief(belief_state) -> np.ndarray:
    """[64, 6] marginals derived from a multi-particle BeliefState.

    Reads each square's marginal distribution via
    ``BeliefState.marginal_piece_at`` and projects onto opp piece types.
    """
    out = np.zeros((64, len(OPP_PIECE_TYPE_ORDER)), dtype=np.float32)
    opp = not belief_state.perspective
    for sq in range(64):
        m = belief_state.marginal_piece_at(sq)
        for piece, prob in m.items():
            if piece is None or piece.color != opp:
                continue
            idx = _PIECE_TYPE_TO_INDEX.get(piece.piece_type)
            if idx is None:
                continue
            out[sq, idx] = float(prob)
    return out


def propagate_factored_marginals(
    prev_marginals: np.ndarray,
    perspective: chess.Color,
    next_truth: chess.Board,
    new_obs: Observation,
) -> np.ndarray:
    """Apply the Day-4 closed-form marginal-update rule.

    Snap-to-truth on visible squares; leave hidden squares unchanged.
    See ``cfr-phase2-day4-plan.md`` Decision 1 for the full rationale and
    the approximation error this introduces.
    """
    out = prev_marginals.copy()
    opp = not perspective
    for sq in new_obs.visibility_mask:
        out[sq, :] = 0.0
        piece = next_truth.piece_at(sq)
        if piece is not None and piece.color == opp:
            out[sq, _PIECE_TYPE_TO_INDEX[piece.piece_type]] = 1.0
    return out


def _obs_key(obs: Observation) -> tuple:
    """Hashable canonical key for an Observation.

    Two Observations that compare equal as `Observation` instances must
    produce equal keys. We sort visible-piece entries and the visibility
    mask so dict-ordering is irrelevant.
    """
    visible_pieces = tuple(
        sorted(
            (sq, p.color, p.piece_type) for sq, p in obs.visible_pieces.items()
        )
    )
    visibility = tuple(sorted(obs.visibility_mask))
    return (
        visibility,
        visible_pieces,
        obs.own_capture_square,
        obs.opp_capture_landing_square,
        obs.game_over.winner if obs.game_over else None,
        obs.game_over.reason if obs.game_over else None,
    )


@dataclass(frozen=True)
class SubgameNode:
    """One node in a CFR subgame tree.

    Holds the truth board (used to enumerate legal actions and detect
    terminals) and each player's observation history from the subgame root.
    The to-move player's history identifies its information set for CFR
    regret-table lookup.

    Frozen by design: ``apply`` returns a new node rather than mutating, so
    sibling branches stay independent.

    ``marginals_{white,black}`` are optional ``[64, 6]`` factored marginals
    over opp piece types from each player's POV. Required for the FoW Deep
    CFR encoder; left as ``None`` for Kuhn and tabular CFR.
    """

    truth: chess.Board
    to_move: chess.Color
    obs_history_white: tuple
    obs_history_black: tuple
    depth: int
    marginals_white: np.ndarray | None = None
    marginals_black: np.ndarray | None = None

    @classmethod
    def root(
        cls,
        truth: chess.Board,
        to_move: chess.Color | None = None,
        *,
        marginals_white: np.ndarray | None = None,
        marginals_black: np.ndarray | None = None,
    ) -> "SubgameNode":
        """Construct the root node from a known truth board.

        If ``to_move`` is None, falls back to the board's own turn field.
        Observation histories start empty — info-set IDs in the subgame are
        unique within the subgame so long as histories diverge as the tree
        branches.

        ``marginals_white`` / ``marginals_black`` are optional [64, 6]
        factored-marginal tables for FoW Deep CFR. Pass both or neither.
        """
        if to_move is None:
            to_move = truth.turn
        if (marginals_white is None) != (marginals_black is None):
            raise ValueError(
                "marginals_white and marginals_black must be passed together "
                "(both None or both ndarray)."
            )
        return cls(
            truth=truth.copy(),
            to_move=to_move,
            obs_history_white=(),
            obs_history_black=(),
            depth=0,
            marginals_white=marginals_white,
            marginals_black=marginals_black,
        )

    @property
    def is_terminal(self) -> bool:
        """True when either king has been captured."""
        return (
            self.truth.king(chess.WHITE) is None
            or self.truth.king(chess.BLACK) is None
        )

    def legal_moves(self) -> list[chess.Move]:
        """FoW legal moves for the to-move player.

        FoW has no check restriction, so legal == pseudo-legal.
        """
        if self.is_terminal:
            return []
        return list(self.truth.pseudo_legal_moves)

    def info_set_id(self) -> Hashable:
        """Identifier for the to-move player's information set.

        Same observation history → same info-set ID, regardless of truth.
        This is what CFR uses to look up regret tables.
        """
        history = (
            self.obs_history_white
            if self.to_move == chess.WHITE
            else self.obs_history_black
        )
        return (self.to_move, history)

    def apply(self, move: chess.Move) -> "SubgameNode":
        """Apply ``move`` (played by ``self.to_move``) and return the next node.

        Both players' observation histories extend with what they each would
        observe of the transition. The next node's to_move flips. If this
        node carries factored marginals, the child's marginals are derived
        via ``propagate_factored_marginals`` against each player's new
        observation.
        """
        next_truth = self.truth.copy()
        next_truth.push(move)
        obs_for_white = observation_from_transition(
            self.truth, next_truth, chess.WHITE
        )
        obs_for_black = observation_from_transition(
            self.truth, next_truth, chess.BLACK
        )
        next_marginals_white: np.ndarray | None = None
        next_marginals_black: np.ndarray | None = None
        if self.marginals_white is not None and self.marginals_black is not None:
            next_marginals_white = propagate_factored_marginals(
                self.marginals_white, chess.WHITE, next_truth, obs_for_white
            )
            next_marginals_black = propagate_factored_marginals(
                self.marginals_black, chess.BLACK, next_truth, obs_for_black
            )
        return SubgameNode(
            truth=next_truth,
            to_move=not self.to_move,
            obs_history_white=self.obs_history_white + (_obs_key(obs_for_white),),
            obs_history_black=self.obs_history_black + (_obs_key(obs_for_black),),
            depth=self.depth + 1,
            marginals_white=next_marginals_white,
            marginals_black=next_marginals_black,
        )

    def terminal_value(self, perspective: chess.Color) -> float:
        """Value at a terminal node from ``perspective``'s POV in [-1, 1].

        +1 if ``perspective`` won (opp king captured), -1 if lost, 0 if both
        kings captured (degenerate). Only meaningful when ``is_terminal``.
        """
        own_king = self.truth.king(perspective)
        opp_king = self.truth.king(not perspective)
        if own_king is None and opp_king is None:
            return 0.0
        if own_king is None:
            return -1.0
        if opp_king is None:
            return 1.0
        return 0.0
