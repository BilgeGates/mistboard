"""One-sided Growing-Tree CFR (Obscuro variant of Schmid et al. 2023).

GT-CFR alternates two operations on a *growing* game tree:

* **Equilibrium pass:** runs PCFR+ over the currently-expanded subtree.
* **Expansion pass:** selects one leaf via PUCT-mixture and expands all
  its children at once using Stockfish MultiPV.

The Obscuro variant differs from standard GT-CFR in two ways the
synthesis doc flags as essential:

1. Operates on the **game tree itself** (per-(truth, history) nodes),
   not the public tree. FoW chess has rare common knowledge, so the
   public tree is degenerate.
2. **One-sided**: each iteration alternates which player is "exploring".
   Non-exploring player plays the current solved strategy y^t.
   Exploring player plays a PUCT-mixture biased toward visiting
   high-value, under-visited leaves.

This module is written fresh rather than bolted onto tabular.py because
the data flow is meaningfully different: tabular CFR enumerates every
legal action at every visit; GT-CFR only sees actions that have been
*expanded*. We share PCFR+ regret-matching math conceptually but
re-implement it here to keep the traversal coherent.

Reference: docs-private/fog-of-war/library/research/papers/architecture-synthesis.md
(One-sided GT-CFR, Appendix C.4) and the PCFR+ section above it.
"""

from __future__ import annotations

import math
import random
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Hashable, Iterable

import chess


# ---------------------------------------------------------------------------
# Tree data structure
# ---------------------------------------------------------------------------


@dataclass
class GTCFRTreeNode:
    """A node in the GT-CFR growing tree.

    Wraps a game-state descriptor (truth + observation histories) and
    tracks which actions out of this node have been expanded into child
    nodes. Leaves have no expanded children; their value comes from
    the Stockfish evaluation captured at expansion time.

    ``stockfish_child_evals`` is populated when this node is EXPANDED
    (children added). The dict maps each chess-legal action → tanh-
    normalized Stockfish value from the perspective player's POV.
    Children that aren't FoW-legal-but-not-chess-legal lack entries
    and rely on a material-eval fallback at use time.
    """

    truth: chess.Board
    to_move: chess.Color
    obs_history_white: tuple
    obs_history_black: tuple
    depth: int
    # Children that have been expanded out of this node.
    children: dict[chess.Move, "GTCFRTreeNode"] = field(default_factory=dict)
    # Whether this node has been expanded (children populated). Distinct
    # from "has children" because a terminal node has no children even
    # when "expanded" (no expansion needed; terminal_value is exact).
    is_expanded: bool = False
    # Leaf value from the search's perspective POV. Populated by the
    # parent's expansion (this node was a child created during that
    # expansion). None on the root.
    leaf_value: float | None = None

    @property
    def is_terminal(self) -> bool:
        return (
            self.truth.king(chess.WHITE) is None
            or self.truth.king(chess.BLACK) is None
        )

    @property
    def is_leaf(self) -> bool:
        """A leaf in the *current* tree: hasn't been expanded yet (or is terminal)."""
        return self.is_terminal or not self.is_expanded

    def info_set_id(self) -> Hashable:
        history = (
            self.obs_history_white
            if self.to_move == chess.WHITE
            else self.obs_history_black
        )
        return (self.to_move, history)

    def terminal_value(self, perspective: chess.Color) -> float:
        own_king = self.truth.king(perspective)
        opp_king = self.truth.king(not perspective)
        if own_king is None and opp_king is None:
            return 0.0
        if own_king is None:
            return -1.0
        if opp_king is None:
            return 1.0
        return 0.0


def root_node(truth: chess.Board, to_move: chess.Color | None = None) -> GTCFRTreeNode:
    """Construct the root tree node from a known truth board (no expansion yet)."""
    if to_move is None:
        to_move = truth.turn
    return GTCFRTreeNode(
        truth=truth.copy(),
        to_move=to_move,
        obs_history_white=(),
        obs_history_black=(),
        depth=0,
    )


# ---------------------------------------------------------------------------
# Per-search state (regrets + visit counts + value sums)
# ---------------------------------------------------------------------------


@dataclass
class GTCFRState:
    """Mutable state of a GT-CFR search.

    Per-infoset state:
    * ``regrets[I][a]``   — cumulative thresholded regret (PCFR+ z).
    * ``last_regret[I][a]`` — regret vector observed at most recent visit.
    * ``last_strategy[I][a]`` — most recent strategy (for last-iterate).
    * ``visits[I]`` — total visits to this infoset across iterations.

    Per-(infoset, action) state:
    * ``visit_counts[(I, a)]`` — N(I, a).
    * ``value_sum[(I, a)]`` — Σ u(x^t, y^t | I, a) over visits.
    * ``value_sq_sum[(I, a)]`` — Σ u² for empirical variance.
    """

    regrets: dict = field(default_factory=lambda: defaultdict(lambda: defaultdict(float)))
    last_regret: dict = field(default_factory=lambda: defaultdict(lambda: defaultdict(float)))
    last_strategy: dict = field(default_factory=lambda: defaultdict(lambda: defaultdict(float)))
    visits: dict = field(default_factory=lambda: defaultdict(int))
    visit_counts: dict = field(default_factory=lambda: defaultdict(lambda: defaultdict(int)))
    value_sum: dict = field(default_factory=lambda: defaultdict(lambda: defaultdict(float)))
    value_sq_sum: dict = field(default_factory=lambda: defaultdict(lambda: defaultdict(float)))


# ---------------------------------------------------------------------------
# Tree navigation helpers
# ---------------------------------------------------------------------------


def find_leaves(root: GTCFRTreeNode) -> list[GTCFRTreeNode]:
    """Return all non-terminal leaves currently in the tree.

    "Leaf" here = node not yet expanded AND not terminal. Terminal
    nodes are not expansion candidates; they have known terminal value.
    """
    leaves: list[GTCFRTreeNode] = []
    stack = [root]
    while stack:
        node = stack.pop()
        if node.is_terminal:
            continue
        if not node.is_expanded:
            leaves.append(node)
            continue
        stack.extend(node.children.values())
    return leaves


# ---------------------------------------------------------------------------
# PUCT-based leaf selection (Obscuro Appendix C.4)
# ---------------------------------------------------------------------------


# Empirical-variance prior: 2 fake samples of ±1 give an initial σ² estimate.
# Implementation detail per the paper.
_PUCT_C = 1.0
_PRIOR_VARIANCE = 1.0  # variance of two ±1 samples = 1.0


def _q_value(
    info_set_id: Hashable,
    action: chess.Move,
    state: GTCFRState,
) -> float:
    """Empirical mean value Q̄(I, a) over visits to (I, a). 0 if unvisited."""
    n = state.visit_counts[info_set_id][action]
    if n == 0:
        return 0.0
    return state.value_sum[info_set_id][action] / n


def _empirical_variance(
    info_set_id: Hashable,
    action: chess.Move,
    state: GTCFRState,
) -> float:
    """σ̂²(I, a) with two prior samples of ±1 mixed in (paper convention)."""
    n_real = state.visit_counts[info_set_id][action]
    n_total = n_real + 2  # +2 priors
    sum_x = state.value_sum[info_set_id][action]
    sum_x2 = state.value_sq_sum[info_set_id][action] + _PRIOR_VARIANCE * 2  # +1² + (-1)² = 2
    if n_total <= 1:
        return _PRIOR_VARIANCE
    mean = sum_x / n_total
    var = max(0.0, sum_x2 / n_total - mean * mean)
    return var


def puct_score(
    info_set_id: Hashable,
    action: chess.Move,
    state: GTCFRState,
    *,
    c: float = _PUCT_C,
) -> float:
    """Obscuro's PUCT formula:

        Q̄(I, a) + C · σ̂(I, a) · √N(I) / (1 + N(I, a))

    Where σ̂ is empirical-std-dev with two prior ±1 samples baked in.
    """
    q = _q_value(info_set_id, action, state)
    sigma = math.sqrt(_empirical_variance(info_set_id, action, state))
    n_infoset = max(1, state.visits[info_set_id])
    n_action = state.visit_counts[info_set_id][action]
    explore = c * sigma * math.sqrt(n_infoset) / (1 + n_action)
    return q + explore


def select_action_for_exploring_player(
    info_set_id: Hashable,
    legal_actions: list[chess.Move],
    state: GTCFRState,
    current_strategy: dict[chess.Move, float],
    *,
    rng: random.Random,
    c: float = _PUCT_C,
) -> chess.Move:
    """Exploring-player action selection (Obscuro Appendix C.4).

    x̃ = (1/2) x̃_Max + (1/2) x̃_PUCT
    * x̃_Max: uniform over support of current strategy
    * x̃_PUCT: argmax of PUCT score over legal_actions

    Implementation: with prob 0.5, sample uniformly from current
    strategy's support; with prob 0.5, take argmax of PUCT.
    """
    if not legal_actions:
        raise ValueError("no legal actions to select from")
    if rng.random() < 0.5:
        support = [a for a in legal_actions if current_strategy.get(a, 0.0) > 0.0]
        if not support:
            support = list(legal_actions)
        return rng.choice(support)
    # PUCT branch
    return max(
        legal_actions,
        key=lambda a: puct_score(info_set_id, a, state, c=c),
    )


# ---------------------------------------------------------------------------
# Leaf expansion (Obscuro Appendix C.5)
# ---------------------------------------------------------------------------


# Importing here to keep the module's top-level imports light; the
# Stockfish path is only exercised when callers actually use it.
def expand_leaf(
    leaf: GTCFRTreeNode,
    state: GTCFRState,
    *,
    stockfish_eval,  # StockfishLeafEval — duck-typed to avoid circular import
    perspective: chess.Color,
) -> int:
    """Expand all children of ``leaf`` at once using Stockfish MultiPV.

    Per Obscuro Appendix C.5:
    * Call Stockfish in MultiPV mode at depth 1 to evaluate every
      child position in a single call.
    * Add every chess-legal child to the tree.
    * Initialize the regret minimizer at the now-non-leaf infoset with
      all weight on the best Stockfish-eval'd child. This avoids the
      "max-to-average" instability when a fresh infoset transitions
      from leaf-eval to mixed-strategy evaluation.

    FoW-only-legal moves (chess-illegal but FoW-legal) are added with a
    material-eval fallback inside the larger search; here we ONLY
    populate the children that Stockfish returned values for.

    Returns: number of children added (0 if leaf is terminal or
    Stockfish returned no usable evals; caller should bail).
    """
    from .leaf_eval import material_leaf_eval  # local import to avoid cycle

    if leaf.is_terminal:
        return 0
    if leaf.is_expanded:
        return 0  # idempotent

    from ..observation import observation_from_transition  # local
    from .walker import _obs_key

    # MultiPV at depth 1: per-action Stockfish eval from `perspective` POV.
    child_evals = stockfish_eval.evaluate_children(leaf.truth, perspective)

    legal_moves = list(leaf.truth.pseudo_legal_moves)
    added = 0
    for move in legal_moves:
        next_truth = leaf.truth.copy()
        next_truth.push(move)
        obs_for_white = observation_from_transition(leaf.truth, next_truth, chess.WHITE)
        obs_for_black = observation_from_transition(leaf.truth, next_truth, chess.BLACK)
        # Each child carries its own leaf_value (from perspective POV).
        if move in child_evals:
            child_leaf = child_evals[move]
        else:
            # FoW-legal-but-chess-illegal: material fallback.
            child_leaf = material_leaf_eval(next_truth, perspective)
        child = GTCFRTreeNode(
            truth=next_truth,
            to_move=not leaf.to_move,
            obs_history_white=leaf.obs_history_white + (_obs_key(obs_for_white),),
            obs_history_black=leaf.obs_history_black + (_obs_key(obs_for_black),),
            depth=leaf.depth + 1,
            leaf_value=child_leaf,
        )
        leaf.children[move] = child
        added += 1

    leaf.is_expanded = True

    # Smart regret init at the now-non-leaf infoset: bias the next
    # regret-matching pass toward the best-Stockfish-eval'd child.
    # leaf.children store their leaf_value from `perspective` POV;
    # leaf.to_move may differ from perspective, in which case best-for-
    # leaf-to-move = lowest-leaf_value (from perspective's POV).
    info_set_id = leaf.info_set_id()
    if leaf.children:
        if leaf.to_move == perspective:
            best_move = max(leaf.children.keys(),
                            key=lambda m: leaf.children[m].leaf_value or 0.0)
        else:
            best_move = min(leaf.children.keys(),
                            key=lambda m: leaf.children[m].leaf_value or 0.0)
        _SEED_REGRET = 1.0
        for move in leaf.children:
            state.regrets[info_set_id][move] = (
                _SEED_REGRET if move == best_move else 0.0
            )

    return added


# ---------------------------------------------------------------------------
# Equilibrium pass (PCFR+ over current expanded tree)
# ---------------------------------------------------------------------------


def _current_strategy(
    info_set_id: Hashable,
    actions: list[chess.Move],
    state: GTCFRState,
) -> list[float]:
    """PCFR+ strategy: x = [z + last_regret]^+ / ||·||_1."""
    z = state.regrets[info_set_id]
    prev = state.last_regret.get(info_set_id, {})
    positive = [max(0.0, z.get(a, 0.0) + prev.get(a, 0.0)) for a in actions]
    total = sum(positive)
    if total > 0.0:
        return [r / total for r in positive]
    n = len(actions)
    return [1.0 / n] * n


def _sample(probs: list[float], rng: random.Random) -> int:
    r = rng.random()
    cum = 0.0
    for i, p in enumerate(probs):
        cum += p
        if r < cum:
            return i
    return len(probs) - 1


def _equilibrium_traverse(
    node: GTCFRTreeNode,
    state: GTCFRState,
    traversing_player: chess.Color,
    perspective: chess.Color,
    rng: random.Random,
) -> float:
    """PCFR+ traversal over the currently-expanded tree.

    Returns the value of ``node`` from ``traversing_player`` POV.

    * Terminal: terminal_value(traversing_player).
    * Leaf (not expanded, not terminal): leaf_value, sign-flipped if
      ``traversing_player != perspective`` (leaves are stored in
      ``perspective`` POV).
    * Expanded internal node, traverser's turn: enumerate all expanded
      actions, recurse, accumulate regret. RM+ thresholded update.
    * Expanded internal node, opp's turn: sample one action from opp's
      current strategy, recurse.
    """
    if node.is_terminal:
        return node.terminal_value(traversing_player)
    if not node.is_expanded:
        v = node.leaf_value if node.leaf_value is not None else 0.0
        return v if traversing_player == perspective else -v
    actions = list(node.children.keys())
    if not actions:
        return 0.0  # shouldn't normally happen; safety
    info_set_id = node.info_set_id()
    strategy = _current_strategy(info_set_id, actions, state)
    state.visits[info_set_id] += 1
    if node.to_move == traversing_player:
        action_values = [0.0] * len(actions)
        for i, action in enumerate(actions):
            action_values[i] = _equilibrium_traverse(
                node.children[action], state, traversing_player, perspective, rng,
            )
        node_value = sum(s * v for s, v in zip(strategy, action_values))
        # PCFR+ regret update: z := [z + r]^+ ; stash raw r for next-iter prediction.
        for i, action in enumerate(actions):
            r = action_values[i] - node_value
            cur = state.regrets[info_set_id].get(action, 0.0)
            state.regrets[info_set_id][action] = max(0.0, cur + r)
            state.last_regret[info_set_id][action] = r
            state.last_strategy[info_set_id][action] = strategy[i]
            # PUCT bookkeeping
            state.visit_counts[info_set_id][action] += 1
            state.value_sum[info_set_id][action] += action_values[i]
            state.value_sq_sum[info_set_id][action] += action_values[i] ** 2
        return node_value
    # Opp's turn: external sampling
    chosen = _sample(strategy, rng)
    for i, action in enumerate(actions):
        state.last_strategy[info_set_id][action] = strategy[i]
    return _equilibrium_traverse(
        node.children[actions[chosen]], state, traversing_player, perspective, rng,
    )


# ---------------------------------------------------------------------------
# Expansion pass (PUCT-mixture walk to find a leaf)
# ---------------------------------------------------------------------------


def _select_leaf_for_expansion(
    root: GTCFRTreeNode,
    state: GTCFRState,
    exploring_player: chess.Color,
    rng: random.Random,
) -> GTCFRTreeNode | None:
    """Walk from root using exploring-player = PUCT-mixture, non-exploring
    = current strategy. Return the first non-terminal leaf encountered,
    or None if the entire reachable subtree is terminal/exhausted."""
    node = root
    while True:
        if node.is_terminal:
            return None
        if not node.is_expanded:
            return node
        actions = list(node.children.keys())
        if not actions:
            return None
        info_set_id = node.info_set_id()
        strategy_list = _current_strategy(info_set_id, actions, state)
        strategy = {a: p for a, p in zip(actions, strategy_list)}
        if node.to_move == exploring_player:
            move = select_action_for_exploring_player(
                info_set_id, actions, state, strategy, rng=rng,
            )
        else:
            idx = _sample(strategy_list, rng)
            move = actions[idx]
        node = node.children[move]


# ---------------------------------------------------------------------------
# Top-level coordinator
# ---------------------------------------------------------------------------


@dataclass
class GTCFRSolution:
    """Output of solve_growing_subgame."""

    strategy_at_root: dict[chess.Move, float]
    """Last-iterate strategy at the root (PCFR+ convention)."""

    value_at_root: float
    """Empirical Q-value at the root, averaged over visits."""

    iterations: int
    info_set_count: int
    tree_node_count: int


@dataclass
class MultiRootGTCFRSolution:
    """Output of solve_multiroot_growing_subgame.

    Strategy is computed at the SHARED root infoset (all roots have the
    same to_move + empty observation history, so they share infoset
    keys; the multi-root architecture is what gives KLUSS its
    cross-truth reasoning).
    """

    strategy_at_root: dict[chess.Move, float]
    value_at_root: float
    iterations: int
    info_set_count: int
    total_tree_nodes: int
    n_roots: int
    elapsed_seconds: float
    """Wall-time consumed (matters when time_budget_seconds is set)."""

    strategy_history_at_root: list[dict] = field(default_factory=list)
    """Per-iteration snapshots of the root-infoset strategy. Used by
    A6 purification (stable-actions filter checks support continuously
    for t > T_{1/2})."""

    t_half: int = 0
    """Iteration index at which half the wall budget had elapsed (when
    time_budget_seconds is set) or iterations // 2 otherwise. The
    stable-actions filter checks support continuously for t > t_half."""


def _count_nodes(root: GTCFRTreeNode) -> int:
    n = 1
    for child in root.children.values():
        n += _count_nodes(child)
    return n


def solve_growing_subgame(
    root: GTCFRTreeNode,
    *,
    stockfish_eval,
    perspective: chess.Color,
    iterations: int,
    expansion_budget: int | None = None,
    rng: random.Random | None = None,
) -> GTCFRSolution:
    """One-sided GT-CFR over a growing game tree.

    Each iteration:
    1. Equilibrium pass — PCFR+ traversal over the currently-expanded
       tree. Alternates traversing player by iteration index.
    2. Expansion pass — walk from root using exploring-player =
       PUCT-mixture, non-exploring = current solved strategy. Expand
       the first unexpanded leaf encountered.

    Args:
        root: tree root (typically constructed via root_node(board)).
        stockfish_eval: a StockfishLeafEval instance (or duck-compatible).
        perspective: which color is the search's "from-POV" reference.
            Leaf evals are stored in this POV; the equilibrium pass
            assumes traversing_player == perspective for sign convention.
        iterations: total equilibrium passes to run.
        expansion_budget: max expansions performed. Defaults to
            ``iterations`` (one expansion per iter).
        rng: deterministic RNG; defaults to fresh random.Random(0).
    """
    if rng is None:
        rng = random.Random(0)
    if expansion_budget is None:
        expansion_budget = iterations
    state = GTCFRState()

    # Bootstrap: root must be expanded so the first equilibrium pass
    # has structure to walk. (If root is terminal we have nothing to do.)
    if not root.is_terminal and not root.is_expanded:
        expand_leaf(root, state, stockfish_eval=stockfish_eval, perspective=perspective)
    expansions_done = 1 if root.is_expanded else 0

    for t in range(iterations):
        # Equilibrium pass — alternate traversing player each iter.
        # Standard external-sampling CFR requires both players' regrets
        # to be updated; without alternating, the non-perspective player
        # never refines and the perspective player's strategy degenerates
        # to "best response to a fixed bad strategy". Leaf values are
        # stored in `perspective` POV; _equilibrium_traverse sign-flips
        # them when traversing_player != perspective.
        for traversing_player in (perspective, not perspective):
            _equilibrium_traverse(root, state, traversing_player, perspective, rng)

        # Expansion pass — alternate exploring player by iter index.
        if expansions_done < expansion_budget:
            exploring = chess.WHITE if t % 2 == 0 else chess.BLACK
            leaf = _select_leaf_for_expansion(root, state, exploring, rng)
            if leaf is not None:
                expand_leaf(
                    leaf, state,
                    stockfish_eval=stockfish_eval,
                    perspective=perspective,
                )
                expansions_done += 1

    # Last-iterate strategy at the root.
    root_info_set = root.info_set_id()
    actions_at_root = list(root.children.keys())
    if not actions_at_root:
        return GTCFRSolution(
            strategy_at_root={},
            value_at_root=0.0,
            iterations=iterations,
            info_set_count=0,
            tree_node_count=_count_nodes(root),
        )
    last = state.last_strategy.get(root_info_set, {})
    if last:
        raw = [last.get(a, 0.0) for a in actions_at_root]
        total = sum(raw)
        if total > 0:
            strat = {a: r / total for a, r in zip(actions_at_root, raw)}
        else:
            strat_list = _current_strategy(root_info_set, actions_at_root, state)
            strat = dict(zip(actions_at_root, strat_list))
    else:
        strat_list = _current_strategy(root_info_set, actions_at_root, state)
        strat = dict(zip(actions_at_root, strat_list))

    # Root value estimate: weight Q(I,a) by strategy.
    value = 0.0
    for a in actions_at_root:
        n = state.visit_counts[root_info_set][a]
        if n > 0:
            value += strat[a] * (state.value_sum[root_info_set][a] / n)

    return GTCFRSolution(
        strategy_at_root=strat,
        value_at_root=value,
        iterations=iterations,
        info_set_count=len(state.regrets),
        tree_node_count=_count_nodes(root),
    )


# ---------------------------------------------------------------------------
# Multi-root KLUSS-flavored coordinator (Phase A5)
# ---------------------------------------------------------------------------


def sample_roots_from_P(
    iter_positions: Iterable[str],
    *,
    to_move: chess.Color,
    n: int,
    rng: random.Random,
) -> list[GTCFRTreeNode]:
    """Reservoir-sample ``n`` board FENs from a streaming `P` iterator and
    build ``GTCFRTreeNode`` roots from them.

    Each root has empty observation history (fresh subgame); they share
    the root infoset key ``(to_move, (), ())`` so PCFR+ regret tables
    at the root are shared automatically across truths.

    Returns ``min(n, |P|)`` roots — if ``P`` is smaller than ``n``,
    sample without replacement gives every position.
    """
    reservoir: list[str] = []
    seen = 0
    for fen in iter_positions:
        seen += 1
        if len(reservoir) < n:
            reservoir.append(fen)
            continue
        i = rng.randint(0, seen - 1)
        if i < n:
            reservoir[i] = fen
    roots: list[GTCFRTreeNode] = []
    for fen in reservoir:
        board = chess.Board(fen)
        roots.append(root_node(board, to_move=to_move))
    return roots


def _multi_count_nodes(roots: list[GTCFRTreeNode]) -> int:
    return sum(_count_nodes(r) for r in roots)


def solve_multiroot_growing_subgame(
    roots: list[GTCFRTreeNode],
    *,
    stockfish_eval,
    perspective: chess.Color,
    iterations: int,
    expansion_budget: int | None = None,
    rng: random.Random | None = None,
    time_budget_seconds: float | None = None,
) -> MultiRootGTCFRSolution:
    """Multi-root one-sided GT-CFR with shared regret tables — KLUSS-flavored.

    Each root in ``roots`` represents a sampled truth from the player's
    belief P. All roots share regret tables via the per-infoset
    ``GTCFRState``, so two roots that hit the same observation-history
    infoset at any depth contribute to the same regret table. This is
    the cross-truth reasoning that KLUSS provides — no per-truth
    aggregation step is needed.

    Each iteration:
    1. Equilibrium pass — walk EVERY root with the current alternating
       traverser. Regrets accumulate at shared infosets.
    2. Expansion pass — across all roots, find one non-terminal leaf
       via PUCT-mixture walk (alternating exploring player) and expand
       it via Stockfish MultiPV.

    Args:
        roots: list of fresh GTCFRTreeNode roots (typically from
            sample_roots_from_P).
        stockfish_eval: StockfishLeafEval instance (or compatible).
        perspective: the player's POV. Leaf evals stored in this POV;
            traversals from the other player sign-flip leaf reads.
        iterations: target number of equilibrium passes.
        expansion_budget: max expansions across all roots. Defaults to
            iterations × len(roots).
        rng: deterministic RNG. Defaults to random.Random(0).
        time_budget_seconds: if set, stops as soon as cumulative wall
            time exceeds this — anytime algorithm.

    Returns:
        MultiRootGTCFRSolution. ``strategy_at_root`` is the last-iterate
        strategy at the shared root infoset.
    """
    if not roots:
        raise ValueError("at least one root required")
    if rng is None:
        rng = random.Random(0)
    if expansion_budget is None:
        expansion_budget = iterations * len(roots)
    state = GTCFRState()
    t_start = time.monotonic()

    # Bootstrap: expand each non-terminal root so the equilibrium pass
    # has something to walk.
    expansions_done = 0
    for r in roots:
        if not r.is_terminal and not r.is_expanded:
            expand_leaf(r, state, stockfish_eval=stockfish_eval, perspective=perspective)
            expansions_done += 1

    iters_completed = 0
    strategy_history: list[dict] = []
    half_budget_reached_at: int | None = None
    for t in range(iterations):
        # Time-budget check at iteration boundary.
        elapsed = time.monotonic() - t_start
        if time_budget_seconds is not None and elapsed >= time_budget_seconds:
            break

        # Record when we cross the half-time-budget mark (for A6 purification
        # stable-actions filter).
        if (time_budget_seconds is not None
                and half_budget_reached_at is None
                and elapsed >= time_budget_seconds / 2.0):
            half_budget_reached_at = t

        # Equilibrium pass: alternate traverser, walk all roots.
        for traversing_player in (perspective, not perspective):
            for r in roots:
                _equilibrium_traverse(r, state, traversing_player, perspective, rng)

        # Snapshot root-infoset strategy for purification's stable-actions
        # filter. Cheap (one dict copy per iteration).
        if roots:
            root_info_set = roots[0].info_set_id()
            all_actions = set()
            for r in roots:
                all_actions.update(r.children.keys())
            if all_actions:
                strat_now = _current_strategy(
                    root_info_set, list(all_actions), state,
                )
                strategy_history.append(dict(zip(all_actions, strat_now)))

        # Expansion pass: pick one root × leaf via PUCT-mixture walk.
        if expansions_done < expansion_budget:
            exploring = chess.WHITE if t % 2 == 0 else chess.BLACK
            # Pick the root with fewest expansions so far (round-robin-ish);
            # ties broken by random choice.
            best_root = min(
                roots,
                key=lambda r: (_count_nodes(r), rng.random()),
            )
            leaf = _select_leaf_for_expansion(best_root, state, exploring, rng)
            if leaf is not None:
                expand_leaf(
                    leaf, state,
                    stockfish_eval=stockfish_eval,
                    perspective=perspective,
                )
                expansions_done += 1
        iters_completed += 1

    # Resolve t_half for purification. If we had a time budget, use the
    # iteration index where wall time crossed budget/2. Otherwise use
    # the conventional iters_completed // 2.
    if half_budget_reached_at is not None:
        t_half = half_budget_reached_at
    else:
        t_half = iters_completed // 2

    # Last-iterate strategy at the SHARED root infoset.
    # All roots share info_set_id == (to_move, (), ()) since their
    # observation histories are empty.
    root_info_set = roots[0].info_set_id()
    # Union of all legal actions across roots (different truths admit
    # different move sets; the regret table is keyed by action and
    # only contains actions visited by SOME root).
    all_actions = set()
    for r in roots:
        all_actions.update(r.children.keys())
    actions_at_root = list(all_actions)
    if not actions_at_root:
        return MultiRootGTCFRSolution(
            strategy_at_root={},
            value_at_root=0.0,
            iterations=iters_completed,
            info_set_count=len(state.regrets),
            total_tree_nodes=_multi_count_nodes(roots),
            n_roots=len(roots),
            elapsed_seconds=time.monotonic() - t_start,
            strategy_history_at_root=strategy_history,
            t_half=t_half,
        )
    last = state.last_strategy.get(root_info_set, {})
    if last:
        raw = [last.get(a, 0.0) for a in actions_at_root]
        total = sum(raw)
        if total > 0:
            strat = {a: r / total for a, r in zip(actions_at_root, raw)}
        else:
            strat_list = _current_strategy(root_info_set, actions_at_root, state)
            strat = dict(zip(actions_at_root, strat_list))
    else:
        strat_list = _current_strategy(root_info_set, actions_at_root, state)
        strat = dict(zip(actions_at_root, strat_list))

    value = 0.0
    for a in actions_at_root:
        n = state.visit_counts[root_info_set][a]
        if n > 0:
            value += strat[a] * (state.value_sum[root_info_set][a] / n)

    return MultiRootGTCFRSolution(
        strategy_at_root=strat,
        value_at_root=value,
        iterations=iters_completed,
        info_set_count=len(state.regrets),
        total_tree_nodes=_multi_count_nodes(roots),
        n_roots=len(roots),
        elapsed_seconds=time.monotonic() - t_start,
        strategy_history_at_root=strategy_history,
        t_half=t_half,
    )
