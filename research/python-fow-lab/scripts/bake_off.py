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

from fow_chess.evaluator import material_evaluator, stockfish_evaluator
from fow_chess.selfplay import play_game
from fow_chess.strategies import RandomStrategy, Tier1Strategy


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--games", type=int, default=20)
    parser.add_argument(
        "--evaluator",
        choices=("material", "stockfish"),
        default="material",
        help="Tier-1 evaluator. Material is fast and reliable; stockfish is "
        "stronger but flaky on FOW positions where side-to-move is in check.",
    )
    parser.add_argument("--depth", type=int, default=4)
    parser.add_argument("--max-particles", type=int, default=16)
    parser.add_argument("--target-n", type=int, default=256)
    parser.add_argument("--max-plies", type=int, default=300)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--stockfish", default="stockfish")
    args = parser.parse_args()

    print(
        f"bake-off: {args.games} games, evaluator={args.evaluator}, "
        f"max_particles={args.max_particles}, target_n={args.target_n}"
    )

    tier1_wins = 0
    random_wins = 0
    draws_or_truncated = 0
    total_tier1_moves = 0
    total_tier1_seconds = 0.0
    total_plies = 0

    if args.evaluator == "stockfish":
        evaluator_ctx = stockfish_evaluator(path=args.stockfish, depth=args.depth)
    else:
        evaluator_ctx = nullcontext(material_evaluator())

    with evaluator_ctx as evaluate:
        for i in range(args.games):
            tier1_white = i % 2 == 0  # alternate colors
            seed_base = args.seed + i * 7919

            tier1 = _LatencyTracking(
                Tier1Strategy(
                    evaluator=evaluate,
                    target_n=args.target_n,
                    max_eval_particles=args.max_particles,
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

    def pick_move(self, own_legal_moves):
        t0 = time.time()
        move = self.inner.pick_move(own_legal_moves)
        self.total_seconds += time.time() - t0
        self.move_count += 1
        return move


if __name__ == "__main__":
    raise SystemExit(main())
