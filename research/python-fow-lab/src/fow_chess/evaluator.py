"""Evaluators for Tier-1 fog-of-war engines.

Two evaluators are exposed:

- `material_evaluator()` — fast, pure-Python centipawn material balance.
  Always usable, no external dependencies, no quirks. The Tier-1 baseline
  uses this.

- `stockfish_evaluator(...)` — Stockfish via UCI for stronger evaluation.
  Falls back to material on FOW positions Stockfish can't analyse safely:
  mid-game positions with side-to-move in check that wasn't escaped on the
  previous ply (FOW doesn't enforce escape) routinely cause Stockfish to
  return moves python-chess rejects, raising EngineError. Detected via a
  cheap pre-check, plus a try/except backstop.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import chess
import chess.engine

from .engine import Evaluator

_KING_CAPTURE_SCORE = 100_000.0  # Bigger than any centipawn eval Stockfish returns.

_PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 0,  # Kings handled by the king-capture short-circuit.
}


def material_score(board: chess.Board, perspective: chess.Color) -> float:
    """Centipawn material balance from `perspective`'s POV."""
    total = 0
    for piece in board.piece_map().values():
        sign = 1 if piece.color == perspective else -1
        total += sign * _PIECE_VALUES[piece.piece_type]
    return float(total)


def material_evaluator() -> Evaluator:
    """Evaluator that scores a candidate move by post-move material balance.

    Includes the king-capture short-circuit so Tier-1 always grabs an
    available king capture without needing Stockfish.
    """

    def evaluate(
        board: chess.Board, move: chess.Move, perspective: chess.Color
    ) -> float:
        target = board.piece_at(move.to_square)
        if target is not None and target.piece_type == chess.KING:
            return (
                _KING_CAPTURE_SCORE
                if target.color != perspective
                else -_KING_CAPTURE_SCORE
            )

        advanced = board.copy()
        advanced.push(move)
        return material_score(advanced, perspective)

    return evaluate


def threat_aware_evaluator(threat_lambda: float = 0.3) -> Evaluator:
    """Material balance minus a discount for `perspective`'s pieces opp can capture.

    For each candidate post-move position, sums the values of `perspective`'s
    non-king pieces that opp's pseudo-legal moves could capture (each piece
    counted once even if multiply attacked, since opp only captures one per
    turn). Subtracts `threat_lambda * threatened_value` from the material
    balance. With a lambda around 0.3, this approximates the expected loss
    from a moderately-active opponent without over-penalizing every threat.

    Threat counting depends on opponent piece positions, which differ across
    belief particles — this is the first evaluator that returns
    particle-dependent scores for non-capture moves, making per-particle
    voting and risk_aversion meaningful.
    """

    def evaluate(
        board: chess.Board, move: chess.Move, perspective: chess.Color
    ) -> float:
        target = board.piece_at(move.to_square)
        if target is not None and target.piece_type == chess.KING:
            return (
                _KING_CAPTURE_SCORE
                if target.color != perspective
                else -_KING_CAPTURE_SCORE
            )

        advanced = board.copy()
        advanced.push(move)
        if advanced.king(chess.WHITE) is None or advanced.king(chess.BLACK) is None:
            return 0.0

        base = material_score(advanced, perspective)

        # advanced.turn is now opp; iterate their pseudo-legal moves and
        # collect the squares of `perspective`'s pieces under attack.
        threatened_squares: set[int] = set()
        for m in advanced.pseudo_legal_moves:
            tgt = advanced.piece_at(m.to_square)
            if tgt is not None and tgt.color == perspective and tgt.piece_type != chess.KING:
                threatened_squares.add(m.to_square)

        threat_value = sum(
            _PIECE_VALUES[advanced.piece_at(sq).piece_type] for sq in threatened_squares
        )
        return base - threat_lambda * threat_value

    return evaluate


@contextmanager
def stockfish_evaluator(
    *,
    path: str = "stockfish",
    depth: int = 4,
    time_cap_seconds: float = 0.5,
    threads: int = 1,
) -> Iterator[Evaluator]:
    """Yield a Stockfish-backed Evaluator with material fallback.

    Falls back to `material_score` on positions Stockfish refuses (raises
    `chess.engine.EngineError`) or that are standard-chess-invalid.
    """
    engine_holder: dict[str, chess.engine.SimpleEngine | None] = {"engine": None}

    def _open() -> chess.engine.SimpleEngine:
        eng = chess.engine.SimpleEngine.popen_uci(path)
        try:
            eng.configure({"Threads": threads})
        except chess.engine.EngineError:
            pass
        return eng

    def _ensure() -> chess.engine.SimpleEngine:
        if engine_holder["engine"] is None:
            engine_holder["engine"] = _open()
        return engine_holder["engine"]

    def _restart() -> None:
        if engine_holder["engine"] is not None:
            try:
                engine_holder["engine"].quit()
            except Exception:  # noqa: BLE001
                pass
        engine_holder["engine"] = None

    engine_holder["engine"] = _open()
    limit = chess.engine.Limit(depth=depth, time=time_cap_seconds)

    try:

        def evaluate(
            board: chess.Board, move: chess.Move, perspective: chess.Color
        ) -> float:
            target = board.piece_at(move.to_square)
            if target is not None and target.piece_type == chess.KING:
                return (
                    _KING_CAPTURE_SCORE
                    if target.color != perspective
                    else -_KING_CAPTURE_SCORE
                )

            advanced = board.copy()
            advanced.push(move)

            if advanced.king(chess.WHITE) is None or advanced.king(chess.BLACK) is None:
                return 0.0
            if advanced.is_game_over(claim_draw=False):
                if advanced.is_checkmate():
                    return (
                        _KING_CAPTURE_SCORE
                        if advanced.turn != perspective
                        else -_KING_CAPTURE_SCORE
                    )
                return 0.0
            if not advanced.is_valid() or advanced.is_check():
                # FOW reaches in-check positions Stockfish can't reliably
                # analyse (returns moves python-chess deems illegal).
                return material_score(advanced, perspective)

            try:
                eng = _ensure()
                info = eng.analyse(advanced, limit)
            except (
                chess.engine.EngineError,
                chess.engine.EngineTerminatedError,
                OSError,
            ):
                _restart()
                return material_score(advanced, perspective)
            score_obj = info["score"].pov(perspective)
            cp = score_obj.score(mate_score=_KING_CAPTURE_SCORE)
            return float(cp) if cp is not None else 0.0

        yield evaluate
    finally:
        _restart()
