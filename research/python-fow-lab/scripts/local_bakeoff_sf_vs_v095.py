"""Local bake-off: v1.0 candidate (PIMC depth=2 + SF-labeled value-net leaf) vs v0.9.5 (fow_evaluator leaf, no PIMC).

Both sides use uniform_prior + v0.9.5 stopgap defaults (capture-risk,
anti-shuffle, push-when-ahead). Only difference: challenger uses the
SF-trained value net as the leaf evaluator inside depth-2 PIMC search.

If the SF-leaf-in-PIMC engine is +50+ Elo over v0.9.5, ship as v1.0.

Usage (4 workers × 4 games for 16 total):
    for w in 0..3:
        python scripts/local_bakeoff_sf_vs_v095.py --games 4 --start-index $((w*4)) \\
            --out /tmp/sf-vs-v095 --seed 20260523
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import chess

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.engine import static_builder
from fow_chess.evaluator import fow_evaluator, value_net_evaluator
from fow_chess.move_priors import uniform_prior
from fow_chess.selfplay import play_game
from fow_chess.strategies import Tier1Strategy


SF_NET = str(_LAB_ROOT / "lab/nets/value/railway-v1-sf/weights.npz")


def _make_challenger(seed: int):
    """v1.0 candidate: PIMC depth=2 with SF-labeled value-net leaf."""
    return Tier1Strategy(
        evaluator_builder=static_builder(value_net_evaluator(SF_NET)),
        move_prior=uniform_prior,
        target_n=256, max_eval_particles=8, seed=seed,
        mcts_rollouts=0,
        pimc_search_depth=2,
    )


def _make_baseline(seed: int):
    """v0.9.5: fow_evaluator leaf, best_action (depth-1)."""
    return Tier1Strategy(
        evaluator_builder=static_builder(fow_evaluator()),
        move_prior=uniform_prior,
        target_n=256, max_eval_particles=8, seed=seed,
        mcts_rollouts=0,
        pimc_search_depth=0,
    )


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--games", type=int, required=True)
    ap.add_argument("--start-index", type=int, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--max-plies", type=int, default=200)
    ap.add_argument("--seed", type=int, default=20260523)
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    results_path = args.out / f"results-w{args.start_index:04d}.jsonl"

    start = args.start_index
    target = start + args.games
    print(f"shard start={start} target={target}")

    with results_path.open("w") as f:
        wins = draws = losses = 0
        t0 = time.time()
        for i in range(start, target):
            color_swap = (i % 2) == 1
            seed_c = args.seed + i * 7919
            seed_b = args.seed + i * 7919 + 1
            chall = _make_challenger(seed_c)
            base = _make_baseline(seed_b)
            if not color_swap:
                white, black = chall, base
            else:
                white, black = base, chall

            t_g = time.time()
            result = play_game(
                white, black,
                max_plies=args.max_plies,
                room_id=f"sf-vs-v095-g{i:04d}",
                seed=seed_c,
            )
            wall = time.time() - t_g

            if result.winner is None:
                cs = 0.5
                draws += 1
            elif (result.winner == "white" and not color_swap) or (result.winner == "black" and color_swap):
                cs = 1.0
                wins += 1
            else:
                cs = 0.0
                losses += 1

            row = {
                "game": i,
                "color_swap": color_swap,
                "challenger_color": "black" if color_swap else "white",
                "winner": result.winner,
                "end_reason": result.end_reason,
                "plies": result.plies,
                "challenger_score": cs,
                "wall_seconds": round(wall, 2),
            }
            f.write(json.dumps(row) + "\n")
            f.flush()
            print(
                f"  g{i:04d} chall={'B' if color_swap else 'W'} "
                f"winner={result.winner or 'none':<5} plies={result.plies:>3} "
                f"cs={cs} wall={wall:>5.1f}s"
            )

        wall_total = time.time() - t0
        print(f"shard done: {wins}W {draws}D {losses}L = {wins + 0.5*draws}/{args.games} in {wall_total:.0f}s")


if __name__ == "__main__":
    main()
