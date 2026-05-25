"""Long-lived Python worker for live PvE moves.

Sister script to live_move_runner.py — same logic, but holds the strategy
runtime open across many requests instead of spinning up a fresh interpreter
per move. Designed for the Node-side python-pool to keep N of these warm.

Protocol (one JSON object per line on stdin and stdout):

  Worker is launched with CLI args:
    --engine-id <id>           e.g. python-random-legal, python-tier1-v0.9.1
    --seed <int>               worker-lifetime seed used to construct the strategy
    [--stockfish <path>]       Stockfish binary (defaults to env / "stockfish")

  Once strategy init succeeds, the worker emits a single ready line:
    {"kind": "ready", "engineId": "...", "pid": <int>}

  Then it accepts request lines from stdin, one JSON object per line:
    {
      "requestId": "<opaque>",
      "engineTurnRequest": <EngineTurnRequest JSON, see
        packages/game/src/engine-protocol.ts>,
      "watchdogTimeoutMs": <int or null>
    }
  Only `engineTurnRequest` (the redacted protocol payload) carries
  game state. Worker has no access to canonical events, GameState,
  master seed, or opp clock — the redaction-tested boundary
  (apps/server/src/engine-protocol/build.ts).

  Each request yields exactly one response line:
    {"requestId": "...", "ok": true,  "response": {...same shape as one-shot...}}
    {"requestId": "...", "ok": false, "error": "..."}

  EOF on stdin → strategy cleanup → exit 0.

Per-request state (e.g. Tier-1 belief filter) is reset via strategy.reset()
before each request so games never leak state between turns. The expensive
*construction* (torch imports, weight loading) happens once at worker startup.
"""

from __future__ import annotations

import argparse
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
    # Use current src/fow_chess/ (v0.9.5-equivalent with info_reveal_bonus_coef=25
    # and the rest of the post-eval layer enabled). Empty engineVersion → runtime
    # skips the snapshot load and uses live source. Local-only via the
    # MISTBOARD_EXTRA_PLAYABLE_ENGINES env var; not in PROD_PLAYABLE_ENGINE_IDS.
    "python-tier1-current": {
        "tier1Version": "current",
        "playSignature": "current",
        "engineVersion": "",
    },
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine-id", required=True)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--stockfish", default=None)
    args = parser.parse_args()

    engine_id = args.engine_id
    seed = args.seed
    stockfish_path = args.stockfish or os.environ.get("PYTHON_ENGINE_STOCKFISH_PATH") or os.environ.get("STOCKFISH_PATH") or "stockfish"
    spec: dict[str, Any] = {"id": engine_id}

    runtime = _StrategyRuntime(spec, seed, stockfish_path)
    try:
        strategy = runtime.enter()
    except Exception as exc:
        _emit({"kind": "ready_error", "engineId": engine_id, "error": str(exc)})
        return 2

    _emit({"kind": "ready", "engineId": engine_id, "pid": os.getpid()})

    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            request_started = time.monotonic()
            request_id: str | None = None
            try:
                request = json.loads(line)
                request_id = str(request.get("requestId") or "")
                response = _handle_request(strategy, spec, request, request_started)
                _emit({"requestId": request_id, "ok": True, "response": response})
            except Exception as exc:
                _emit({"requestId": request_id or "", "ok": False, "error": str(exc)})
    finally:
        runtime.exit()
    return 0


def _handle_request(
    strategy: Any,
    spec: dict[str, Any],
    request: dict[str, Any],
    started: float,
) -> dict[str, Any]:
    """Protocol-only handler — engine consumes EngineTurnRequest.

    The redaction-tested boundary: nothing here reads canonical events,
    raw GameState, or any field outside the protocol. All engine inputs
    come from the parsed protocol request.

    Phase 3c (commit following 4cc0319) dropped the legacy events-mode
    handler after the TS payload stopped sending `events`.
    """
    req = request_from_json(request["engineTurnRequest"])

    if not req.legal_moves:
        raise RuntimeError("no legal moves available")
    view = build_perspective_view(req)

    deadline = _deadline_monotonic(started, request)
    if _deadline_expired(deadline):
        # No canonical board here; reconstruct a chess.Board view from
        # the protocol observation for the fallback move generator.
        guard_board = board_from_request(req)
        move = _deadline_guard_move(guard_board, view)
        return _move_response(spec, move, req, "deadline-guard")

    # Cold-start replay of the full transcript through the strategy.
    # Phase 3c v1 doesn't yet exploit per-session statefulness — every
    # request resets and replays. Phase 4 work: stateful session keyed
    # on req.session_id with delta-only updates between turns.
    replay_transcript_into_strategy(strategy, req)
    if _deadline_expired(deadline):
        guard_board = board_from_request(req)
        move = _deadline_guard_move(guard_board, view)
        return _move_response(spec, move, req, "deadline-guard")

    move = strategy.pick_move(view)
    if move not in view.own_legal_moves:
        raise RuntimeError(f"engine returned illegal move: {move.uci()}")
    decision_source = "random" if isinstance(strategy, RandomStrategy) else "tier1"
    return _move_response(spec, move, req, decision_source)


def _move_response(
    spec: dict[str, Any], move: chess.Move, req: Any, decision_source: str,
) -> dict[str, Any]:
    """Worker response shape matching apps/server PythonPoolResponse.

    Castling note: `to` is the king's destination (e1→g1), not the
    rook square. variants.ts:589 explicitly accepts both forms via
    alias generation, so this aligns with python-chess's default
    output without needing a special castling-rewrite pass.
    """
    promo_letter = None
    if move.promotion is not None:
        promo_letter = {
            chess.QUEEN: "queen", chess.ROOK: "rook",
            chess.BISHOP: "bishop", chess.KNIGHT: "knight",
        }[move.promotion]
    return {
        "roomId": req.game_id,
        "engine": _engine_metadata(spec),
        "decisionSource": decision_source,
        "move": {
            "from": chess.SQUARE_NAMES[move.from_square],
            "to": chess.SQUARE_NAMES[move.to_square],
            **({"promotion": promo_letter} if promo_letter else {}),
        },
    }


def _engine_metadata(spec: dict[str, Any]) -> dict[str, Any]:
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


class _StrategyRuntime:
    """Holds Tier-1's bot_runtime context manager open across requests."""

    def __init__(self, spec: dict[str, Any], seed: int, stockfish_path: str) -> None:
        self.spec = spec
        self.seed = seed
        self.stockfish_path = stockfish_path
        self._runtime: Any | None = None
        self._strategy: Any | None = None

    def enter(self) -> Any:
        engine_id = str(self.spec.get("id") or "")
        if engine_id in {"python-random-legal", "builtin-random-legal"}:
            self._strategy = RandomStrategy(seed=self.seed)
            return self._strategy
        tier1 = TIER1_LIVE_ENGINES.get(engine_id)
        if tier1 is None:
            raise RuntimeError(f"unsupported Python live engine: {engine_id}")
        config = load_config(ROOT / "configs" / "tier1-v1.json")
        if canonical_hash(config) != TIER1_CONFIG_HASH:
            raise RuntimeError("tier1-v1 config hash mismatch")
        if tier1.get("engineVersion"):
            config = replace(config, engine_version=tier1["engineVersion"])
        # else: leave config.engine_version=None → runtime loads live src/fow_chess
        self._runtime = bot_runtime(config, stockfish_path=self.stockfish_path)
        factory = self._runtime.__enter__()
        self._strategy = factory(self.seed)
        return self._strategy

    def exit(self) -> None:
        if self._runtime is not None:
            try:
                self._runtime.__exit__(None, None, None)
            except Exception:  # noqa: BLE001 — best-effort cleanup
                pass


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


def _parse_optional_int(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


def _emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, separators=(",", ":")), flush=True)


if __name__ == "__main__":
    raise SystemExit(main())
