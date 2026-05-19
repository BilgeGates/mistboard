"""Local 32-game bake-off: production v0.9.3 + stopgap vs production v0.9.3.

Both sides use uniform_prior to isolate the stopgap effect from any prior
effect. Stopgap variant: capture_risk_penalty_coef=10, anti_shuffle_penalty=20,
veto thresholds at production defaults. Production variant: coef=0,
anti_shuffle=0 (recovers v0.9.3 exactly).

Designed to be sharded across N workers via --start-index (same pattern as
generate_production_corpus / run_bakeoff). Writes one row per game to
<out>/results.jsonl.

Usage (4 workers × 8 games):
    for w in 0..3:
        python scripts/local_bakeoff_stopgap.py \\
            --games 8 --start-index $((w*8)) \\
            --out /tmp/stopgap-bakeoff --seed 20260519
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import chess

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.engine import static_builder
from fow_chess.evaluator import fow_evaluator
from fow_chess.move_priors import uniform_prior
from fow_chess.selfplay import play_game
from fow_chess.strategies import Tier1Strategy


def _make_strategy(builder, seed: int, stopgap: bool):
    if stopgap:
        return Tier1Strategy(
            evaluator_builder=builder, move_prior=uniform_prior,
            target_n=256, max_eval_particles=16, seed=seed,
            mcts_rollouts=0,
            # Calibrated stopgap values
            capture_risk_penalty_coef=10.0,
            anti_shuffle_penalty=20.0,
            anti_shuffle_window=4,
            queen_fog_risk_threshold=0.20,
            piece_fog_risk_threshold=0.25,
        )
    # Production v0.9.3 (no stopgap)
    return Tier1Strategy(
        evaluator_builder=builder, move_prior=uniform_prior,
        target_n=256, max_eval_particles=16, seed=seed,
        mcts_rollouts=0,
        capture_risk_penalty_coef=0.0,
        anti_shuffle_penalty=0.0,
        queen_fog_risk_threshold=0.20,
        piece_fog_risk_threshold=0.25,
    )


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--games", type=int, required=True)
    ap.add_argument("--start-index", type=int, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--max-plies", type=int, default=200)
    ap.add_argument("--seed", type=int, default=20260519)
    args = ap.parse_args()

    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    results_path = out / f"results-w{args.start_index:04d}.jsonl"

    builder = static_builder(fow_evaluator())

    start = args.start_index
    target = start + args.games
    print(f"shard start={start} target={target} games={args.games} seed={args.seed}")

    with results_path.open("w") as f:
        wins = draws = losses = 0
        t0 = time.time()
        for i in range(start, target):
            color_swap = (i % 2) == 1  # i even: stopgap=white; i odd: stopgap=black
            seed_s = args.seed + i * 7919
            seed_p = args.seed + i * 7919 + 1
            stopgap_strat = _make_strategy(builder, seed_s, stopgap=True)
            prod_strat = _make_strategy(builder, seed_p, stopgap=False)
            if not color_swap:
                white, black = stopgap_strat, prod_strat
            else:
                white, black = prod_strat, stopgap_strat

            t_g = time.time()
            result = play_game(
                white, black,
                max_plies=args.max_plies,
                room_id=f"stopgap-vs-prod-g{i:04d}",
                seed=seed_s,
            )
            wall = time.time() - t_g

            # challenger_score from STOPGAP's POV
            if result.winner is None:
                cs = 0.5
                draws += 1
            elif (result.winner == "white" and not color_swap) or (result.winner == "black" and color_swap):
                cs = 1.0  # stopgap won
                wins += 1
            else:
                cs = 0.0
                losses += 1

            row = {
                "game": i,
                "color_swap": color_swap,
                "stopgap_color": "black" if color_swap else "white",
                "winner": result.winner,
                "end_reason": result.end_reason,
                "plies": result.plies,
                "challenger_score": cs,
                "wall_seconds": round(wall, 2),
            }
            f.write(json.dumps(row) + "\n")
            f.flush()
            print(
                f"  g{i:04d} stopgap={'B' if color_swap else 'W'} "
                f"winner={result.winner or 'none':<5} plies={result.plies:>3} "
                f"cs={cs} wall={wall:>5.1f}s"
            )

        wall_total = time.time() - t0
        print(
            f"shard done: {wins}W {draws}D {losses}L = "
            f"{wins + 0.5 * draws}/{args.games} in {wall_total:.0f}s → {results_path}"
        )


if __name__ == "__main__":
    main()
