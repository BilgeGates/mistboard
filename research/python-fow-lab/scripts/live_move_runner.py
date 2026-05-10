"""Pick one live PvE move for the TypeScript server.

Protocol:
  stdin: JSON request
  stdout: JSON response

The server owns HTTP, rooms, legality validation, and fallback. This runner owns
the Python strategy runtime and reconstructs strategy state from the room event
log before asking the selected engine for one move.
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

from fow_chess.event_log import iter_steps, replay_canonical
from fow_chess.observation import observation_from_transition
from fow_chess.selfplay import PerspectiveView
from fow_chess.strategies import RandomStrategy
from fow_chess.tournament.config import canonical_hash, load_config
from fow_chess.tournament.runtime import bot_runtime
from fow_chess.visibility import visible_piece_map, visible_squares

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
}


def main() -> int:
    started = time.monotonic()
    request = json.load(sys.stdin)
    room_id = str(request["roomId"])
    engine_spec = request["engine"]
    perspective = _parse_color(request["color"])
    seed = int(request.get("seed", 1))
    events = request["events"]
    stockfish_path = str(request.get("stockfishPath") or "stockfish")
    _debug(
        "request-loaded",
        started,
        roomId=room_id,
        engineId=str(engine_spec.get("id") or ""),
        color=request["color"],
        eventCount=len(events),
        seed=seed,
        clockRemainingMs=request.get("clockRemainingMs"),
        incrementMs=request.get("incrementMs"),
    )

    boards = list(replay_canonical(events))
    if not boards:
        raise RuntimeError("event log produced no boards")
    board = boards[-1]
    if board.turn != perspective:
        raise RuntimeError("requested engine color is not to move")
    _debug(
        "canonical-replayed",
        started,
        boardCount=len(boards),
        boardPly=board.ply(),
        legalCount=len(list(board.pseudo_legal_moves)),
    )
    own_legals = list(board.pseudo_legal_moves)
    if not own_legals:
        raise RuntimeError("no legal moves available")
    view = PerspectiveView(
        perspective=perspective,
        own_legal_moves=own_legals,
        visible_squares=visible_squares(board, perspective),
        visible_piece_map=visible_piece_map(board, perspective),
        clock_remaining_ms=_parse_optional_int(request.get("clockRemainingMs")),
        increment_ms=_parse_optional_int(request.get("incrementMs")) or 0,
    )
    deadline = _deadline_monotonic(started, request)
    if _deadline_expired(deadline):
        move = _deadline_guard_move(board, view)
        _debug("deadline-guard", started, phaseBefore="runtime-ready", move=move.uci())
        _print_response(room_id, engine_spec, move, board, "deadline-guard")
        return 0

    with strategy_runtime(engine_spec, seed, stockfish_path) as strategy:
        _debug("runtime-ready", started)
        strategy.reset(perspective)
        _debug("strategy-reset", started)
        observed_steps = 0
        for step in iter_steps(events, perspective):
            observed_steps += 1
            if step.own_move is not None:
                strategy.observe_own_move(
                    step.own_move,
                    observation_from_transition(
                        step.canonical_before,
                        step.canonical_after,
                        perspective,
                    ),
                )
            elif step.opp_observation is not None:
                strategy.observe_opp_move(step.opp_observation)
            if _deadline_expired(deadline):
                move = _deadline_guard_move(board, view)
                _debug(
                    "deadline-guard",
                    started,
                    phaseBefore="events-observed",
                    observedStepCount=observed_steps,
                    move=move.uci(),
                )
                _print_response(room_id, engine_spec, move, board, "deadline-guard")
                return 0
        _debug("events-observed", started, observedStepCount=observed_steps)
        if _deadline_expired(deadline):
            move = _deadline_guard_move(board, view)
            _debug(
                "deadline-guard",
                started,
                phaseBefore="pick-started",
                observedStepCount=observed_steps,
                move=move.uci(),
            )
            _print_response(room_id, engine_spec, move, board, "deadline-guard")
            return 0
        _debug(
            "pick-started",
            started,
            ownLegalCount=len(own_legals),
            visibleSquareCount=len(view.visible_squares),
            visiblePieceCount=len(view.visible_piece_map),
        )
        move = strategy.pick_move(view)
        _debug("pick-finished", started, move=move.uci())
        if move not in own_legals:
            raise RuntimeError(f"engine returned illegal move: {move.uci()}")

    _print_response(room_id, engine_spec, move, board, "tier1")
    return 0


def _print_response(
    room_id: str,
    engine_spec: dict[str, Any],
    move: chess.Move,
    board: chess.Board,
    decision_source: str,
) -> None:
    print(json.dumps({
        "roomId": room_id,
        "engine": engine_metadata(engine_spec),
        "decisionSource": decision_source,
        "move": _move_to_event(move, board),
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


def _parse_color(value: Any) -> chess.Color:
    if value == "white":
        return chess.WHITE
    if value == "black":
        return chess.BLACK
    raise RuntimeError(f"unsupported color: {value!r}")


def _parse_optional_int(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


def _move_to_event(move: chess.Move, prev: chess.Board) -> dict[str, Any]:
    out: dict[str, Any] = {
        "from": chess.square_name(move.from_square),
        "to": chess.square_name(move.to_square),
    }

    if prev.is_castling(move):
        is_kingside = chess.square_file(move.to_square) > chess.square_file(move.from_square)
        rank = chess.square_rank(move.from_square)
        rook_file = 7 if is_kingside else 0
        out["to"] = chess.square_name(chess.square(rook_file, rank))

    if move.promotion is not None:
        out["promotion"] = {
            chess.QUEEN: "queen",
            chess.ROOK: "rook",
            chess.BISHOP: "bishop",
            chess.KNIGHT: "knight",
        }[move.promotion]

    return out


if __name__ == "__main__":
    raise SystemExit(main())
