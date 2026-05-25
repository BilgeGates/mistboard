"""Stockfish-backed leaf evaluator for CFR over Fog of War chess.

Replaces ``hybrid_fog_leaf_eval`` with a perfect-information chess engine.
Obscuro (Zhang & Sandholm 2026) showed that Stockfish — despite knowing
nothing about FoW — works better than a hand-tuned FoW eval as the leaf
evaluator inside KLUSS subgame solving. Their ablation: hand-tuned eval
costs ~20pp vs Stockfish at the same compute budget. Per Obscuro:
"regular chess is not so different from FoW chess in terms of what
positions are good or bad."

The class manages a single Stockfish subprocess via
``chess.engine.SimpleEngine``. Spawning Stockfish per call is expensive
(~50ms cold start), so callers should reuse one instance for many
evaluations.

Two evaluation modes:

* ``evaluate(board, perspective)`` returns a single value in [-1, 1].
  Drop-in replacement for the existing ``leaf_eval`` interface
  (material, hybrid_fog).
* ``evaluate_children(board, perspective)`` returns ``{Move: float}``
  for every legal move using MultiPV at depth 1 — Obscuro's batched
  evaluation pattern. This is the call shape GT-CFR (Phase A4) will
  use when expanding a leaf and adding all its children at once.

Note on FoW semantics: Stockfish evaluates as standard chess
(check restrictions enforced, no king-capture). FoW has no check
restriction, so legal-move counts differ. ``evaluate_children`` only
returns values for moves Stockfish considers legal — FoW-legal-but-
chess-illegal moves (e.g., walking through check) get no Stockfish
evaluation. Callers must handle the gap (e.g., fall back to a cheap
heuristic, or skip those moves in expansion).
"""

from __future__ import annotations

import logging
import math
import shutil
from pathlib import Path
from types import TracebackType

import chess
import chess.engine

from .leaf_eval import material_leaf_eval


logger = logging.getLogger(__name__)


_DEFAULT_HASH_MB = 16
_DEFAULT_THREADS = 1
_DEFAULT_TANH_SCALE_CP = 500.0  # matches material_leaf_eval / hybrid_fog_leaf_eval
_MATE_SCORE_CP = 10_000  # converts mate to a large centipawn value for normalization


def _find_stockfish() -> str:
    """Locate the Stockfish binary on PATH."""
    path = shutil.which("stockfish")
    if path is None:
        raise FileNotFoundError(
            "Stockfish binary not found on PATH. Install via Homebrew "
            "(`brew install stockfish`) or set the `path` argument to "
            "StockfishLeafEval."
        )
    return path


def _score_to_eval(
    info_score: chess.engine.PovScore,
    perspective: chess.Color,
    tanh_scale_cp: float = _DEFAULT_TANH_SCALE_CP,
) -> float:
    """Convert a python-chess PovScore to a tanh-normalized [-1, 1] value
    from ``perspective``'s POV.

    Mate scores are mapped to ±_MATE_SCORE_CP before tanh — they saturate
    near ±1 cleanly.
    """
    pov = info_score.pov(perspective)
    cp = pov.score(mate_score=_MATE_SCORE_CP)
    if cp is None:
        return 0.0
    return math.tanh(cp / tanh_scale_cp)


class StockfishLeafEval:
    """Persistent Stockfish process used as a CFR leaf evaluator.

    Use as a context manager to guarantee subprocess cleanup, or call
    ``close()`` explicitly. Not thread-safe — give each CFR worker its
    own instance.

    Args:
        path: Path to the Stockfish binary. Defaults to the first
            ``stockfish`` on ``PATH``.
        hash_mb: Stockfish hash table size. 16 MB is the Stockfish
            default and is sufficient at depth 1.
        threads: Stockfish thread count. 1 is sufficient at depth 1.
        tanh_scale_cp: Centipawn divisor inside ``tanh`` normalization.
            500 matches the existing ``material_leaf_eval`` convention
            (rook advantage ≈ 0.76, queen advantage ≈ 0.95).
    """

    def __init__(
        self,
        *,
        path: str | Path | None = None,
        hash_mb: int = _DEFAULT_HASH_MB,
        threads: int = _DEFAULT_THREADS,
        tanh_scale_cp: float = _DEFAULT_TANH_SCALE_CP,
    ) -> None:
        self.path = str(path) if path is not None else _find_stockfish()
        self.tanh_scale_cp = tanh_scale_cp
        self.hash_mb = hash_mb
        self.threads = threads
        # Counters for observability — incremented when Stockfish rejects
        # a position or when we restart the engine after a crash.
        self.fallback_count = 0
        self.restart_count = 0
        self._spawn_engine()

    def _spawn_engine(self) -> None:
        self._engine = chess.engine.SimpleEngine.popen_uci(self.path)
        self._engine.configure({"Hash": self.hash_mb, "Threads": self.threads})

    def _restart_engine(self) -> None:
        try:
            self._engine.quit()
        except Exception:
            pass
        self._spawn_engine()
        self.restart_count += 1

    def __enter__(self) -> "StockfishLeafEval":
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()

    def close(self) -> None:
        try:
            self._engine.quit()
        except chess.engine.EngineError:
            pass

    def evaluate(
        self,
        board: chess.Board,
        perspective: chess.Color,
    ) -> float:
        """Stockfish position evaluation at depth 1, tanh-normalized to [-1, 1]
        from ``perspective``'s POV.

        Fog of War positions can be standard-chess-invalid (kings walked
        through check, multiple-king states, etc.). If Stockfish rejects
        or chokes on a position, this falls back to ``material_leaf_eval``
        and restarts the Stockfish subprocess. The ``fallback_count``
        attribute records how often this fired so callers can audit how
        much of their CFR traversal actually got Stockfish vs material.

        Implementation note: python-chess serializes the board to UCI as
        ``position startpos moves <move-stack>`` when the board has
        history, which forces Stockfish to replay all FoW-illegal moves
        and frequently corrupts its state. We send a fresh
        ``chess.Board(fen)`` to bypass move history — Stockfish receives
        ``position fen <fen>`` and evaluates the position directly.
        """
        if not board.is_valid():
            self.fallback_count += 1
            return material_leaf_eval(board, perspective)
        fen_board = chess.Board(board.fen())
        try:
            info = self._engine.analyse(
                fen_board,
                chess.engine.Limit(depth=1, time=0.5),
            )
            return _score_to_eval(info["score"], perspective, self.tanh_scale_cp)
        except (chess.engine.EngineError, chess.engine.EngineTerminatedError,
                chess.IllegalMoveError) as exc:
            logger.debug("stockfish eval failed on %s: %s", board.fen(), exc)
            self.fallback_count += 1
            self._restart_engine()
            return material_leaf_eval(board, perspective)

    def evaluate_children(
        self,
        board: chess.Board,
        perspective: chess.Color,
    ) -> dict[chess.Move, float]:
        """MultiPV evaluation at depth 1 of every chess-legal move.

        Returns ``{move: eval}`` where ``eval`` is the post-move position's
        tanh-normalized score from ``perspective``'s POV (NOT the score
        for the side now to move). Callers expanding a leaf in GT-CFR
        will index this dict by child move.

        Moves that are FoW-legal but chess-illegal are not in the result.
        On Stockfish error this returns an empty dict; the caller can
        fall back to per-child ``evaluate`` calls (with their own
        material fallback) if needed.
        """
        if not board.is_valid():
            self.fallback_count += 1
            return {}
        n_moves = board.legal_moves.count()
        if n_moves == 0:
            return {}
        fen_board = chess.Board(board.fen())
        try:
            info_list = self._engine.analyse(
                fen_board,
                chess.engine.Limit(depth=1, time=0.5),
                multipv=n_moves,
            )
        except (chess.engine.EngineError, chess.engine.EngineTerminatedError,
                chess.IllegalMoveError) as exc:
            logger.debug("stockfish multipv failed on %s: %s", board.fen(), exc)
            self.fallback_count += 1
            self._restart_engine()
            return {}
        out: dict[chess.Move, float] = {}
        for info in info_list:
            pv = info.get("pv") or []
            if not pv:
                continue
            move = pv[0]
            out[move] = _score_to_eval(
                info["score"], perspective, self.tanh_scale_cp
            )
        return out


def stockfish_leaf_eval_factory(
    **kwargs,
):
    """Convenience: build a closure suitable for tabular CFR's
    ``leaf_eval`` parameter, plus a teardown handle.

    Returns ``(eval_fn, eval_instance)``. The caller must call
    ``eval_instance.close()`` (or use it as a context manager elsewhere)
    when done.

    Usage::

        eval_fn, sf = stockfish_leaf_eval_factory()
        try:
            soln = solve_subgame(root, leaf_eval=eval_fn, depth=3, iters=100)
        finally:
            sf.close()
    """
    sf = StockfishLeafEval(**kwargs)
    return sf.evaluate, sf
