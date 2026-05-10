#!/usr/bin/env python3
"""Generate a Tier-1 vs Tier-1 corpus for the mistboard landing-page demo.

Plays N games of Tier-1 vs Tier-1 with distinct seeds. Captures per-move
engine compute time (`compute_ms`) and inlines it into each `move-played`
event so the web replay can pace by real engine timings.

Output format matches scripts/generate-fow-corpus.mjs (events JSONL +
manifest.json), so the apps/web replay viewer can consume curated games
directly.

Usage:
    .venv/bin/python scripts/generate_tier1_corpus.py \\
        --games 30 --out corpora/tier1-self-v1
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
from fow_chess.evaluator import material_evaluator
from fow_chess.move_priors import uniform_prior
from fow_chess.selfplay import play_game
from fow_chess.strategies import Tier1Strategy


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--games", type=int, default=30)
    parser.add_argument("--max-plies", type=int, default=300)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--max-particles", type=int, default=16)
    parser.add_argument("--target-n", type=int, default=256)
    parser.add_argument(
        "--out",
        type=Path,
        required=True,
        help="Corpus output directory (relative to lab root or absolute).",
    )
    args = parser.parse_args()

    out = args.out if args.out.is_absolute() else (_LAB_ROOT / args.out)
    out = out.resolve()
    games_dir = out / "games"
    games_dir.mkdir(parents=True, exist_ok=True)

    evaluator_builder = static_builder(material_evaluator())
    move_prior = uniform_prior

    manifest_entries: list[dict] = []
    totals = {
        "ended_by_king_capture": 0,
        "truncated": 0,
        "white_wins": 0,
        "black_wins": 0,
        "draws": 0,
        "has_promotion": 0,
        "has_castling": 0,
    }

    print(
        f"generating {args.games} Tier-1 vs Tier-1 games → "
        f"{out.relative_to(_LAB_ROOT.parent) if out.is_relative_to(_LAB_ROOT.parent) else out}"
    )

    for i in range(args.games):
        seed_white = args.seed + i * 7919
        seed_black = args.seed + i * 7919 + 1

        white_strat = _TimingWrapper(
            Tier1Strategy(
                evaluator_builder=evaluator_builder,
                move_prior=move_prior,
                target_n=args.target_n,
                max_eval_particles=args.max_particles,
                seed=seed_white,
            )
        )
        black_strat = _TimingWrapper(
            Tier1Strategy(
                evaluator_builder=evaluator_builder,
                move_prior=move_prior,
                target_n=args.target_n,
                max_eval_particles=args.max_particles,
                seed=seed_black,
            )
        )

        room_id = f"corpus-tier1-{i:04d}"
        t0 = time.time()
        result = play_game(
            white_strat,
            black_strat,
            max_plies=args.max_plies,
            room_id=room_id,
            seed=seed_white,
        )
        wall = time.time() - t0

        # Inline per-move compute_ms onto each move-played event.
        white_times = list(white_strat.times)
        black_times = list(black_strat.times)
        wi = 0
        bi = 0
        for evt in result.events:
            if evt.get("type") == "move-played":
                if evt["color"] == "white" and wi < len(white_times):
                    evt["compute_ms"] = round(white_times[wi] * 1000)
                    wi += 1
                elif evt["color"] == "black" and bi < len(black_times):
                    evt["compute_ms"] = round(black_times[bi] * 1000)
                    bi += 1

        ended_by_king_capture = result.end_reason == "king-captured"
        if ended_by_king_capture:
            totals["ended_by_king_capture"] += 1
        if result.truncated:
            totals["truncated"] += 1
        if result.winner == "white":
            totals["white_wins"] += 1
        elif result.winner == "black":
            totals["black_wins"] += 1
        else:
            totals["draws"] += 1

        has_capture = False
        has_promotion = False
        has_castling = False
        for evt in result.events:
            if evt.get("type") != "move-played":
                continue
            move = evt.get("move", {})
            if "promotion" in move:
                has_promotion = True
            # Castling under mistboard representation: king-takes-friendly-rook.
            # Detect by file delta of 4 (a-rook from e-king) or 3 (h-rook from e-king)
            # — either way > 1 file shift on a king's initial rank. Cheap heuristic;
            # corpus generator just records the flag, doesn't act on it.
            if abs(ord(move.get("to", "a1")[0]) - ord(move.get("from", "a1")[0])) >= 2:
                # king moves of >=2 files are typically castling in standard chess
                pass
        if has_promotion:
            totals["has_promotion"] += 1
        if has_castling:
            totals["has_castling"] += 1

        path = games_dir / f"game-{i:06d}.jsonl"
        with path.open("w") as fh:
            for evt in result.events:
                fh.write(json.dumps(evt) + "\n")

        avg_ms_white = (
            sum(white_times) / len(white_times) * 1000 if white_times else 0.0
        )
        avg_ms_black = (
            sum(black_times) / len(black_times) * 1000 if black_times else 0.0
        )
        winner_label = result.winner if result.winner else "draw"
        print(
            f"  game {i + 1:3d}/{args.games}  "
            f"plies={result.plies:3d}  "
            f"winner={winner_label:<5s}  "
            f"end={result.end_reason:<14s}  "
            f"avg_ms_w={avg_ms_white:6.0f}  "
            f"avg_ms_b={avg_ms_black:6.0f}  "
            f"wall={wall:5.1f}s"
        )

        manifest_entries.append(
            {
                "path": f"games/game-{i:06d}.jsonl",
                "seed_white": seed_white,
                "seed_black": seed_black,
                "plies": result.plies,
                "winner": result.winner,
                "end_reason": result.end_reason,
                "ended_by_king_capture": ended_by_king_capture,
                "truncated": result.truncated,
                "has_promotion": has_promotion,
                "has_castling": has_castling,
                "avg_compute_ms_white": round(avg_ms_white),
                "avg_compute_ms_black": round(avg_ms_black),
            }
        )

    manifest = {
        "generator": "tier1-self-v1",
        "variant": "fog-of-war",
        "evaluator": "material",
        "max_particles": args.max_particles,
        "target_n": args.target_n,
        "max_plies": args.max_plies,
        "base_seed": args.seed,
        "game_count": args.games,
        "totals": totals,
        "games": manifest_entries,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    print()
    print(f"wrote {args.games} games to {out}")
    print(f"  king-cap ends:  {totals['ended_by_king_capture']}/{args.games}")
    print(f"  truncated:      {totals['truncated']}/{args.games}")
    print(f"  white wins:     {totals['white_wins']}")
    print(f"  black wins:     {totals['black_wins']}")
    print(f"  draws:          {totals['draws']}")
    return 0


class _TimingWrapper:
    """Wraps a Strategy and records seconds spent in each pick_move call."""

    def __init__(self, inner) -> None:
        self.inner = inner
        self.times: list[float] = []

    def reset(self, perspective: chess.Color) -> None:
        self.inner.reset(perspective)

    def observe_own_move(self, move: chess.Move, observation) -> None:
        self.inner.observe_own_move(move, observation)

    def observe_opp_move(self, observation) -> None:
        self.inner.observe_opp_move(observation)

    def pick_move(self, view):
        t0 = time.time()
        move = self.inner.pick_move(view)
        self.times.append(time.time() - t0)
        return move


if __name__ == "__main__":
    raise SystemExit(main())
