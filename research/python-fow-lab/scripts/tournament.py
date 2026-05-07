"""Tournament harness CLI.

Subcommands:
  run    <spec.json>            Run all pairs in the spec sequentially.
                                Idempotent: re-running picks up where
                                results.jsonl left off.
  status <tournament_dir>       Print leaderboard from results.jsonl.

Tournament spec (JSON):
  {
    "tournament_id": "2026-05-tournament-1",
    "anchor_config_path": "configs/tier1-v1.json",
    "anchor_name": "tier1-v1",
    "output_dir": "tournaments/2026-05-tournament-1",
    "max_plies": 300,
    "stockfish_path": "stockfish",
    "pairs": [
      { "pair_id": "anchor-vs-fog-l01",
        "bot_a_config": "configs/tier1-v1.json",
        "bot_b_config": "configs/tier1-fog-l01.json",
        "games": 200 },
      ...
    ]
  }
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.selfplay import OpeningPolicy
from fow_chess.tournament import (
    BotConfig,
    PairSpec,
    TimeControl,
    canonical_hash,
    load_config,
    run_pair,
    sprt_pair,
)
from fow_chess.tournament.elo import compute_ladder, render_ladder_markdown


def _resolve(base: Path, p: str) -> Path:
    pp = Path(p)
    if pp.is_absolute():
        return pp
    return (base / pp).resolve()


def cmd_run(args: argparse.Namespace) -> int:
    spec_path = Path(args.spec).resolve()
    with spec_path.open("r", encoding="utf-8") as fh:
        spec = json.load(fh)
    # Config paths in the spec are always resolved relative to the lab root —
    # that's where `configs/` lives. output_dir is resolved relative to the
    # spec file's directory (so a spec in tournaments/<id>/spec.json with
    # output_dir="." writes results next to the spec).
    config_root = _LAB_ROOT
    output_dir = _resolve(spec_path.parent, spec.get("output_dir", "."))
    output_dir.mkdir(parents=True, exist_ok=True)

    # Snapshot the spec into the output dir if not already present.
    snapshot = output_dir / "spec.json"
    if not snapshot.exists():
        with snapshot.open("w", encoding="utf-8") as fh:
            json.dump(spec, fh, indent=2)
            fh.write("\n")

    stockfish_path = spec.get("stockfish_path", "stockfish")
    max_plies = int(spec.get("max_plies", 300))
    tc_raw = spec.get("time_control")
    time_control = (
        TimeControl(
            initial_seconds=float(tc_raw["initial_seconds"]),
            increment_seconds=float(tc_raw["increment_seconds"]),
        )
        if tc_raw is not None
        else None
    )
    op_raw = spec.get("opening_policy")
    opening_policy = (
        OpeningPolicy(kind=op_raw["kind"], n=int(op_raw.get("n", 0)))
        if op_raw is not None
        else None
    )

    # Load all configs up front so any lock-mismatch fails before any games.
    config_cache: dict[str, BotConfig] = {}
    for pair in spec["pairs"]:
        for key in ("bot_a_config", "bot_b_config"):
            cp = pair[key]
            if cp not in config_cache:
                config_cache[cp] = load_config(_resolve(config_root,cp))

    print(f"tournament_id: {spec.get('tournament_id', '<unset>')}")
    print(f"output_dir:    {output_dir}")
    print(f"pairs:         {len(spec['pairs'])}")
    for pair in spec["pairs"]:
        a = config_cache[pair["bot_a_config"]]
        b = config_cache[pair["bot_b_config"]]
        print(
            f"  - {pair['pair_id']}: {a.name} ({canonical_hash(a)}) "
            f"vs {b.name} ({canonical_hash(b)}) × {pair['games']}"
        )
    print()

    cap = args.games_per_pair
    for pair in spec["pairs"]:
        a = config_cache[pair["bot_a_config"]]
        b = config_cache[pair["bot_b_config"]]
        games = int(pair["games"])
        if cap is not None:
            games = min(games, cap)
        ps = PairSpec(
            pair_id=pair["pair_id"],
            bot_a=a,
            bot_b=b,
            games=games,
            tournament_id=spec.get("tournament_id", ""),
            max_plies=max_plies,
            seed_base=spec.get("tournament_id", "") + "/" + pair["pair_id"],
            time_control=time_control,
            opening_policy=opening_policy,
        )
        run_pair(ps, output_dir, stockfish_path=stockfish_path)
        print()

    # Emit a final leaderboard.
    anchor_path = spec.get("anchor_config_path")
    if anchor_path:
        anchor_cfg = load_config(_resolve(config_root,anchor_path))
        ladder = compute_ladder(
            [output_dir / "results.jsonl"],
            anchor_hash=canonical_hash(anchor_cfg),
            anchor_name=anchor_cfg.name,
        )
        print("=" * 72)
        print("LADDER")
        print()
        print(render_ladder_markdown(ladder))
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    output_dir = Path(args.tournament_dir).resolve()
    spec_path = output_dir / "spec.json"
    if not spec_path.exists():
        print(f"no spec.json at {output_dir}", file=sys.stderr)
        return 1
    with spec_path.open("r", encoding="utf-8") as fh:
        spec = json.load(fh)
    config_root = _LAB_ROOT
    anchor_path = spec.get("anchor_config_path")
    if not anchor_path:
        print("spec.json missing anchor_config_path", file=sys.stderr)
        return 1
    anchor_cfg = load_config(_resolve(config_root,anchor_path))
    ladder = compute_ladder(
        [output_dir / "results.jsonl"],
        anchor_hash=canonical_hash(anchor_cfg),
        anchor_name=anchor_cfg.name,
    )
    print(render_ladder_markdown(ladder))
    return 0


def cmd_sprt(args: argparse.Namespace) -> int:
    spec_path = Path(args.spec).resolve()
    with spec_path.open("r", encoding="utf-8") as fh:
        spec = json.load(fh)
    config_root = _LAB_ROOT
    output_dir = _resolve(spec_path.parent, spec.get("output_dir", "."))
    output_dir.mkdir(parents=True, exist_ok=True)

    snapshot = output_dir / "spec.json"
    if not snapshot.exists():
        with snapshot.open("w", encoding="utf-8") as fh:
            json.dump(spec, fh, indent=2)
            fh.write("\n")

    stockfish_path = spec.get("stockfish_path", "stockfish")
    max_plies = int(spec.get("max_plies", 300))
    tc_raw = spec.get("time_control")
    time_control = (
        TimeControl(
            initial_seconds=float(tc_raw["initial_seconds"]),
            increment_seconds=float(tc_raw["increment_seconds"]),
        )
        if tc_raw is not None
        else None
    )
    op_raw = spec.get("opening_policy")
    opening_policy = (
        OpeningPolicy(kind=op_raw["kind"], n=int(op_raw.get("n", 0)))
        if op_raw is not None
        else None
    )

    config_cache: dict[str, BotConfig] = {}
    for pair in spec["pairs"]:
        for key in ("bot_a_config", "bot_b_config"):
            cp = pair[key]
            if cp not in config_cache:
                config_cache[cp] = load_config(_resolve(config_root, cp))

    print(f"tournament_id: {spec.get('tournament_id', '<unset>')}")
    print(f"output_dir:    {output_dir}")
    print(f"SPRT pairs:    {len(spec['pairs'])}")
    print(f"  elo bounds: [{args.elo0:+.1f}, {args.elo1:+.1f}]")
    print(f"  alpha={args.alpha}, beta={args.beta}, max_games={args.max_games}")
    print()

    reports = []
    for pair in spec["pairs"]:
        a = config_cache[pair["bot_a_config"]]
        b = config_cache[pair["bot_b_config"]]
        ps = PairSpec(
            pair_id=pair["pair_id"],
            bot_a=a,
            bot_b=b,
            games=args.max_games,  # SPRT uses max_games as the cap
            tournament_id=spec.get("tournament_id", ""),
            max_plies=max_plies,
            seed_base=spec.get("tournament_id", "") + "/" + pair["pair_id"],
            time_control=time_control,
            opening_policy=opening_policy,
        )
        # Per-pair SPRT bounds override CLI defaults. Format in spec:
        #   "sprt_bounds": [elo0, elo1]
        per_pair_bounds = pair.get("sprt_bounds")
        if per_pair_bounds is not None:
            elo0_local, elo1_local = float(per_pair_bounds[0]), float(per_pair_bounds[1])
        else:
            elo0_local, elo1_local = args.elo0, args.elo1
        report = sprt_pair(
            ps,
            output_dir,
            elo0=elo0_local,
            elo1=elo1_local,
            alpha=args.alpha,
            beta=args.beta,
            max_games=args.max_games,
            stockfish_path=stockfish_path,
        )
        reports.append((pair["pair_id"], a.name, b.name, report))
        print()

    print("=" * 72)
    print("SPRT SUMMARY")
    print()
    print("| Pair | Reference | Challenger | Verdict | n | Score | Elo (emp) | LLR |")
    print("|---|---|---|---|---:|---:|---:|---:|")
    for pair_id, a_name, b_name, r in reports:
        elo_str = f"{r['empirical_elo']:+.1f}" if r['empirical_elo'] is not None else "—"
        print(
            f"| {pair_id} | `{a_name}` | `{b_name}` | **{r['verdict']}** | "
            f"{r['games_played']} | {r['empirical_score']:.3f} | {elo_str} | "
            f"{r['llr']:+.3f} |"
        )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_run = sub.add_parser("run", help="run a tournament from a spec file")
    p_run.add_argument("spec", help="path to tournament spec JSON")
    p_run.add_argument(
        "--games-per-pair",
        type=int,
        default=None,
        help="Cap each pair's game count at this many. Default: spec value. "
        "Use to run a pilot subset; re-running without the cap resumes "
        "from where the pilot stopped (same tournament_id, same results.jsonl).",
    )
    p_run.set_defaults(func=cmd_run)

    p_status = sub.add_parser("status", help="print leaderboard for a tournament dir")
    p_status.add_argument("tournament_dir")
    p_status.set_defaults(func=cmd_status)

    p_sprt = sub.add_parser(
        "sprt",
        help="run SPRT (sequential probability ratio test) on each pair in a spec",
    )
    p_sprt.add_argument("spec", help="path to tournament spec JSON")
    p_sprt.add_argument(
        "--elo0",
        type=float,
        default=0.0,
        help="H0 Elo bound (regression hypothesis). Default: 0.",
    )
    p_sprt.add_argument(
        "--elo1",
        type=float,
        default=5.0,
        help="H1 Elo bound (improvement hypothesis). Default: +5.",
    )
    p_sprt.add_argument(
        "--alpha",
        type=float,
        default=0.05,
        help="Type I error rate. Default: 0.05.",
    )
    p_sprt.add_argument(
        "--beta",
        type=float,
        default=0.05,
        help="Type II error rate. Default: 0.05.",
    )
    p_sprt.add_argument(
        "--max-games",
        type=int,
        default=1000,
        help="Maximum games per pair before INCONCLUSIVE. Default: 1000.",
    )
    p_sprt.set_defaults(func=cmd_sprt)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
