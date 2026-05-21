"""Depth-bounded subgame walker for tabular CFR over Fog of War chess.

The walker does not carry a full `BeliefState` through nodes. Belief is implicit
in each player's observation history; tabular CFR identifies information sets
by `(to_move, observation_history)`. This is sufficient for Phase 1 validation
with a position-only leaf evaluator. Phase 2 (value-net leaf consuming factored
marginals) will reconstruct belief at leaves from the observation history.

Mechanics-correctness contract: see ``lab/diag/cfr-walker-test-plan.md``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Hashable

import chess

from ..observation import Observation, observation_from_transition


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
    """

    truth: chess.Board
    to_move: chess.Color
    obs_history_white: tuple
    obs_history_black: tuple
    depth: int

    @classmethod
    def root(
        cls,
        truth: chess.Board,
        to_move: chess.Color | None = None,
    ) -> "SubgameNode":
        """Construct the root node from a known truth board.

        If ``to_move`` is None, falls back to the board's own turn field.
        Observation histories start empty — info-set IDs in the subgame are
        unique within the subgame so long as histories diverge as the tree
        branches.
        """
        if to_move is None:
            to_move = truth.turn
        return cls(
            truth=truth.copy(),
            to_move=to_move,
            obs_history_white=(),
            obs_history_black=(),
            depth=0,
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
        observe of the transition. The next node's to_move flips.
        """
        next_truth = self.truth.copy()
        next_truth.push(move)
        obs_for_white = observation_from_transition(
            self.truth, next_truth, chess.WHITE
        )
        obs_for_black = observation_from_transition(
            self.truth, next_truth, chess.BLACK
        )
        return SubgameNode(
            truth=next_truth,
            to_move=not self.to_move,
            obs_history_white=self.obs_history_white + (_obs_key(obs_for_white),),
            obs_history_black=self.obs_history_black + (_obs_key(obs_for_black),),
            depth=self.depth + 1,
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
