"""Opponent move priors used by the particle filter."""

from __future__ import annotations

import math
from contextlib import contextmanager
from typing import Any, Callable, Iterator, Protocol

import chess


class OpponentMovePrior(Protocol):
    """Probability over an opponent's legal moves given a candidate true board."""

    def __call__(
        self, board: chess.Board, legal: list[chess.Move]
    ) -> list[float]: ...


def uniform_prior(board: chess.Board, legal: list[chess.Move]) -> list[float]:
    """Uniform distribution over legal moves; the simplest baseline."""
    n = len(legal)
    return [1.0 / n] * n if n else []


def stockfish_shallow_prior(
    *,
    path: str = "stockfish",
    depth: int = 4,
    movetime_ms: int = 50,
    top_k: int = 8,
    softmax_temperature_cp: float = 100.0,
    uniform_blend: float = 0.3,
    threads: int = 1,
) -> tuple[OpponentMovePrior, Callable[[], None]]:
    """Stockfish-shallow prior — top-K moves at depth 4, softmaxed cp scores.

    The returned prior is a closure over a persistent Stockfish subprocess
    configured with `MultiPV=top_k`. Each call sends `position fen ... ; go
    depth D movetime T`, parses multipv info lines for top-K candidate moves
    and their cp scores, and returns a distribution over `legal`.

    Distribution shape: softmax(cp_score / temperature) over top-K moves,
    blended with uniform via `uniform_blend` so non-top-K moves retain
    enough mass that truth-particles don't die when Stockfish-shallow misses
    truth's actual move. With uniform_blend=0.3, top-K moves get ~9-10x the
    weight of non-top-K moves over typical legal-move counts — significant
    pruning without extinction.

    Returns (prior_callable, close_callable). The caller MUST invoke close()
    when done; use `stockfish_shallow_prior_ctx` for automatic cleanup.

    Falls back to uniform on engine crash, timeout, or no parsable scores.
    """
    from .evaluator import _UCIEngine  # local import; evaluator does not import this module

    engine = _UCIEngine(path=path, threads=threads)
    engine.setoption("MultiPV", str(top_k))

    # Particle expansion calls the prior once per particle; many particles
    # share boards after observation filtering, so this cache typically
    # collapses 100+ calls per opp ply into a small number of unique fens.
    # Cap is a safety against unbounded growth across long games.
    cache: dict[str, dict[str, float] | None] = {}
    CACHE_CAP = 4096

    def prior(board: chess.Board, legal: list[chess.Move]) -> list[float]:
        n = len(legal)
        if n == 0:
            return []
        fen = board.fen()
        if fen in cache:
            candidates = cache[fen]
        else:
            try:
                candidates = engine.analyze_fen_multipv(
                    board.fen(),
                    depth=depth,
                    movetime_ms=movetime_ms,
                    slack_seconds=0.3,
                )
            except Exception:  # noqa: BLE001
                candidates = None
            if len(cache) < CACHE_CAP:
                cache[fen] = candidates

        if not candidates:
            return [1.0 / n] * n

        # Softmax over top-K. Subtract max for numerical stability.
        topk_scores: list[float | None] = [candidates.get(mv.uci()) for mv in legal]
        present = [s for s in topk_scores if s is not None]
        if not present:
            return [1.0 / n] * n
        max_score = max(present)
        sf_weights: list[float] = [
            math.exp((s - max_score) / softmax_temperature_cp) if s is not None else 0.0
            for s in topk_scores
        ]
        sf_total = sum(sf_weights)
        if sf_total <= 0:
            return [1.0 / n] * n
        sf_normalized = [w / sf_total for w in sf_weights]

        # Blend with uniform so non-top-K moves keep enough mass to survive.
        uniform_share = 1.0 / n
        return [
            (1.0 - uniform_blend) * sw + uniform_blend * uniform_share
            for sw in sf_normalized
        ]

    def close() -> None:
        engine.close()

    return prior, close


@contextmanager
def stockfish_shallow_prior_ctx(**kwargs: Any) -> Iterator[OpponentMovePrior]:
    """Context-manager wrapper around `stockfish_shallow_prior`."""
    prior, close = stockfish_shallow_prior(**kwargs)
    try:
        yield prior
    finally:
        close()
