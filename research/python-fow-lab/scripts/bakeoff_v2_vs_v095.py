"""v2 (EngineV2) vs v0.9.5 (Tier-1) bakeoff using the existing play_game harness.

Single-game smoke (default) — prints result and key stats. Pass
``--games N`` to run a multi-game sweep with alternating colors.

The v0.9.5 baseline is constructed from ``configs/tier1-v1.json`` via
``bot_runtime`` — same path the production EvE runner uses for
``python-tier1-v0.7.0``. v2 is constructed via ``EngineV2Strategy``.

Usage:
    PYTHONPATH=src .venv/bin/python scripts/bakeoff_v2_vs_v095.py
    PYTHONPATH=src .venv/bin/python scripts/bakeoff_v2_vs_v095.py --games 4 --max-plies 60
    PYTHONPATH=src .venv/bin/python scripts/bakeoff_v2_vs_v095.py --v2-iters 100 --v2-i 8
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

import chess

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from fow_chess.engine_v2 import EngineV2Strategy
from fow_chess.selfplay import play_game
from fow_chess.tournament.config import load_config
from fow_chess.tournament.runtime import bot_runtime


_TIER1_CONFIG = ROOT / "configs" / "tier1-v1.json"


def _make_v095(seed: int, stockfish_path: str):
    """Construct a Tier-1 v0.9.5 strategy via bot_runtime — matches the
    production EvE runner's python-tier1-v0.7.0 path."""
    config = load_config(_TIER1_CONFIG)
    runtime_cm = bot_runtime(config, stockfish_path=stockfish_path)
    factory = runtime_cm.__enter__()
    strategy = factory(seed)
    return strategy, runtime_cm


def _color_label(c: chess.Color) -> str:
    return "white" if c == chess.WHITE else "black"


def _play_one(
    *,
    game_id: int,
    v2_color: chess.Color,
    v2_iters: int,
    v2_i_sample: int,
    v2_time_budget: float | None,
    v2_p_max: int | None,
    max_plies: int,
    seed: int,
    stockfish_path: str,
) -> dict:
    v2 = EngineV2Strategy(
        seed=seed + 7,
        iterations=v2_iters,
        i_sample_size=v2_i_sample,
        time_budget_seconds=v2_time_budget,
        p_max_size=v2_p_max,
    )
    v095, v095_runtime = _make_v095(seed=seed, stockfish_path=stockfish_path)
    try:
        white_strategy = v2 if v2_color == chess.WHITE else v095
        black_strategy = v095 if v2_color == chess.WHITE else v2

        t0 = time.monotonic()
        result = play_game(
            white_strategy,
            black_strategy,
            max_plies=max_plies,
            room_id=f"bakeoff-{game_id}",
            seed=seed,
        )
        wall = time.monotonic() - t0

        if result.winner is None:
            outcome = "draw"
        elif result.winner == _color_label(v2_color):
            outcome = "v2_win"
        else:
            outcome = "v095_win"

        return {
            "game_id": game_id,
            "v2_color": _color_label(v2_color),
            "outcome": outcome,
            "winner": result.winner,
            "end_reason": result.end_reason,
            "plies": result.plies,
            "truncated": result.truncated,
            "wall_seconds": wall,
        }
    finally:
        try:
            v2.close()
        finally:
            v095_runtime.__exit__(None, None, None)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--games", type=int, default=1)
    parser.add_argument("--max-plies", type=int, default=160)
    parser.add_argument("--v2-iters", type=int, default=100)
    parser.add_argument("--v2-i", type=int, default=8,
                        help="|I| sample size from P per v2 move")
    parser.add_argument("--v2-time-budget", type=float, default=None,
                        help="optional per-move wall budget (seconds) for v2")
    parser.add_argument("--v2-p-max", type=int, default=10_000,
                        help="cap on PEnumerator |P| (0 = unbounded)")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--stockfish", default="stockfish")
    args = parser.parse_args()

    if shutil.which(args.stockfish) is None:
        print(f"ERROR: stockfish binary not found ({args.stockfish!r})", file=sys.stderr)
        return 2

    p_max = args.v2_p_max if args.v2_p_max > 0 else None

    print(
        f"Bakeoff: v2 (iters={args.v2_iters} |I|={args.v2_i} "
        f"time={args.v2_time_budget or 'unl'} p_max={p_max}) "
        f"vs v0.9.5 — {args.games} games",
        flush=True,
    )

    results: list[dict] = []
    t_start = time.monotonic()
    for game_id in range(args.games):
        v2_color = chess.WHITE if game_id % 2 == 0 else chess.BLACK
        try:
            res = _play_one(
                game_id=game_id,
                v2_color=v2_color,
                v2_iters=args.v2_iters,
                v2_i_sample=args.v2_i,
                v2_time_budget=args.v2_time_budget,
                v2_p_max=p_max,
                max_plies=args.max_plies,
                seed=args.seed + game_id,
                stockfish_path=args.stockfish,
            )
        except Exception as e:
            res = {
                "game_id": game_id,
                "v2_color": _color_label(v2_color),
                "error": f"{type(e).__name__}: {e}",
            }
        results.append(res)
        if "error" in res:
            print(f"  [game {game_id}] ERROR {res['error']}", flush=True)
        else:
            print(
                f"  [game {game_id}] v2={res['v2_color']:5s} "
                f"{res['outcome']:9s} {res['end_reason']:18s} "
                f"plies={res['plies']:3d}  wall={res['wall_seconds']:6.1f}s",
                flush=True,
            )
    total_wall = time.monotonic() - t_start

    valid = [r for r in results if "error" not in r]
    v2_wins = sum(1 for r in valid if r["outcome"] == "v2_win")
    v095_wins = sum(1 for r in valid if r["outcome"] == "v095_win")
    draws = sum(1 for r in valid if r["outcome"] == "draw")
    print()
    print("=== Summary ===")
    print(json.dumps({
        "games_run": len(results),
        "games_valid": len(valid),
        "errors": len(results) - len(valid),
        "v2_wins": v2_wins,
        "v095_wins": v095_wins,
        "draws": draws,
        "v2_win_rate": (v2_wins / len(valid)) if valid else 0.0,
        "total_wall_seconds": total_wall,
    }, indent=2))
    return 0 if results else 1


if __name__ == "__main__":
    raise SystemExit(main())
