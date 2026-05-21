"""Position-only leaf evaluators for tabular CFR.

The CFR algorithm itself is value-scale-agnostic — but ``terminal_value`` on
the node and ``leaf_eval`` at the depth bound must produce comparable scales
or regret estimates will be dominated by whichever has larger magnitude.

Convention used here: all values are squashed into roughly ``[-1, 1]`` from
the perspective player's POV. ``+1`` ≈ winning, ``-1`` ≈ losing.
"""

from __future__ import annotations

import math

import chess

from ..evaluator import fog_discount_term, material_score


def material_leaf_eval(board: chess.Board, perspective: chess.Color) -> float:
    """Tanh-normalized material balance from ``perspective``'s POV.

    Squashes centipawn material into ``[-1, 1]``. A rook advantage (+500cp)
    maps to ~0.76; a queen advantage (+900cp) maps to ~0.95.
    """
    cp = material_score(board, perspective)
    return math.tanh(cp / 500.0)


def hybrid_fog_leaf_eval(board: chess.Board, perspective: chess.Color) -> float:
    """Tanh-normalized (material - 0.2 * fog_discount) from ``perspective``'s POV.

    Adds the simplest FoW-specific signal to material balance. ``fog_discount``
    penalizes own non-king pieces deep in enemy territory without defensive
    support — captures the FoW-implicit risk of exposed pieces to hidden
    attackers. The 0.2 weight matches ``fow_evaluator``'s ``fog_risk_weight``
    default, keeping this consistent with how the production evaluator
    blends the two signals.

    Cheaper than running full ``fow_evaluator`` at every leaf (which would
    require evaluating all legal moves) while still carrying real FoW
    knowledge into the CFR search.
    """
    cp = material_score(board, perspective) - 0.2 * fog_discount_term(
        board, perspective
    )
    return math.tanh(cp / 500.0)
