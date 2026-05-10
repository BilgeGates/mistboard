from __future__ import annotations

import importlib.util
from pathlib import Path

import chess


def _load_runner():
    script = Path(__file__).resolve().parents[1] / "scripts" / "live_move_runner.py"
    spec = importlib.util.spec_from_file_location("live_move_runner", script)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_deadline_guard_prefers_visible_king_capture() -> None:
    runner = _load_runner()
    board = chess.Board.empty()
    board.turn = chess.BLACK
    board.set_piece_at(chess.D8, chess.Piece(chess.QUEEN, chess.BLACK))
    board.set_piece_at(chess.E7, chess.Piece(chess.KING, chess.WHITE))

    king_capture = chess.Move.from_uci("d8e7")
    quiet = chess.Move.from_uci("d8a5")
    view = runner.PerspectiveView(
        perspective=chess.BLACK,
        own_legal_moves=[quiet, king_capture],
        visible_squares={chess.D8, chess.E7, chess.A5},
        visible_piece_map={
            chess.D8: chess.Piece(chess.QUEEN, chess.BLACK),
            chess.E7: chess.Piece(chess.KING, chess.WHITE),
        },
        clock_remaining_ms=8_000,
        increment_ms=2_000,
    )

    assert runner._deadline_guard_move(board, view) == king_capture


def test_deadline_uses_watchdog_budget_with_guard_band() -> None:
    runner = _load_runner()

    assert runner._deadline_monotonic(10.0, {"watchdogTimeoutMs": 5_000}) == 13.8
    assert runner._deadline_monotonic(10.0, {}) is None
