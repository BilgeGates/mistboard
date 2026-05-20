"""Diagnostic: run full Tier1Strategy.pick_move at an annotated blunder ply.

Where diag_annotated_blunder.py calls best_action directly, this script
replays the actual production pipeline (vetoes, defensive tiers, evaluator,
post-eval adjustments) and reports which decision_path returned + chosen move
+ top-K scores.

Tests two configs at the same position:
  - Production v0.9.5 (baseline)
  - Caller-specified variant (--variant)

The variant flag toggles common candidate fixes:
  - ra0.5         → risk_aversion=0.5, post-eval ON  (same as bake-off 1)
  - ra0.5-nopost  → risk_aversion=0.5, post-eval OFF (same as bake-off 2)
  - nopost        → risk_aversion=0.0, post-eval OFF

Usage:
    .venv/bin/python3 scripts/diag_strategy_at_ply.py \\
        --events /path/to/game.jsonl \\
        --perspective black --ply 26 --played b6a5 --variant ra0.5
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

import chess

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.engine import static_builder
from fow_chess.evaluator import fow_evaluator
from fow_chess.event_log import iter_steps
from fow_chess.move_priors import uniform_prior
from fow_chess.observation import observation_from_transition
from fow_chess.selfplay import PerspectiveView
from fow_chess.strategies import Tier1Strategy
from fow_chess.visibility import visible_piece_map, visible_squares


def _make_strategy(
    seed: int,
    *,
    risk_aversion: float = 0.0,
    capture_risk: float = 10.0,
    anti_shuffle: float = 20.0,
    anti_shuffle_strong: float = 250.0,
    push_when_ahead: float = 200.0,
    info_reveal: float = 25.0,
) -> Tier1Strategy:
    """Tier1Strategy with v0.9.5 production defaults; every post-eval bonus individually toggleable."""
    return Tier1Strategy(
        evaluator_builder=static_builder(fow_evaluator()),
        move_prior=uniform_prior,
        target_n=256,
        max_eval_particles=16,
        risk_aversion=risk_aversion,
        seed=seed,
        mcts_rollouts=0,
        capture_risk_penalty_coef=capture_risk,
        anti_shuffle_penalty=anti_shuffle,
        anti_shuffle_window=4,
        queen_fog_risk_threshold=0.20,
        piece_fog_risk_threshold=0.25,
        push_when_ahead_bonus=push_when_ahead,
        push_when_ahead_min_edge=3.0,
        info_reveal_bonus_coef=info_reveal,
        anti_shuffle_penalty_strong=anti_shuffle_strong,
    )


def _build_perspective_view(board: chess.Board, perspective: chess.Color) -> PerspectiveView:
    work = board.copy()
    work.turn = perspective
    own_legal = list(work.pseudo_legal_moves)
    vs = visible_squares(board, perspective)
    vpm = visible_piece_map(board, perspective)
    return PerspectiveView(
        perspective=perspective,
        own_legal_moves=own_legal,
        visible_squares=vs,
        visible_piece_map=vpm,
    )


def _replay_to_ply(strategy: Tier1Strategy, events: list, perspective: chess.Color, target_ply: int):
    """Replay events through (ply-1) on strategy. Returns canonical_before of target ply."""
    strategy.reset(perspective)
    canonical_before_target = None
    for step in iter_steps(events, perspective):
        if step.ply >= target_ply:
            canonical_before_target = step.canonical_before
            break
        if step.own_move is not None:
            obs = observation_from_transition(step.canonical_before, step.canonical_after, perspective)
            strategy.observe_own_move(step.own_move, obs)
        else:
            strategy.observe_opp_move(step.opp_observation)
    return canonical_before_target


def _config_kwargs(label: str) -> tuple[dict, str]:
    """Return (kwargs_for_make_strategy, human_readable_description)."""
    if label == "baseline":
        return ({}, "ra=0.0 + all post-eval ON (v0.9.5 prod)")
    if label == "ra0.5":
        return ({"risk_aversion": 0.5}, "ra=0.5 + all post-eval ON")
    if label == "nopost":
        return (
            {"capture_risk": 0.0, "anti_shuffle": 0.0, "anti_shuffle_strong": 0.0,
             "push_when_ahead": 0.0, "info_reveal": 0.0},
            "ra=0.0 + all post-eval OFF",
        )
    if label == "no-push":
        return ({"push_when_ahead": 0.0}, "ra=0.0 + push_when_ahead disabled (others ON)")
    if label == "no-info-reveal":
        return ({"info_reveal": 0.0}, "ra=0.0 + info_reveal disabled (others ON)")
    if label == "no-anti-shuffle":
        return (
            {"anti_shuffle": 0.0, "anti_shuffle_strong": 0.0},
            "ra=0.0 + anti_shuffle disabled (others ON)",
        )
    if label == "no-capture-risk":
        return ({"capture_risk": 0.0}, "ra=0.0 + capture_risk disabled (others ON)")
    if label == "ir5":
        return ({"info_reveal": 5.0}, "info_reveal_coef=5 (others ON)")
    if label == "ir10":
        return ({"info_reveal": 10.0}, "info_reveal_coef=10 (others ON)")
    if label == "ir15":
        return ({"info_reveal": 15.0}, "info_reveal_coef=15 (others ON)")
    if label == "ir20":
        return ({"info_reveal": 20.0}, "info_reveal_coef=20 (others ON)")
    raise SystemExit(f"unknown variant: {label}")


def _run_one(events: list, perspective: chess.Color, ply: int, config_label: str, seed: int):
    kwargs, human = _config_kwargs(config_label)
    strategy = _make_strategy(seed, **kwargs)
    canonical_before = _replay_to_ply(strategy, events, perspective, ply)
    if canonical_before is None:
        raise SystemExit(f"ply {ply} not found")
    view = _build_perspective_view(canonical_before, perspective)
    chosen = strategy.pick_move(view)
    trace = strategy.trace_log[-1] if strategy.trace_log else {}
    return {
        "config": human,
        "chosen": chosen.uci(),
        "decision_path": trace.get("decision_path"),
        "particle_count_pre": trace.get("particle_count_pre_sample"),
        "top_k": trace.get("top_k_scores"),
        "n_particles": len(strategy._belief.particles) if strategy._belief else 0,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--events", type=Path, required=True)
    ap.add_argument("--perspective", choices=("white", "black"), required=True)
    ap.add_argument("--ply", type=int, required=True)
    ap.add_argument("--played", required=True, help="UCI of move the original game played at --ply (the blunder).")
    ap.add_argument(
        "--variants",
        nargs="+",
        default=["baseline", "no-push", "no-info-reveal", "no-anti-shuffle", "no-capture-risk", "nopost"],
        help="Variant labels (subset of: baseline, ra0.5, nopost, no-push, no-info-reveal, no-anti-shuffle, no-capture-risk).",
    )
    ap.add_argument("--seed", type=int, default=2026)
    args = ap.parse_args()

    perspective = chess.WHITE if args.perspective == "white" else chess.BLACK
    events = [json.loads(line) for line in args.events.open() if line.strip()]

    print("=" * 78)
    print(f"FULL-STRATEGY DIAGNOSTIC: {args.events.name}  ply={args.ply}  perspective={args.perspective}")
    print(f"original game's move at ply {args.ply}: {args.played}  (the annotated blunder)")
    print("=" * 78)
    print()

    results = []
    for v in args.variants:
        r = _run_one(events, perspective, args.ply, v, args.seed)
        results.append(r)
        match = " ← MATCHES BLUNDER" if r["chosen"] == args.played else ""
        print(f"[{v}]  {r['config']}")
        print(f"  chosen:         {r['chosen']}{match}")
        print(f"  decision_path:  {r['decision_path']}")
        print(f"  belief n:       {r['n_particles']}")
        if r["top_k"]:
            print(f"  top-K scores:")
            for entry in r["top_k"]:
                if isinstance(entry, (list, tuple)) and len(entry) >= 2:
                    mv, sc = entry[0], entry[1]
                    mark = " ← played" if mv == args.played else ""
                    print(f"      {mv:<8} {sc:+10.2f}{mark}")
        print()

    # Summary
    print("-" * 78)
    blunder_count = sum(1 for r in results if r["chosen"] == args.played)
    print(f"Configs that picked the blunder ({args.played}): {blunder_count}/{len(results)}")
    distinct_paths = set(r["decision_path"] for r in results)
    print(f"Distinct decision_paths: {distinct_paths}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
