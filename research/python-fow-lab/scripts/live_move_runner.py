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
from pathlib import Path
from typing import Any

ROOT = Path(os.environ.get("PYTHON_ENGINE_LAB_ROOT", Path(__file__).resolve().parents[1])).resolve()
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

import chess

from fow_chess.event_log import iter_steps, replay_canonical
from fow_chess.observation import observation_from_transition
from fow_chess.selfplay import PerspectiveView
from fow_chess.strategies import RandomStrategy, TIER1_VERSION
from fow_chess.tournament.config import canonical_hash, load_config
from fow_chess.tournament.runtime import bot_runtime
from fow_chess.visibility import visible_piece_map, visible_squares


def main() -> int:
    request = json.load(sys.stdin)
    room_id = str(request["roomId"])
    engine_spec = request["engine"]
    perspective = _parse_color(request["color"])
    seed = int(request.get("seed", 1))
    events = request["events"]
    stockfish_path = str(request.get("stockfishPath") or "stockfish")

    boards = list(replay_canonical(events))
    if not boards:
        raise RuntimeError("event log produced no boards")
    board = boards[-1]
    if board.turn != perspective:
        raise RuntimeError("requested engine color is not to move")

    with strategy_runtime(engine_spec, seed, stockfish_path) as strategy:
        strategy.reset(perspective)
        for step in iter_steps(events, perspective):
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
        move = strategy.pick_move(view)
        if move not in own_legals:
            raise RuntimeError(f"engine returned illegal move: {move.uci()}")

    print(json.dumps({
        "roomId": room_id,
        "engine": engine_metadata(engine_spec),
        "move": _move_to_event(move, board),
    }, separators=(",", ":")))
    return 0


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
        if engine_id == "python-tier1-v0.7.22":
            config = load_config(ROOT / "configs" / "tier1-v1.json")
            if TIER1_VERSION != "0.7.22":
                raise RuntimeError(f"python-tier1-v0.7.22 resolved Tier-1 {TIER1_VERSION}")
            if canonical_hash(config) != "b22f29dd73f5":
                raise RuntimeError("tier1-v1 config hash mismatch")
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
    if engine_id == "python-tier1-v0.7.22":
        return {
            "id": engine_id,
            "tier1Version": TIER1_VERSION,
            "configHash": "b22f29dd73f5",
            "playSignature": "5d3ddffa74f6",
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
