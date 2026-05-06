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
import json
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
from fow_chess.move_quality import MoveQualityAnalyzer
from fow_chess.selfplay import PerspectiveView, play_game
from fow_chess.strategies import RandomStrategy, Tier1Strategy

import chess


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
    parser.add_argument(
        "--save-dir",
        type=Path,
        default=None,
        help="If set, save each game's events as JSONL plus a manifest.json "
        "into this directory. Compatible with inspect_belief.py and the "
        "corpus loader.",
    )
    parser.add_argument(
        "--analyze-vs-truth",
        action="store_true",
        help="P3.2: for every Tier-1 move, ask Stockfish on the canonical full-info "
        "board what move it would have picked. Records agreement per ply, writes "
        "CSV + summary. Roughly doubles wall time per Tier-1 move.",
    )
    parser.add_argument(
        "--analyze-vs-truth-depth",
        type=int,
        default=8,
        help="Stockfish depth for the move-quality analyzer.",
    )
    parser.add_argument(
        "--analyze-vs-truth-movetime-ms",
        type=int,
        default=200,
        help="Stockfish movetime for the move-quality analyzer (per-move cap).",
    )
    parser.add_argument(
        "--analyze-vs-truth-csv",
        type=Path,
        default=None,
        help="Output path for the move-quality CSV. Defaults to "
        "<save-dir>/move_quality.csv if --save-dir is set, else "
        "/tmp/move_quality.csv.",
    )
    parser.add_argument(
        "--save-only",
        choices=("all", "loss", "loss-or-draw"),
        default="loss-or-draw",
        help="Which games to save when --save-dir is set. Default: loss-or-draw "
        "(the games worth investigating).",
    )
    args = parser.parse_args()

    save_games_dir: Path | None = None
    save_manifest: list[dict] | None = None
    if args.save_dir is not None:
        save_games_dir = args.save_dir / "games"
        save_games_dir.mkdir(parents=True, exist_ok=True)
        save_manifest = []

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

    analyzer_ctx = (
        MoveQualityAnalyzer(
            depth=args.analyze_vs_truth_depth,
            movetime_ms=args.analyze_vs_truth_movetime_ms,
            stockfish_path=args.stockfish,
        )
        if args.analyze_vs_truth
        else nullcontext(None)
    )

    with evaluator_ctx as evaluate_or_builder, analyzer_ctx as analyzer:
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

            game_analyzer = None
            if analyzer is not None:
                analyzer.begin_game(i)
                tier1_chess_color = chess.WHITE if tier1_white else chess.BLACK

                def game_analyzer(
                    canonical_board, move_played, mover_color,
                    _color=tier1_chess_color, _a=analyzer,
                ):
                    if mover_color == _color:
                        _a.record_move(canonical_board, move_played, mover_color)

            t0 = time.time()
            result = play_game(
                white,
                black,
                max_plies=args.max_plies,
                room_id=f"bakeoff-{i:04d}",
                seed=seed_base,
                analyzer=game_analyzer,
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

            if save_games_dir is not None and save_manifest is not None:
                should_save = (
                    args.save_only == "all"
                    or (args.save_only == "loss" and outcome == "L")
                    or (args.save_only == "loss-or-draw" and outcome in ("L", "D"))
                )
                if should_save:
                    game_path = save_games_dir / f"game-{i:04d}-{outcome}-tier1-{tier1_color}.jsonl"
                    with game_path.open("w") as fh:
                        for event in result.events:
                            fh.write(json.dumps(event) + "\n")
                    save_manifest.append(
                        {
                            "index": i,
                            "tier1_color": tier1_color,
                            "outcome": outcome,
                            "plies": result.plies,
                            "end_reason": result.end_reason,
                            "truncated": result.truncated,
                            "tier1_seed": seed_base,
                            "random_seed": seed_base + 1,
                            "path": game_path.relative_to(args.save_dir).as_posix(),
                        }
                    )

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

        if analyzer is not None:
            csv_path = (
                args.analyze_vs_truth_csv
                if args.analyze_vs_truth_csv is not None
                else (
                    (args.save_dir / "move_quality.csv")
                    if args.save_dir is not None
                    else Path("/tmp/move_quality.csv")
                )
            )
            analyzer.write_csv(csv_path)
            mq = analyzer.summary()
            print()
            print("move-quality vs truth (Tier-1 plies only):")
            print(f"  moves recorded:        {mq['moves_recorded']}")
            print(f"  moves analyzed by SF:  {mq['moves_analyzed']} "
                  f"({mq['analyze_success_rate']:.1%})")
            print(f"  agreement w/ SF-truth: {mq['moves_agreed']} "
                  f"({mq['agreement_rate_over_analyzed']:.1%} of analyzed)")
            print(f"  csv:                   {csv_path}")

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

    if save_games_dir is not None and save_manifest is not None:
        manifest_path = args.save_dir / "manifest.json"
        with manifest_path.open("w") as fh:
            json.dump(
                {
                    "evaluator": args.evaluator,
                    "depth": args.depth,
                    "max_particles": args.max_particles,
                    "target_n": args.target_n,
                    "risk_aversion": args.risk_aversion,
                    "threat_lambda": args.threat_lambda,
                    "max_plies": args.max_plies,
                    "base_seed": args.seed,
                    "games_total": args.games,
                    "games_saved": len(save_manifest),
                    "save_only": args.save_only,
                    "tier1_record": {
                        "wins": tier1_wins,
                        "losses": random_wins,
                        "draws": draws_or_truncated,
                    },
                    "games": save_manifest,
                },
                fh,
                indent=2,
            )
        print(f"saved games:          {len(save_manifest)} → {args.save_dir}")
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
