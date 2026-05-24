"""Run v2-vs-v0.9.5 game(s) and publish to the apps/web 3-pane viewer.

Writes a bakeoff-manifest directory under apps/web/public/ that matches
the format the existing replay.ts bakeoff viewer expects. After running,
print the URL the user opens in their browser (against the running web
dev server, typically on port 5173).

Naming convention from the existing bakeoff viewer ("tier1" labels the
v0.9.5 baseline; v2 is the opponent):
  games/game-NNNN-{W|L|D}-tier1-{white|black}.jsonl

  W = tier1 (v0.9.5) won
  L = tier1 (v0.9.5) lost (i.e. v2 won)
  D = draw

Usage:
    PYTHONPATH=src .venv/bin/python scripts/bakeoff_publish_to_viewer.py
    PYTHONPATH=src .venv/bin/python scripts/bakeoff_publish_to_viewer.py \\
        --games 4 --max-plies 160 --v2-iters 100 --tag v2-vs-v095-smoke
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
REPO_ROOT = ROOT.parents[1]  # research/python-fow-lab → mistboard
PUBLIC_DIR = REPO_ROOT / "apps" / "web" / "public"

SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from fow_chess.engine_v2 import EngineV2Strategy
from fow_chess.selfplay import play_game
from fow_chess.tournament.config import load_config
from fow_chess.tournament.runtime import bot_runtime


_TIER1_CONFIG = ROOT / "configs" / "tier1-v1.json"


def _make_v095(seed: int, stockfish_path: str):
    config = load_config(_TIER1_CONFIG)
    runtime_cm = bot_runtime(config, stockfish_path=stockfish_path)
    factory = runtime_cm.__enter__()
    strategy = factory(seed)
    return strategy, runtime_cm


def _outcome_letter(result_winner: str | None, subject_color: chess.Color) -> str:
    """W = subject (v2) won, L = subject lost (v0.9.5 won), D = draw.

    The existing bakeoff viewer puts `tier1_color` on the left and uses
    it as the reviewer's "subject of interest." For our v2-vs-v0.9.5
    comparison, v2 is the subject under review, so we map subject→tier1
    in the manifest. W/L/D labels are subject-centric (v2-centric)."""
    if result_winner is None:
        return "D"
    subject_label = "white" if subject_color == chess.WHITE else "black"
    return "W" if result_winner == subject_label else "L"


def _color_label(c: chess.Color) -> str:
    return "white" if c == chess.WHITE else "black"


def _events_to_jsonl(events: list, room_id: str, variant: str) -> str:
    """Render events list as JSONL string matching the bakeoff viewer's
    expected schema (room-created + move-played).

    play_game emits room-created with its internal variant string (still
    "fog-of-war" inside the Python lab). The TS viewer post-rename
    expects "dark-chess". We rewrite the variant field on any
    room-created event so the published JSONL matches the viewer's
    current vocabulary.
    """
    lines: list[str] = []
    has_room_created = False
    for event in events:
        if event.get("type") == "room-created":
            event = {**event, "variant": variant}
            has_room_created = True
        lines.append(json.dumps(event, separators=(",", ":")))
    if not has_room_created:
        # Inject a fresh room-created at the head.
        head = json.dumps(
            {
                "type": "room-created",
                "at": 0,
                "roomId": room_id,
                "variant": variant,
                "offer": [],
            },
            separators=(",", ":"),
        )
        lines.insert(0, head)
    return "\n".join(lines) + "\n"


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
        white_s = v2 if v2_color == chess.WHITE else v095
        black_s = v095 if v2_color == chess.WHITE else v2

        room_id = f"bakeoff-{game_id:04d}"
        t0 = time.monotonic()
        result = play_game(
            white_s, black_s,
            max_plies=max_plies,
            room_id=room_id,
            seed=seed,
        )
        wall = time.monotonic() - t0

        # Subject under review = v2. The existing bakeoff viewer features
        # `tier1_color` on the left pane, so we set tier1_color = v2_color
        # (treating v2 as "the engine of interest in this comparison").
        outcome_letter = _outcome_letter(result.winner, v2_color)
        return {
            "game_id": game_id,
            "v2_color": _color_label(v2_color),
            "subject_color": _color_label(v2_color),  # = v2_color for v2-centric review
            "outcome_letter": outcome_letter,
            "winner": result.winner,
            "end_reason": result.end_reason,
            "plies": result.plies,
            "truncated": result.truncated,
            "wall_seconds": wall,
            "room_id": room_id,
            "events": list(result.events),
            "seed": seed,
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
    parser.add_argument("--v2-i", type=int, default=8)
    parser.add_argument("--v2-time-budget", type=float, default=None)
    parser.add_argument("--v2-p-max", type=int, default=10_000)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--stockfish", default="stockfish")
    parser.add_argument(
        "--tag",
        default="v2-vs-v095-smoke",
        help="bakeoff dir name (apps/web/public/bakeoff-<tag>/)",
    )
    parser.add_argument(
        "--variant", default="dark-chess",
        help="variant label in the room-created event",
    )
    args = parser.parse_args()

    if shutil.which(args.stockfish) is None:
        print(f"ERROR: stockfish binary not found ({args.stockfish!r})", file=sys.stderr)
        return 2

    p_max = args.v2_p_max if args.v2_p_max > 0 else None

    bakeoff_dir = PUBLIC_DIR / f"bakeoff-{args.tag}"
    games_dir = bakeoff_dir / "games"
    games_dir.mkdir(parents=True, exist_ok=True)
    print(f"Output dir: {bakeoff_dir}")
    print(
        f"Running {args.games} game(s): v2 (iters={args.v2_iters} |I|={args.v2_i} "
        f"p_max={p_max}) vs v0.9.5, max_plies={args.max_plies}",
        flush=True,
    )

    results: list[dict] = []
    games_for_manifest: list[dict] = []
    t_start = time.monotonic()
    record = {"wins": 0, "losses": 0, "draws": 0}  # tier1 (v0.9.5) record

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
            print(f"  [game {game_id}] ERROR {res['error']}", flush=True)
            continue

        # Write JSONL — subject-centric (v2-centric) labeling.
        outcome = res["outcome_letter"]
        if outcome == "W":
            record["wins"] += 1
        elif outcome == "L":
            record["losses"] += 1
        else:
            record["draws"] += 1
        game_filename = f"game-{game_id:04d}-{outcome}-tier1-{res['subject_color']}.jsonl"
        game_path = games_dir / game_filename
        game_path.write_text(_events_to_jsonl(res["events"], res["room_id"], args.variant))
        games_for_manifest.append({
            "index": game_id,
            "tier1_color": res["subject_color"],  # subject (v2) features on left
            "outcome": outcome,
            "plies": res["plies"],
            "end_reason": res["end_reason"],
            "truncated": res["truncated"],
            "tier1_seed": res["seed"] + 7,        # subject (v2) seed
            "random_seed": res["seed"],            # opponent (v0.9.5) seed
            "path": f"games/{game_filename}",
        })
        results.append(res)
        print(
            f"  [game {game_id}] v2={res['v2_color']:5s} outcome={outcome} "
            f"({res['end_reason']:18s}) plies={res['plies']:3d}  "
            f"wall={res['wall_seconds']:6.1f}s",
            flush=True,
        )

    total_wall = time.monotonic() - t_start

    # Write manifest matching the existing bakeoff viewer schema.
    # Subject under review = v2; opponent = v0.9.5.
    manifest = {
        "tier1_version": "engine-v2 (A1+A2+A3+A5.1+A6.1)",
        "tier1_commit": "current-src-fow-chess",
        "opponent": "v0.9.5-equivalent",
        "evaluator": "stockfish",
        "depth": -1,  # GT-CFR adaptive
        "max_particles": p_max if p_max is not None else 0,
        "target_n": args.v2_i,
        "risk_aversion": 0.0,
        "verbose_belief": False,
        "threat_lambda": 0.0,
        "max_plies": args.max_plies,
        "base_seed": args.seed,
        "games_total": args.games,
        "games_saved": len(games_for_manifest),
        "save_only": "all",
        "tier1_record": record,
        "games": games_for_manifest,
        "total_wall_seconds": total_wall,
        "v2_iters": args.v2_iters,
        "v2_i_sample": args.v2_i,
        "v2_time_budget": args.v2_time_budget,
    }
    (bakeoff_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    print()
    print("=== Wrote bakeoff dir ===")
    print(f"  {bakeoff_dir}")
    print(f"  tier1 record (v0.9.5): {record}")
    print()
    print("Open in browser (against a running dev server on :5173):")
    print(f"  http://localhost:5173/?bakeoff=/bakeoff-{args.tag}/manifest.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
