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

from ..evaluator import material_score


def material_leaf_eval(board: chess.Board, perspective: chess.Color) -> float:
    """Tanh-normalized material balance from ``perspective``'s POV.

    Squashes centipawn material into ``[-1, 1]``. A rook advantage (+500cp)
    maps to ~0.76; a queen advantage (+900cp) maps to ~0.95.
    """
    cp = material_score(board, perspective)
    return math.tanh(cp / 500.0)
