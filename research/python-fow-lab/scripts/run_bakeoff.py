"""Bake-off: challenger config vs baseline config, head-to-head, written to Postgres.

One row per game in lab_games (corpus_id=<bakeoff-id>). Each row's data captures
which side was the challenger, the winner, and challenger_score from
challenger's POV (1=win, 0.5=draw, 0=loss). The analyzer reduces over rows
and runs SPRT.

Designed to be sharded across N workers via --start-index, matching the
parallel pattern used by generate_production_corpus.py.

Color alternation is by game_index parity (game i: challenger=white iff
i % 2 == 0), so disjoint --start-index ranges that each cover an even count
preserve color balance per shard.

Usage (8 workers × 7 games for 56 total):
    for w in 0..7:
        python scripts/run_bakeoff.py \\
            --games 7 --start-index $((w*7)) \\
            --bakeoff-id b-learned-vs-uniform \\
            --challenger-prior learned \\
            --challenger-prior-weights lab/nets/policy/railway-v0/weights.pt \\
            --baseline-prior uniform \\
            --seed 12345
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
from fow_chess.move_priors import learned_policy_prior, uniform_prior
from fow_chess.selfplay import play_game
from fow_chess.strategies import Tier1Strategy


def _make_prior(name: str, weights: str | None):
    if name == "uniform":
        return uniform_prior, None
    if name == "learned":
        if not weights:
            raise ValueError("learned prior requires --*-prior-weights")
        return learned_policy_prior(weights, temperature=1.0), None
    raise ValueError(f"unsupported prior: {name}")


def _make_strategy(builder, prior, seed: int, capture_belief: bool = False) -> Tier1Strategy:
    return Tier1Strategy(
        evaluator_builder=builder,
        move_prior=prior,
        target_n=256,
        max_eval_particles=16,
        seed=seed,
        mcts_rollouts=0,
        verbose_belief_capture=capture_belief,
    )


def _challenger_score(winner: str | None, color_swap: bool) -> float:
    """color_swap=False → challenger plays white. =True → challenger plays black."""
    if winner is None:
        return 0.5
    if not color_swap:
        return 1.0 if winner == "white" else 0.0
    return 1.0 if winner == "black" else 0.0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--games", type=int, required=True)
    ap.add_argument("--start-index", type=int, required=True)
    ap.add_argument("--max-plies", type=int, default=200)
    ap.add_argument("--seed", type=int, default=12345)
    ap.add_argument("--bakeoff-id", type=str, required=True)
    ap.add_argument("--challenger-prior", choices=["uniform", "learned"], required=True)
    ap.add_argument("--challenger-prior-weights", type=str, default=None)
    ap.add_argument("--baseline-prior", choices=["uniform", "learned"], required=True)
    ap.add_argument("--baseline-prior-weights", type=str, default=None)
    ap.add_argument(
        "--belief-dump-dir", type=str, default=None,
        help="if set, both strategies run with verbose_belief_capture=True and the challenger's "
             "trace_log + belief_log are dumped to <dir>/{trace,belief}-g{idx}.jsonl"
    )
    args = ap.parse_args()

    from fow_chess.lab.postgres_store import LabCorpusStore

    builder = static_builder(fow_evaluator())
    challenger_prior, _ = _make_prior(args.challenger_prior, args.challenger_prior_weights)
    baseline_prior, _ = _make_prior(args.baseline_prior, args.baseline_prior_weights)

    start = args.start_index
    target = start + args.games

    print(
        f"bakeoff={args.bakeoff_id} start={start} target={target} "
        f"({args.games} games) seed={args.seed} "
        f"challenger={args.challenger_prior} baseline={args.baseline_prior}"
    )

    with LabCorpusStore(corpus_id=args.bakeoff_id) as store:
        wins = draws = losses = 0
        t0 = time.time()
        for i in range(start, target):
            color_swap = (i % 2) == 1
            seed_c = args.seed + i * 7919
            seed_b = args.seed + i * 7919 + 1

            cap = args.belief_dump_dir is not None
            chall_strat = _make_strategy(builder, challenger_prior, seed_c, capture_belief=cap)
            base_strat = _make_strategy(builder, baseline_prior, seed_b, capture_belief=cap)

            if not color_swap:
                white, black = chall_strat, base_strat
            else:
                white, black = base_strat, chall_strat

            t_g = time.time()
            result = play_game(
                white, black,
                max_plies=args.max_plies,
                room_id=f"{args.bakeoff_id}-g{i:04d}-{'b' if color_swap else 'a'}white",
                seed=seed_c,
            )
            wall = time.time() - t_g

            cs = _challenger_score(result.winner, color_swap)
            if cs == 1.0:
                wins += 1
            elif cs == 0.5:
                draws += 1
            else:
                losses += 1

            data: dict[str, Any] = {
                "schema_version": 1,
                "kind": "bakeoff",
                "game": i,
                "game_id": f"{args.bakeoff_id}-g{i:04d}-{'b' if color_swap else 'a'}white",
                "color_swap": color_swap,
                "challenger": args.challenger_prior,
                "baseline": args.baseline_prior,
                "winner": result.winner,
                "end_reason": result.end_reason,
                "plies": result.plies,
                "challenger_score": cs,
                "seed_challenger": seed_c,
                "seed_baseline": seed_b,
                "wall_seconds": round(wall, 2),
                "events": result.events,
            }
            store.insert_game(corpus_idx=i, game_id=data["game_id"], data=data)

            if args.belief_dump_dir is not None:
                from pathlib import Path as _P
                ddir = _P(args.belief_dump_dir)
                ddir.mkdir(parents=True, exist_ok=True)
                chall_side = "black" if color_swap else "white"
                tag = {"game_index": i, "tier1_side": chall_side, "tier1_seat": chall_side}
                with (ddir / f"trace-g{i:04d}.jsonl").open("w") as ft:
                    for row in chall_strat.trace_log:
                        ft.write(json.dumps({**tag, **row}) + "\n")
                with (ddir / f"belief-g{i:04d}.jsonl").open("w") as fb:
                    for row in chall_strat.belief_log:
                        fb.write(json.dumps({**tag, **row}) + "\n")
            print(
                f"  g{i:04d} {'chall=B' if color_swap else 'chall=W'} "
                f"winner={result.winner or 'none':<5} plies={result.plies:>3} "
                f"cs={cs} wall={wall:>5.1f}s"
            )

        wall_total = time.time() - t0
        print(
            f"\nshard done: {wins}W {draws}D {losses}L = "
            f"{wins + 0.5 * draws}/{args.games} for challenger "
            f"in {wall_total:.0f}s (total rows in {args.bakeoff_id}: {store.count()})"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
