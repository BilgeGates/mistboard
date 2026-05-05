"""Run a Tier-1 vs Random bake-off and report win rate plus latency.

Plays half the games with Tier-1 as White, half as Black. Stockfish runs
inside a single context-managed engine reused across all moves and games.

Usage:
    .venv/bin/python scripts/bake_off.py --games 20 --depth 4 --max-particles 16

P2 gate (engine roadmap): Tier-1 beats random ≥90% over 200 games, average
per-move time under 5 seconds, no crashes.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import chess

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from contextlib import nullcontext

from fow_chess.engine import EvaluatorBuilder, static_builder
from fow_chess.evaluator import (
    material_evaluator,
    stockfish_evaluator,
    threat_aware_evaluator,
    visibility_threat_evaluator,
)
from fow_chess.selfplay import PerspectiveView, play_game
from fow_chess.strategies import RandomStrategy, Tier1Strategy


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--games", type=int, default=20)
    parser.add_argument(
        "--evaluator",
        choices=("material", "threat", "visibility-threat", "stockfish"),
        default="material",
        help="Tier-1 evaluator. material: pure post-move material balance. "
        "threat: material minus particle-aggregated hanging-piece value "
        "(hallucinates threats from hypothesized particles). "
        "visibility-threat: material minus threats from visible opp pieces "
        "only — observed truth, no particle aggregation. stockfish: "
        "Stockfish via UCI (flaky on FOW positions where side-to-move is "
        "in check).",
    )
    parser.add_argument("--threat-lambda", type=float, default=0.3)
    parser.add_argument("--depth", type=int, default=4)
    parser.add_argument("--max-particles", type=int, default=16)
    parser.add_argument("--target-n", type=int, default=256)
    parser.add_argument(
        "--risk-aversion",
        type=float,
        default=0.0,
        help="Mean-vs-worst-case interpolation in [0, 1]. 0 = pure mean (default), "
        "1 = pure worst-case across particles. ~0.3-0.5 typically reduces "
        "Tier-1 walking into multi-particle traps.",
    )
    parser.add_argument("--max-plies", type=int, default=300)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--stockfish", default="stockfish")
    args = parser.parse_args()

    print(
        f"bake-off: {args.games} games, evaluator={args.evaluator}, "
        f"max_particles={args.max_particles}, target_n={args.target_n}, "
        f"risk_aversion={args.risk_aversion}"
    )

    tier1_wins = 0
    random_wins = 0
    draws_or_truncated = 0
    total_tier1_moves = 0
    total_tier1_seconds = 0.0
    total_plies = 0

    if args.evaluator == "stockfish":
        evaluator_ctx = stockfish_evaluator(path=args.stockfish, depth=args.depth)
        builder_factory = lambda evaluate: static_builder(evaluate)
    elif args.evaluator == "threat":
        evaluator_ctx = nullcontext(threat_aware_evaluator(args.threat_lambda))
        builder_factory = lambda evaluate: static_builder(evaluate)
    elif args.evaluator == "visibility-threat":
        # Builder closes over the per-move PerspectiveView; no static evaluator.
        evaluator_ctx = nullcontext(visibility_threat_evaluator(args.threat_lambda))
        builder_factory = lambda builder: builder
    else:
        evaluator_ctx = nullcontext(material_evaluator())
        builder_factory = lambda evaluate: static_builder(evaluate)

    with evaluator_ctx as evaluate_or_builder:
        evaluator_builder: EvaluatorBuilder = builder_factory(evaluate_or_builder)
        for i in range(args.games):
            tier1_white = i % 2 == 0  # alternate colors
            seed_base = args.seed + i * 7919

            tier1 = _LatencyTracking(
                Tier1Strategy(
                    evaluator_builder=evaluator_builder,
                    target_n=args.target_n,
                    max_eval_particles=args.max_particles,
                    risk_aversion=args.risk_aversion,
                    seed=seed_base,
                )
            )
            opp = RandomStrategy(seed=seed_base + 1)

            white = tier1 if tier1_white else opp
            black = opp if tier1_white else tier1

            t0 = time.time()
            result = play_game(
                white,
                black,
                max_plies=args.max_plies,
                room_id=f"bakeoff-{i:04d}",
                seed=seed_base,
            )
            wall = time.time() - t0

            tier1_color = "white" if tier1_white else "black"
            if result.winner == tier1_color:
                outcome = "W"
                tier1_wins += 1
            elif result.winner is None:
                outcome = "D"
                draws_or_truncated += 1
            else:
                outcome = "L"
                random_wins += 1

            total_tier1_moves += tier1.move_count
            total_tier1_seconds += tier1.total_seconds
            total_plies += result.plies
            avg_per_move = (
                tier1.total_seconds / tier1.move_count if tier1.move_count else 0.0
            )
            print(
                f"  game {i + 1}/{args.games} "
                f"tier1={tier1_color} "
                f"outcome={outcome} "
                f"plies={result.plies:3d} "
                f"end={result.end_reason} "
                f"tier1_moves={tier1.move_count:3d} "
                f"tier1_avg={avg_per_move:5.2f}s "
                f"wall={wall:6.1f}s"
            )

    print()
    print(f"games:                {args.games}")
    print(
        f"tier-1 record:        {tier1_wins}W {random_wins}L {draws_or_truncated}D"
    )
    win_rate = tier1_wins / args.games if args.games else 0.0
    print(f"tier-1 win rate:      {win_rate:.1%}")
    print(f"total tier-1 moves:   {total_tier1_moves}")
    if total_tier1_moves > 0:
        avg = total_tier1_seconds / total_tier1_moves
        print(f"avg per tier-1 move:  {avg:.2f}s (gate: <5.0s)")
    print(f"total plies:          {total_plies}")
    return 0


class _LatencyTracking:
    """Wraps a strategy and accumulates per-move wall-clock time."""

    def __init__(self, inner) -> None:
        self.inner = inner
        self.move_count = 0
        self.total_seconds = 0.0

    def reset(self, perspective: chess.Color) -> None:
        self.inner.reset(perspective)

    def observe_own_move(self, move: chess.Move) -> None:
        self.inner.observe_own_move(move)

    def observe_opp_move(self, observation) -> None:
        self.inner.observe_opp_move(observation)

    def pick_move(self, view):
        t0 = time.time()
        move = self.inner.pick_move(view)
        self.total_seconds += time.time() - t0
        self.move_count += 1
        return move


if __name__ == "__main__":
    raise SystemExit(main())
