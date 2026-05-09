"""Run one owner-only Python EvE game for the TypeScript worker.

Protocol:
  stdin: JSON request
  stdout: JSON response

This is deliberately a small subprocess boundary. The TS worker owns queueing
and persistence; the Python lab owns Tier-1 state, observations, Stockfish
processes, and game execution.
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

from fow_chess.selfplay import OpeningPolicy, TimeControlSpec, play_game
from fow_chess.strategies import RandomStrategy, TIER1_VERSION
from fow_chess.tournament.config import canonical_hash, load_config
from fow_chess.tournament.runtime import bot_runtime


def main() -> int:
    request = json.load(sys.stdin)
    room_id = str(request["roomId"])
    seed = int(request.get("seed", 1))
    max_plies = int(request.get("maxPlies", 160))
    stockfish_path = str(request.get("stockfishPath") or "stockfish")
    time_control = parse_time_control(request.get("timeControl"))
    opening_policy = parse_opening_policy(request.get("openingPolicy"))

    white_spec = request["white"]
    black_spec = request["black"]

    with strategy_runtime(white_spec, seed, stockfish_path) as white, strategy_runtime(
        black_spec,
        seed + 1,
        stockfish_path,
    ) as black:
        result = play_game(
            white,
            black,
            max_plies=max_plies,
            room_id=room_id,
            seed=seed,
            time_control=time_control,
            opening_policy=opening_policy,
        )

    print(json.dumps({
        "roomId": room_id,
        "plies": result.plies,
        "winner": result.winner,
        "endReason": result.end_reason,
        "truncated": result.truncated,
        "events": result.events,
        "engines": {
            "white": engine_metadata(white_spec),
            "black": engine_metadata(black_spec),
        },
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
        if engine_id == "python-tier1-v0.7.0":
            config = load_config(ROOT / "configs" / "tier1-v1.json")
            if TIER1_VERSION != "0.7.0":
                raise RuntimeError(f"python-tier1-v0.7.0 resolved Tier-1 {TIER1_VERSION}")
            if canonical_hash(config) != "b22f29dd73f5":
                raise RuntimeError("tier1-v1 config hash mismatch")
            self._runtime = bot_runtime(config, stockfish_path=self.stockfish_path)
            factory = self._runtime.__enter__()
            self._strategy = factory(self.seed)
            return self._strategy
        raise RuntimeError(f"unsupported Python EvE engine: {engine_id}")

    def __exit__(self, exc_type, exc, tb):
        if self._runtime is not None:
            return self._runtime.__exit__(exc_type, exc, tb)
        return False


def parse_time_control(raw: Any) -> TimeControlSpec | None:
    if not isinstance(raw, dict) or raw.get("kind") == "none":
        return None
    if raw.get("kind") == "standard":
        return TimeControlSpec(
            initial_seconds=float(raw.get("initial_seconds", raw.get("initialSeconds", 10))),
            increment_seconds=float(raw.get("increment_seconds", raw.get("incrementSeconds", 0))),
        )
    return None


def parse_opening_policy(raw: Any) -> OpeningPolicy | None:
    if not isinstance(raw, dict):
        return None
    if raw.get("kind") == "random_first_n_plies":
        return OpeningPolicy.random_first_n_plies(int(raw.get("n", 0)))
    return None


def engine_metadata(spec: dict[str, Any]) -> dict[str, Any]:
    engine_id = str(spec.get("id") or "")
    if engine_id == "python-tier1-v0.7.0":
        return {
            "id": engine_id,
            "tier1Version": TIER1_VERSION,
            "configHash": "b22f29dd73f5",
        }
    if engine_id == "python-tier1-v0.7.22":
        return {
            "id": engine_id,
            "tier1Version": TIER1_VERSION,
            "configHash": "b22f29dd73f5",
            "playSignature": "5d3ddffa74f6",
        }
    return {"id": engine_id}


if __name__ == "__main__":
    raise SystemExit(main())
