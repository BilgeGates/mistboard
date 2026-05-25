"""Cap-probe: sweep --v2-p-max values on the same seed(s) to measure
the tradeoff between peak |P|, peak RSS, wall time, and outcome.

Single-seed first pass: 4 cap values run sequentially. Each game gets
its own output dir (so resume doesn't conflate runs at different
caps). Aggregates per-game records + per-ply telemetry into a CSV at
the end.

Output layout::

    <out-base>/
    ├── results.csv              # one row per (seed, cap, ply) for analysis
    ├── summary.csv              # one row per (seed, cap) — peak |P|, wall, outcome
    └── cap-{NAME}-seed-{N}/     # per-run output dir (same layout as runner)
        ├── manifest.json
        ├── shard-00.jsonl
        └── games/

Usage::

    PYTHONPATH=src .venv/bin/python scripts/probe_p_cap.py \\
        --out-base lab/runs/p-cap-probe-2026-05-24 \\
        --seeds 42 \\
        --caps 1000000 5000000 10000000 0

  cap=0 means truly uncapped — OOM risk; this script runs uncapped
  runs SEQUENTIALLY and aborts the sweep if one OOMs.

Note: each run uses 1 shard with 1 game (no parallel shards in this
script — keep the memory footprint to a single game at a time so the
larger-cap runs have headroom).
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _run_one(
    out_dir: Path,
    seed: int,
    cap: int,
    *,
    v2_iters: int,
    v2_i: int,
    v2_time_budget: float,
    max_plies: int,
    per_game_timeout: float,
    stockfish: str,
    python: str,
) -> dict:
    """Run a single game at a specific (seed, cap); return per-game record."""
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        python, "-u",
        str(ROOT / "scripts" / "run_v2_bakeoff.py"),
        "--out-dir", str(out_dir),
        "--shard-id", "0",
        "--games", "1",
        "--start-index", "0",
        "--max-plies", str(max_plies),
        "--v2-iters", str(v2_iters),
        "--v2-i", str(v2_i),
        "--v2-time-budget", str(v2_time_budget),
        "--v2-p-max", str(cap),
        "--base-seed", str(seed),
        "--stockfish", stockfish,
        "--per-game-timeout", str(per_game_timeout),
    ]
    env = {"PYTHONPATH": str(ROOT / "src")}
    import os
    full_env = os.environ.copy()
    full_env.update(env)
    t0 = time.monotonic()
    proc = subprocess.run(cmd, capture_output=True, text=True, env=full_env)
    wall = time.monotonic() - t0

    # Read the shard log (1 game = 1 line)
    shard_log = out_dir / "shard-00.jsonl"
    if not shard_log.exists():
        return {
            "seed": seed, "cap": cap, "outcome": "NO_OUTPUT",
            "wall_seconds": round(wall, 2),
            "stdout_tail": proc.stdout[-2000:],
            "stderr_tail": proc.stderr[-2000:],
        }
    last_row = None
    for line in shard_log.read_text().splitlines():
        if line.strip():
            last_row = json.loads(line)
    if last_row is None:
        return {
            "seed": seed, "cap": cap, "outcome": "EMPTY_LOG",
            "wall_seconds": round(wall, 2),
        }
    last_row.setdefault("seed_input", seed)
    last_row.setdefault("cap_input", cap)
    last_row.setdefault("sweep_wall_seconds", round(wall, 2))
    return last_row


def _load_perply_peak(out_dir: Path) -> tuple[int, int, int]:
    """Find the per-ply jsonl for the (single) game in this out_dir
    and return (peak_pre_cap, peak_raw, downsample_count)."""
    games_dir = out_dir / "games"
    if not games_dir.exists():
        return (0, 0, 0)
    perply_files = list(games_dir.glob("*-perply.jsonl"))
    if not perply_files:
        return (0, 0, 0)
    peak_pre_cap = 0
    peak_raw = 0
    downsample_count = 0
    for fp in perply_files:
        for line in fp.read_text().splitlines():
            if not line.strip():
                continue
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            if r.get("kind") in ("observe_own_move", "observe_opp_move"):
                peak_pre_cap = max(peak_pre_cap, int(r.get("p_pre_cap", 0)))
                peak_raw = max(peak_raw, int(r.get("p_raw", 0)))
                if r.get("downsampled"):
                    downsample_count += 1
    return (peak_pre_cap, peak_raw, downsample_count)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out-base", required=True,
                    help="Base output dir; one subdir per (seed, cap) run")
    ap.add_argument("--seeds", type=int, nargs="+", default=[42])
    ap.add_argument("--caps", type=int, nargs="+",
                    default=[1_000_000, 5_000_000, 10_000_000, 0])
    ap.add_argument("--v2-iters", type=int, default=500)
    ap.add_argument("--v2-i", type=int, default=32)
    ap.add_argument("--v2-time-budget", type=float, default=5.0)
    ap.add_argument("--max-plies", type=int, default=160)
    ap.add_argument("--per-game-timeout", type=float, default=3600.0)
    ap.add_argument("--stockfish", default="stockfish")
    ap.add_argument("--python", default=".venv/bin/python3")
    args = ap.parse_args()

    out_base = Path(args.out_base)
    out_base.mkdir(parents=True, exist_ok=True)

    summary_rows: list[dict] = []
    print(f"cap-probe: {len(args.seeds)} seeds × {len(args.caps)} caps "
          f"= {len(args.seeds) * len(args.caps)} runs", flush=True)
    print(f"  iters={args.v2_iters} |I|={args.v2_i} budget={args.v2_time_budget}s "
          f"max_plies={args.max_plies}", flush=True)
    print(f"  out={out_base}", flush=True)
    print()

    for seed in args.seeds:
        for cap in args.caps:
            cap_label = "uncapped" if cap == 0 else f"{cap // 1_000_000}M"
            run_dir = out_base / f"cap-{cap_label}-seed-{seed}"
            t0 = time.monotonic()
            record = _run_one(
                run_dir, seed, cap,
                v2_iters=args.v2_iters,
                v2_i=args.v2_i,
                v2_time_budget=args.v2_time_budget,
                max_plies=args.max_plies,
                per_game_timeout=args.per_game_timeout,
                stockfish=args.stockfish,
                python=args.python,
            )
            wall = time.monotonic() - t0
            peak_pre_cap, peak_raw, dsamples = _load_perply_peak(run_dir)
            row = {
                "seed": seed,
                "cap": cap,
                "cap_label": cap_label,
                "outcome": record.get("outcome", record.get("error", "?")),
                "end_reason": record.get("end_reason", record.get("error", "?")),
                "plies": record.get("plies", 0),
                "wall_seconds": round(wall, 1),
                "game_wall_seconds": record.get("wall_seconds", 0),
                "peak_rss_mb": record.get("peak_rss_mb", 0),
                "p_peak_post_cap": record.get("p_peak", 0),
                "p_peak_pre_cap": peak_pre_cap,
                "p_peak_raw_pre_dedup": peak_raw,
                "downsample_events": dsamples,
            }
            summary_rows.append(row)
            print(
                f"  seed={seed} cap={cap_label:>9s} "
                f"{row['outcome']:<3s} plies={row['plies']:>3d} "
                f"wall={row['wall_seconds']:>5.0f}s "
                f"rss={row['peak_rss_mb']:>5.0f}MB "
                f"|P|_pre_cap={peak_pre_cap:>10,d} "
                f"|P|_post_cap={row['p_peak_post_cap']:>10,d} "
                f"dsamples={dsamples}",
                flush=True,
            )
            # Bail on OOM-like failures so we don't pile up runs that all crash
            if row["outcome"] in ("NO_OUTPUT", "EMPTY_LOG", "?"):
                print(f"    bailing — abnormal outcome", flush=True)
                break

    # Write summary CSV
    summary_csv = out_base / "summary.csv"
    if summary_rows:
        with summary_csv.open("w") as f:
            w = csv.DictWriter(f, fieldnames=list(summary_rows[0].keys()))
            w.writeheader()
            w.writerows(summary_rows)
        print(f"\nwrote summary: {summary_csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
