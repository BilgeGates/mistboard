"""Pick one live PvE move for the TypeScript server.

Protocol (Phase 3c — protocol-only):
  stdin: JSON request of shape {
    "engineTurnRequest": <EngineTurnRequest, see
      packages/game/src/engine-protocol.ts>,
    "watchdogTimeoutMs": <int or null>,
    "stockfishPath": <str, optional>,
  }
  stdout: JSON response of shape {
    "roomId": str, "engine": {...}, "decisionSource": str,
    "move": {"from": str, "to": str, "promotion"?: str}
  }

The server owns HTTP, rooms, legality validation, and fallback. This
runner is the subprocess-per-move fallback used when the persistent
worker pool isn't initialized; it shares the same protocol surface as
live_move_worker.py.

The engine has access ONLY to the redacted EngineTurnRequest — no
canonical events, GameState, master seed, or opp clock. The redaction
boundary is enforced server-side at
apps/server/src/engine-protocol/build.ts.
"""

from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import replace
from pathlib import Path
from typing import Any

ROOT = Path(os.environ.get("PYTHON_ENGINE_LAB_ROOT", Path(__file__).resolve().parents[1])).resolve()
SRC = ROOT / "src"
VENDOR = ROOT / "vendor"
for path in (VENDOR, SRC):
    if path.exists() and str(path) not in sys.path:
        sys.path.insert(0, str(path))

import chess

from fow_chess.engine_protocol import request_from_json
from fow_chess.protocol_adapter import (
    board_from_request,
    build_perspective_view,
    replay_transcript_into_strategy,
)
from fow_chess.selfplay import PerspectiveView
from fow_chess.strategies import RandomStrategy
from fow_chess.tournament.config import canonical_hash, load_config
from fow_chess.tournament.runtime import bot_runtime

TIER1_CONFIG_HASH = "b22f29dd73f5"
DEADLINE_GUARD_MS = int(os.environ.get("PYTHON_LIVE_DEADLINE_GUARD_MS", "1200"))
MATERIAL_VALUE = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 100_000,
}
TIER1_LIVE_ENGINES: dict[str, dict[str, str]] = {
    "python-tier1-v0.9.5": {
        "tier1Version": "0.9.5",
        "playSignature": "372b4bb6c064",
        "engineVersion": "v0.9.5-tactical-patches@372b4bb6c064",
    },
    "python-tier1-v0.9.1": {
        "tier1Version": "0.9.1",
        "playSignature": "8918f287499f",
        "engineVersion": "v0.9.1-pawn-shield-diagonal@8918f287499f",
    },
    "python-tier1-v0.7.22": {
        "tier1Version": "0.7.22",
        "playSignature": "5d3ddffa74f6",
        "engineVersion": "v0.7.22-king-risk@5d3ddffa74f6",
    },
    "python-tier1-v0.8.9": {
        "tier1Version": "0.8.9",
        "playSignature": "2c010d792075",
        "engineVersion": "v0.8.9-repair-caps@2c010d792075",
    },
    # Live current-src variant; empty engineVersion → load from src/fow_chess.
    "python-tier1-current": {
        "tier1Version": "current",
        "playSignature": "current",
        "engineVersion": "",
    },
}


def main() -> int:
    started = time.monotonic()
    request = json.load(sys.stdin)
    req = request_from_json(request["engineTurnRequest"])
    # Subprocess-per-move: derive the strategy seed from the protocol's
    # engineSeed (which the server derives per-turn from a per-engine
    # secret + game + ply). Matches the worker-pool behavior of resetting
    # state per request — there's no cross-request state to preserve here.
    seed = req.engine_seed
    stockfish_path = str(request.get("stockfishPath") or "stockfish")
    engine_spec: dict[str, Any] = {"id": req.engine_id}

    _debug(
        "request-loaded",
        started,
        roomId=req.game_id,
        engineId=req.engine_id,
        color=req.color,
        ply=req.ply,
        legalCount=len(req.legal_moves),
        seed=seed,
        clockRemainingMs=req.clock.remaining_ms,
        incrementMs=req.clock.increment_ms,
    )

    if not req.legal_moves:
        raise RuntimeError("no legal moves available")
    view = build_perspective_view(req)
    perspective = view.perspective

    deadline = _deadline_monotonic(started, request)
    if _deadline_expired(deadline):
        guard_board = board_from_request(req)
        move = _deadline_guard_move(guard_board, view)
        _debug("deadline-guard", started, phaseBefore="runtime-ready", move=move.uci())
        _print_response(req, engine_spec, move, "deadline-guard")
        return 0

    with strategy_runtime(engine_spec, seed, stockfish_path) as strategy:
        _debug("runtime-ready", started)
        # Cold-start: replay the full observation transcript from the
        # protocol through the strategy's observe_own_move /
        # observe_opp_move hooks. `replay_transcript_into_strategy`
        # calls strategy.reset(perspective) first.
        replay_transcript_into_strategy(strategy, req)
        _debug(
            "transcript-replayed",
            started,
            transcriptLen=(
                len(req.observation_transcript) if req.observation_transcript else 0
            ),
        )
        if _deadline_expired(deadline):
            guard_board = board_from_request(req)
            move = _deadline_guard_move(guard_board, view)
            _debug(
                "deadline-guard",
                started,
                phaseBefore="pick-started",
                move=move.uci(),
            )
            _print_response(req, engine_spec, move, "deadline-guard")
            return 0
        _debug(
            "pick-started",
            started,
            ownLegalCount=len(view.own_legal_moves),
            visibleSquareCount=len(view.visible_squares),
            visiblePieceCount=len(view.visible_piece_map),
        )
        move = strategy.pick_move(view)
        _debug("pick-finished", started, move=move.uci())
        if move not in view.own_legal_moves:
            raise RuntimeError(f"engine returned illegal move: {move.uci()}")

    decision_source = "random" if isinstance(strategy, RandomStrategy) else "tier1"
    _print_response(req, engine_spec, move, decision_source)
    return 0


def _print_response(
    req: Any,
    engine_spec: dict[str, Any],
    move: chess.Move,
    decision_source: str,
) -> None:
    """Response shape matches apps/server PythonPoolResponse.

    Castling uses king-destination (e1→g1), not rook-square — variants.ts
    accepts both forms via alias generation (variants.ts:589).
    """
    promo_letter = None
    if move.promotion is not None:
        promo_letter = {
            chess.QUEEN: "queen", chess.ROOK: "rook",
            chess.BISHOP: "bishop", chess.KNIGHT: "knight",
        }[move.promotion]
    print(json.dumps({
        "roomId": req.game_id,
        "engine": engine_metadata(engine_spec),
        "decisionSource": decision_source,
        "move": {
            "from": chess.SQUARE_NAMES[move.from_square],
            "to": chess.SQUARE_NAMES[move.to_square],
            **({"promotion": promo_letter} if promo_letter else {}),
        },
    }, separators=(",", ":")))


def _debug(phase: str, started: float, **fields: Any) -> None:
    print(
        json.dumps(
            {
                "kind": "python_live_engine_debug",
                "phase": phase,
                "elapsedMs": round((time.monotonic() - started) * 1000),
                **fields,
            },
            separators=(",", ":"),
        ),
        file=sys.stderr,
        flush=True,
    )


def _deadline_monotonic(started: float, request: dict[str, Any]) -> float | None:
    watchdog_timeout_ms = _parse_optional_int(request.get("watchdogTimeoutMs"))
    if watchdog_timeout_ms is None:
        return None
    budget_ms = max(1, watchdog_timeout_ms - DEADLINE_GUARD_MS)
    return started + budget_ms / 1000.0


def _deadline_expired(deadline: float | None) -> bool:
    return deadline is not None and time.monotonic() >= deadline


def _deadline_guard_move(board: chess.Board, view: PerspectiveView) -> chess.Move:
    return max(
        sorted(view.own_legal_moves, key=lambda move: move.uci()),
        key=lambda move: _deadline_guard_score(board, view, move),
    )


def _deadline_guard_score(
    board: chess.Board,
    view: PerspectiveView,
    move: chess.Move,
) -> tuple[int, int, int, int]:
    mover = view.visible_piece_map.get(move.from_square)
    target = view.visible_piece_map.get(move.to_square)
    capture_score = 0
    if target is not None and target.color != view.perspective:
        capture_score = MATERIAL_VALUE.get(target.piece_type, 0)
        if mover is not None:
            capture_score -= MATERIAL_VALUE.get(mover.piece_type, 0) // 20

    castle_score = 80 if board.is_castling(move) else 0
    promotion_score = 70 if move.promotion is not None else 0
    center_score = 10 if move.to_square in {chess.D4, chess.E4, chess.D5, chess.E5} else 0
    return (capture_score, castle_score + promotion_score, center_score, -_move_sort_value(move))


def _move_sort_value(move: chess.Move) -> int:
    return move.from_square * 64 + move.to_square + (move.promotion or 0)


class strategy_runtime:
    def __init__(self, spec: dict[str, Any], seed: int, stockfish_path: str) -> None:
        self.spec = spec
        self.seed = seed
        self.stockfish_path = stockfish_path
        self._runtime = None
        self._strategy = None

    def __enter__(self):
        engine_id = str(self.spec.get("id") or "")
        if engine_id in {"python-random-legal", "builtin-random-legal"}:
            self._strategy = RandomStrategy(seed=self.seed)
            return self._strategy
        tier1 = TIER1_LIVE_ENGINES.get(engine_id)
        if tier1 is not None:
            config = load_config(ROOT / "configs" / "tier1-v1.json")
            if canonical_hash(config) != TIER1_CONFIG_HASH:
                raise RuntimeError("tier1-v1 config hash mismatch")
            if tier1.get("engineVersion"):
                config = replace(config, engine_version=tier1["engineVersion"])
            self._runtime = bot_runtime(config, stockfish_path=self.stockfish_path)
            factory = self._runtime.__enter__()
            self._strategy = factory(self.seed)
            return self._strategy
        raise RuntimeError(f"unsupported Python live engine: {engine_id}")

    def __exit__(self, exc_type, exc, tb):
        if self._runtime is not None:
            return self._runtime.__exit__(exc_type, exc, tb)
        return False


def engine_metadata(spec: dict[str, Any]) -> dict[str, Any]:
    engine_id = str(spec.get("id") or "")
    tier1 = TIER1_LIVE_ENGINES.get(engine_id)
    if tier1 is not None:
        return {
            "id": engine_id,
            "tier1Version": tier1["tier1Version"],
            "configHash": TIER1_CONFIG_HASH,
            "playSignature": tier1["playSignature"],
            "engineVersion": tier1["engineVersion"],
        }
    return {"id": engine_id}


def _parse_optional_int(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


if __name__ == "__main__":
    raise SystemExit(main())
