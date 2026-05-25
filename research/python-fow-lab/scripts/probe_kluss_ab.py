"""A/B probe: solve_multiroot_growing_subgame with kluss_k=2 vs kluss_k=0.

Same seeds run under both conditions. Compares:
  - Outcomes (W/L/D per seed under each condition)
  - Per-game wall
  - Peak RSS
  - Peak |P|

What we WISH we could measure (but don't yet):
  - CFR tree size at each pick_move call under each condition
    (would need to wire per-ply tree size into the existing
    telemetry; defer)

Each (seed, condition) run is one game in its own out-dir so the
existing runner's resume logic doesn't conflate them.

Usage::

    PYTHONPATH=src .venv/bin/python scripts/probe_kluss_ab.py \\
        --out-base lab/runs/kluss-ab-2026-05-24 \\
        --seeds 2026540 2026541 2026544 2026545

  Each seed runs twice (k=0 baseline, k=2 KLUSS). 4 seeds = 8 games.
  Sequential; ~5-15 min per game = 40-120 min total wall.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _run_one(
    out_dir: Path,
    *,
    seed: int,
    kluss_k: int,
    v2_iters: int,
    v2_i: int,
    v2_time_budget: float,
    v2_p_max: int,
    max_plies: int,
    per_game_timeout: float,
    stockfish: str,
    python: str,
) -> dict:
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
        "--v2-p-max", str(v2_p_max),
        "--base-seed", str(seed),
        "--stockfish", stockfish,
        "--per-game-timeout", str(per_game_timeout),
        "--v2-kluss-k", str(kluss_k),
    ]
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    t0 = time.monotonic()
    proc = subprocess.run(cmd, capture_output=True, text=True, env=env)
    wall = time.monotonic() - t0

    shard_log = out_dir / "shard-00.jsonl"
    if not shard_log.exists():
        return {"seed": seed, "kluss_k": kluss_k, "outcome": "NO_OUTPUT",
                "wall_seconds": round(wall, 2),
                "stderr_tail": proc.stderr[-1500:]}
    last = None
    for line in shard_log.read_text().splitlines():
        if line.strip():
            last = json.loads(line)
    if last is None:
        return {"seed": seed, "kluss_k": kluss_k, "outcome": "EMPTY_LOG"}
    last.setdefault("seed_input", seed)
    last.setdefault("kluss_k_input", kluss_k)
    last.setdefault("sweep_wall_seconds", round(wall, 2))
    return last


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out-base", required=True)
    ap.add_argument("--seeds", type=int, nargs="+", required=True)
    ap.add_argument("--v2-iters", type=int, default=500)
    ap.add_argument("--v2-i", type=int, default=32)
    ap.add_argument("--v2-time-budget", type=float, default=5.0)
    ap.add_argument("--v2-p-max", type=int, default=5_000_000)
    ap.add_argument("--max-plies", type=int, default=160)
    ap.add_argument("--per-game-timeout", type=float, default=1800.0)
    ap.add_argument("--stockfish", default="stockfish")
    ap.add_argument("--python", default=".venv/bin/python3")
    args = ap.parse_args()

    out_base = Path(args.out_base)
    out_base.mkdir(parents=True, exist_ok=True)

    print(f"kluss A/B probe: {len(args.seeds)} seeds × 2 conditions = "
          f"{len(args.seeds) * 2} runs", flush=True)
    print(f"  v2-iters={args.v2_iters} |I|={args.v2_i} "
          f"budget={args.v2_time_budget}s p_max={args.v2_p_max}", flush=True)
    print()

    rows: list[dict] = []
    for seed in args.seeds:
        for kluss_k in (0, 2):
            label = "k=0" if kluss_k == 0 else "k=2"
            run_dir = out_base / f"seed-{seed}-kluss-{kluss_k}"
            t0 = time.monotonic()
            rec = _run_one(
                run_dir,
                seed=seed,
                kluss_k=kluss_k,
                v2_iters=args.v2_iters,
                v2_i=args.v2_i,
                v2_time_budget=args.v2_time_budget,
                v2_p_max=args.v2_p_max,
                max_plies=args.max_plies,
                per_game_timeout=args.per_game_timeout,
                stockfish=args.stockfish,
                python=args.python,
            )
            wall = time.monotonic() - t0
            row = {
                "seed": seed,
                "kluss_k": kluss_k,
                "outcome": rec.get("outcome", rec.get("error", "?")),
                "end_reason": rec.get("end_reason", rec.get("error", "?")),
                "plies": rec.get("plies", 0),
                "wall_seconds": round(wall, 1),
                "game_wall_seconds": rec.get("wall_seconds", 0),
                "peak_rss_mb": rec.get("peak_rss_mb", 0),
                "p_peak": rec.get("p_peak", 0),
            }
            rows.append(row)
            print(
                f"  seed={seed} {label}  {row['outcome']:<3s} "
                f"plies={row['plies']:>3d} "
                f"wall={row['wall_seconds']:>5.0f}s "
                f"rss={row['peak_rss_mb']:>5.0f}MB "
                f"|P|={row['p_peak']:>9,d}",
                flush=True,
            )

    # Pair-aligned comparison
    print()
    print("=== A/B by seed ===")
    seeds_seen = sorted(set(r["seed"] for r in rows))
    for seed in seeds_seen:
        k0 = next((r for r in rows if r["seed"] == seed and r["kluss_k"] == 0), None)
        k2 = next((r for r in rows if r["seed"] == seed and r["kluss_k"] == 2), None)
        if k0 is None or k2 is None:
            continue
        print(f"  seed {seed}: k=0 → {k0['outcome']}/{k0['plies']}p/{k0['wall_seconds']:.0f}s "
              f"vs k=2 → {k2['outcome']}/{k2['plies']}p/{k2['wall_seconds']:.0f}s")

    summary_csv = out_base / "summary.csv"
    if rows:
        with summary_csv.open("w") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        print(f"\nwrote {summary_csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
