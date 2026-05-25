"""V2 Fog of War engine — assembled from A1-A6 components.

Stateful per-game engine that combines:
- A1 Stockfish leaf eval (StockfishLeafEval)
- A2 PCFR+ inner solver (in tabular.py, also used by GT-CFR)
- A3 exact P enumeration (PEnumerator)
- A4 GT-CFR substrate (GTCFRTreeNode, expand_leaf, etc.)
- A5.1 multi-root shared-regret coordinator (solve_multiroot_growing_subgame)
- A6.1 purification + stable-actions filter (purify_strategy)

Per game, a single EngineV2 instance is alive for one perspective
player. It maintains the PEnumerator across moves:

* ``observe_opp_move(obs)`` — opponent just moved; update P via the
  observation we received.
* ``observe_own_move(move)`` — we just played ``move``; update P
  deterministically.
* ``choose_move(*, iterations, time_budget_seconds)`` — sample I⊆P,
  run multi-root GT-CFR with time budget, purify, return the top
  action. Default ``max_actions=1`` (Resolve regime) until A6.2
  ships the Maxmargin gadget.

This module does NOT touch the v0.9.5 substrate (engine.py,
strategies.py, belief.py) — those stay alive as the bakeoff baseline
per the post-A7 delete plan.
"""

from __future__ import annotations

import random
from typing import Iterable

import chess

from .cfr.gt_cfr import (
    sample_roots_from_P,
    solve_multiroot_growing_subgame,
)
from .cfr.leaf_eval_stockfish import StockfishLeafEval
from .cfr.purification import PurifiedStrategy, purify_strategy
from .observation import Observation
from .p_enum import PEnumerator


_DEFAULT_I_SAMPLE_SIZE = 16
_DEFAULT_ITERATIONS = 500
_DEFAULT_MAX_ACTIONS = 1
# Cap on |P| inside the EngineV2's PEnumerator. Per-move PEnumerator
# update cost is O(|P| × branching) so this bounds per-move latency on
# pathological long games where |P| would otherwise explode into the
# 100K-1M range. Set to None to use the unbounded exact-enumeration
# guarantee from A3 (slow but truth-in-P always holds).
_DEFAULT_P_MAX_SIZE = 10_000


class EngineV2:
    """Stateful v2 engine for one perspective in one game.

    Args:
        perspective: which color this engine plays.
        starting_board: starting position (defaults to standard chess
            starting position).
        stockfish: optional pre-built StockfishLeafEval. If None, a
            fresh subprocess is spawned. Caller-supplied lets multiple
            EngineV2 instances share a single Stockfish in tests.
        rng: deterministic RNG for sampling. Defaults to random.Random().
    """

    def __init__(
        self,
        perspective: chess.Color,
        *,
        starting_board: chess.Board | None = None,
        stockfish: StockfishLeafEval | None = None,
        rng: random.Random | None = None,
        p_max_size: int | None = _DEFAULT_P_MAX_SIZE,
    ) -> None:
        self.perspective = perspective
        self.rng = rng if rng is not None else random.Random()
        self.enumerator = PEnumerator(
            perspective,
            starting_board=starting_board,
            max_size=p_max_size,
            rng=self.rng,
        )
        self._stockfish = stockfish if stockfish is not None else StockfishLeafEval()
        self._owns_stockfish = stockfish is None
        # Diagnostic counters
        self.moves_chosen = 0
        self.last_solution = None  # MultiRootGTCFRSolution
        self.last_purified: PurifiedStrategy | None = None

    def observe_opp_move(self, observation: Observation) -> None:
        """Opp just played; update P via what we observed."""
        self.enumerator.update_opp_move(observation)

    def observe_own_move(self, move: chess.Move) -> None:
        """We just played ``move``; update P deterministically."""
        self.enumerator.update_own_move(move)

    def choose_move(
        self,
        *,
        iterations: int = _DEFAULT_ITERATIONS,
        time_budget_seconds: float | None = None,
        i_sample_size: int = _DEFAULT_I_SAMPLE_SIZE,
        max_actions: int = _DEFAULT_MAX_ACTIONS,
    ) -> chess.Move:
        """Pick a move using multi-root GT-CFR + purification.

        Args:
            iterations: equilibrium passes (only an upper bound when
                time_budget_seconds is set — anytime cuts off earlier).
            time_budget_seconds: if set, stops as soon as wall time
                exceeds budget. Real-play default for live games.
            i_sample_size: |I| roots to sample from P. Smaller = faster
                per iter, less belief coverage.
            max_actions: support size after purification. 1 = Resolve
                regime (deterministic top); ≤3 = Maxmargin regime
                (mixing). Defaults to 1 until A6.2 ships Maxmargin.

        Returns:
            One chess.Move to play. Always non-None.

        Raises:
            RuntimeError: if P is empty (shouldn't happen — would
                indicate a soundness violation upstream).
        """
        if self.enumerator.size == 0:
            raise RuntimeError("P is empty; cannot choose a move")
        roots = sample_roots_from_P(
            self.enumerator.iter_positions(),
            to_move=self.perspective,
            n=i_sample_size,
            rng=self.rng,
        )
        if not roots:
            raise RuntimeError("sample_roots_from_P returned 0 roots")

        solution = solve_multiroot_growing_subgame(
            roots,
            stockfish_eval=self._stockfish,
            perspective=self.perspective,
            iterations=iterations,
            rng=self.rng,
            time_budget_seconds=time_budget_seconds,
        )
        self.last_solution = solution

        if not solution.strategy_at_root:
            raise RuntimeError("GT-CFR returned empty strategy at root")

        purified = purify_strategy(
            solution.strategy_at_root,
            solution.strategy_history_at_root,
            solution.t_half,
            max_actions=max_actions,
        )
        self.last_purified = purified

        if max_actions == 1:
            # Resolve regime: pick the single top action.
            move = next(iter(purified.strategy.keys()))
        else:
            # Maxmargin regime: sample from the purified mix.
            actions = list(purified.strategy.keys())
            probs = list(purified.strategy.values())
            r = self.rng.random()
            cum = 0.0
            move = actions[-1]
            for a, p in zip(actions, probs):
                cum += p
                if r < cum:
                    move = a
                    break

        self.moves_chosen += 1
        return move

    def close(self) -> None:
        """Release the Stockfish subprocess if this engine owns it."""
        if self._owns_stockfish:
            self._stockfish.close()

    def __enter__(self) -> "EngineV2":
        return self

    def __exit__(self, *args) -> None:
        self.close()


# ---------------------------------------------------------------------------
# Strategy-protocol adapter (selfplay.Strategy compatible)
# ---------------------------------------------------------------------------


class EngineV2Strategy:
    """Adapter making EngineV2 conform to ``selfplay.Strategy`` protocol.

    Lets v2 play through the existing ``selfplay.play_game`` harness
    against any other Strategy (Tier-1 v0.9.5 baseline, random, etc.).
    Constructs the EngineV2 lazily on reset() so the same instance can
    be reused across games (close() between resets).

    Args:
        seed: RNG seed (separate from Stockfish PRNG).
        iterations: GT-CFR equilibrium passes per move (upper bound
            when time_budget_seconds is set).
        i_sample_size: |I| roots sampled from P per move.
        time_budget_seconds: optional per-move wall budget.
        p_max_size: cap on PEnumerator |P| (None for unbounded).
        max_actions: purification regime (1 = Resolve, ≤3 = Maxmargin).
    """

    def __init__(
        self,
        *,
        seed: int = 0,
        iterations: int = 200,
        i_sample_size: int = 8,
        time_budget_seconds: float | None = None,
        p_max_size: int | None = _DEFAULT_P_MAX_SIZE,
        max_actions: int = _DEFAULT_MAX_ACTIONS,
        capture_telemetry: bool = False,
    ) -> None:
        self._seed = seed
        self._iterations = iterations
        self._i_sample_size = i_sample_size
        self._time_budget = time_budget_seconds
        self._p_max_size = p_max_size
        self._max_actions = max_actions
        self._engine: EngineV2 | None = None
        self.perspective: chess.Color | None = None
        # Per-ply telemetry. Append one row per observe_* / pick_move call.
        # Off by default — long offline runs (200+ games) want it on so
        # post-mortem analysis on |P| trajectory + per-ply wall is possible.
        self._capture_telemetry = capture_telemetry
        self.telemetry: list[dict] = []
        self._ply_seen = 0

    def reset(self, perspective: chess.Color) -> None:
        # Close any prior engine to release Stockfish + reset state.
        if self._engine is not None:
            try:
                self._engine.close()
            except Exception:
                pass
        self.perspective = perspective
        self._engine = EngineV2(
            perspective,
            rng=random.Random(self._seed),
            p_max_size=self._p_max_size,
        )
        self.telemetry = []
        self._ply_seen = 0

    def observe_own_move(self, move: chess.Move, observation) -> None:
        # selfplay.Strategy passes both move and observation; EngineV2
        # only needs the move (own moves are deterministic in P).
        if self._engine is None:
            raise RuntimeError("reset() must be called before observe_own_move")
        self._record(
            "observe_own_move",
            lambda: self._engine.observe_own_move(move),  # type: ignore[union-attr]
        )

    def observe_opp_move(self, observation) -> None:
        if self._engine is None:
            raise RuntimeError("reset() must be called before observe_opp_move")
        self._record(
            "observe_opp_move",
            lambda: self._engine.observe_opp_move(observation),  # type: ignore[union-attr]
        )

    def pick_move(self, view) -> chess.Move:
        if self._engine is None:
            raise RuntimeError("reset() must be called before pick_move")
        chosen: list[chess.Move] = []

        def _do() -> None:
            chosen.append(
                self._engine.choose_move(  # type: ignore[union-attr]
                    iterations=self._iterations,
                    i_sample_size=self._i_sample_size,
                    time_budget_seconds=self._time_budget,
                    max_actions=self._max_actions,
                )
            )

        self._record("pick_move", _do)
        return chosen[0]

    def _record(self, kind: str, fn) -> None:
        """Run ``fn`` with timing + |P| capture; append a telemetry row.
        No-op timing path when capture is off (still calls ``fn``)."""
        if not self._capture_telemetry:
            fn()
            return
        import time as _time

        eng = self._engine
        p_pre = eng.enumerator.size if eng is not None else 0
        t0 = _time.monotonic()
        fn()
        wall_ms = (_time.monotonic() - t0) * 1000.0
        p_post = eng.enumerator.size if eng is not None else 0
        self._ply_seen += 1
        row: dict = {
            "ply": self._ply_seen,
            "kind": kind,
            "p_pre": p_pre,
            "p_post": p_post,
            "wall_ms": round(wall_ms, 2),
        }
        # Capture cap-probe fields from the enumerator if the call touched
        # it (update_own_move / update_opp_move set these; pick_move does not).
        if eng is not None and kind in ("observe_own_move", "observe_opp_move"):
            row["p_raw"] = eng.enumerator.last_raw_count
            row["p_pre_cap"] = eng.enumerator.last_pre_cap_count
            row["downsampled"] = eng.enumerator.last_was_downsampled
        self.telemetry.append(row)

    def close(self) -> None:
        if self._engine is not None:
            try:
                self._engine.close()
            except Exception:
                pass
            self._engine = None
