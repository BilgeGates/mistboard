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


def test_tier1_live_engines_includes_current_prod_version() -> None:
    """Guard against silently falling back to random when prod engine ID changes.

    Every version registered in the TypeScript registry's PROD_PLAYABLE_ENGINE_IDS
    must appear in TIER1_LIVE_ENGINES. Failure here means live games will fall
    back to builtin-random-legal (as happened with v0.9.1 at launch).
    """
    runner = _load_runner()
    # Keep this list in sync with PROD_PLAYABLE_ENGINE_IDS in registry.ts.
    # Update both together whenever the prod engine version changes.
    prod_tier1_ids = ["python-tier1-v0.9.5"]
    for engine_id in prod_tier1_ids:
        assert engine_id in runner.TIER1_LIVE_ENGINES, (
            f"{engine_id} missing from TIER1_LIVE_ENGINES in live_move_runner.py — "
            "live games will silently fall back to random. Add the entry."
        )


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
