"""Local risk_aversion bake-off: challenger ra=X vs baseline ra=0.0.

Both engines use full v0.9.5 production knobs (capture_risk, anti_shuffle,
push_when_ahead, info_reveal, ...) — only risk_aversion differs. The hypothesis
under test: bumping risk_aversion catches "aggregation-dilution" blunders
(annotation tag) where a known-tail-risk move passes mean aggregation.

Sharded by --start-index for parallel runs (8-worker pattern matches the
existing local_bakeoff_stopgap.py). Color-swapped by parity of game index so
each engine plays both sides.

Usage (8 workers × 8 games each → 64 games per pair):
    for w in 0..7:
        python scripts/local_bakeoff_risk_aversion.py \\
            --challenger-ra 0.5 --games 8 --start-index $((w*8)) \\
            --out /tmp/ra-0.5-vs-0.0 --seed 20260520
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.engine import static_builder
from fow_chess.evaluator import fow_evaluator
from fow_chess.move_priors import uniform_prior
from fow_chess.selfplay import play_game
from fow_chess.strategies import Tier1Strategy


def _make_strategy(builder, seed: int, risk_aversion: float, post_eval: bool = True) -> Tier1Strategy:
    """Tier1Strategy with v0.9.5 production defaults; risk_aversion and post-eval layer parameterized."""
    if post_eval:
        return Tier1Strategy(
            evaluator_builder=builder,
            move_prior=uniform_prior,
            target_n=256,
            max_eval_particles=16,
            risk_aversion=risk_aversion,
            seed=seed,
            mcts_rollouts=0,
            # v0.9.5 production knobs:
            capture_risk_penalty_coef=10.0,
            anti_shuffle_penalty=20.0,
            anti_shuffle_window=4,
            queen_fog_risk_threshold=0.20,
            piece_fog_risk_threshold=0.25,
            push_when_ahead_bonus=200.0,
            push_when_ahead_min_edge=3.0,
            info_reveal_bonus_coef=25.0,
            anti_shuffle_penalty_strong=250.0,
        )
    # Post-eval OFF: only the four post-score-adjustment knobs zeroed. Vetoes
    # and tier short-circuits remain (those are part of the strategy core).
    return Tier1Strategy(
        evaluator_builder=builder,
        move_prior=uniform_prior,
        target_n=256,
        max_eval_particles=16,
        risk_aversion=risk_aversion,
        seed=seed,
        mcts_rollouts=0,
        capture_risk_penalty_coef=0.0,
        anti_shuffle_penalty=0.0,
        anti_shuffle_window=4,
        queen_fog_risk_threshold=0.20,
        piece_fog_risk_threshold=0.25,
        push_when_ahead_bonus=0.0,
        push_when_ahead_min_edge=3.0,
        info_reveal_bonus_coef=0.0,
        anti_shuffle_penalty_strong=0.0,
    )


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--challenger-ra", type=float, required=True,
                    help="risk_aversion for the challenger engine.")
    ap.add_argument("--baseline-ra", type=float, default=0.0,
                    help="risk_aversion for the baseline (default 0.0 = production).")
    ap.add_argument("--challenger-no-post-eval", action="store_true",
                    help="Disable post-eval adjustments (capture_risk, anti_shuffle, push_when_ahead, info_reveal) on challenger.")
    ap.add_argument("--baseline-no-post-eval", action="store_true",
                    help="Disable post-eval adjustments on baseline (default OFF = production behavior).")
    ap.add_argument("--games", type=int, required=True)
    ap.add_argument("--start-index", type=int, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--max-plies", type=int, default=200)
    ap.add_argument("--seed", type=int, default=20260520)
    args = ap.parse_args()

    if args.challenger_ra == args.baseline_ra:
        print("WARN: challenger-ra == baseline-ra; bake-off will be self-vs-self")

    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    results_path = out / f"results-w{args.start_index:04d}.jsonl"

    builder = static_builder(fow_evaluator())

    start = args.start_index
    target = start + args.games
    print(f"shard start={start} target={target} games={args.games} "
          f"challenger_ra={args.challenger_ra} baseline_ra={args.baseline_ra} "
          f"seed={args.seed}")

    with results_path.open("w") as f:
        wins = draws = losses = 0
        t0 = time.time()
        for i in range(start, target):
            color_swap = (i % 2) == 1  # i even: challenger=white; i odd: challenger=black
            seed_c = args.seed + i * 7919
            seed_b = args.seed + i * 7919 + 1
            challenger_strat = _make_strategy(builder, seed_c, args.challenger_ra, post_eval=not args.challenger_no_post_eval)
            baseline_strat = _make_strategy(builder, seed_b, args.baseline_ra, post_eval=not args.baseline_no_post_eval)
            if not color_swap:
                white, black = challenger_strat, baseline_strat
            else:
                white, black = baseline_strat, challenger_strat

            t_g = time.time()
            result = play_game(
                white, black,
                max_plies=args.max_plies,
                room_id=f"ra{args.challenger_ra:.1f}-vs-ra{args.baseline_ra:.1f}-g{i:04d}",
                seed=seed_c,
            )
            wall = time.time() - t_g

            # challenger_score from CHALLENGER's POV
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
                "challenger_ra": args.challenger_ra,
                "baseline_ra": args.baseline_ra,
                "winner": result.winner,
                "end_reason": result.end_reason,
                "plies": result.plies,
                "challenger_score": cs,
                "wall_seconds": round(wall, 2),
            }
            f.write(json.dumps(row) + "\n")
            f.flush()
            print(
                f"  g{i:04d} challenger={'B' if color_swap else 'W'} "
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
