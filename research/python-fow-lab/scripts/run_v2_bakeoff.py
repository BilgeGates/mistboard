"""v2 (EngineV2) vs v0.9.5 (Tier-1) production bakeoff runner.

Sharded via ``--start-index`` (modeled on scripts/run_bakeoff.py). Each
game runs in its own subprocess for crash + memory isolation. Per-game
results stream to a shard jsonl log; per-game events stream straight to
``<out>/games/<game_id>.jsonl`` (viewer-compatible). Resume is automatic:
games whose game_ids already appear in the shard log are skipped.

Operational guards:
  - Per-game subprocess: crash/OOM in one game doesn't kill the shard.
  - Per-game timeout: parent kills + logs if the game exceeds
    ``--per-game-timeout`` (default 1800s = 30 min).
  - |P| soft-cap (default 1,000,000 via ``--v2-p-max``; pass 0 for truly
    uncapped at your own OOM risk).
  - Peak RSS captured per game via the subprocess's ``resource.getrusage``.
  - Idempotent resume: re-running with the same ``--out-dir`` skips
    already-logged game_ids.

Output layout::

    <out-dir>/
    ├── spec.json              # bakeoff settings (one per shard, identical)
    ├── shard-NN.jsonl         # one line per game (result + RSS + timings)
    ├── games/
    │   └── game-NNNN-{W|L|D}-tier1-{white|black}.jsonl   # viewer-compatible
    └── manifest.json          # written at shard end; merge across shards post-hoc

Usage (single shard):
    PYTHONPATH=src python scripts/run_v2_bakeoff.py \\
        --out-dir lab/runs/v2-vs-v095-baseline-2026-05-24 \\
        --games 50 --start-index 0 \\
        --v2-iters 500 --v2-i 32 \\
        --shard-id 0

Multi-shard: launch N processes with disjoint --start-index ranges (see
scripts/launch_v2_bakeoff.sh).
"""

from __future__ import annotations

import argparse
import json
import os
import resource
import shutil
import subprocess
import sys
import time
from pathlib import Path

import chess

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

# Worker mode imports the heavy engine modules. Orchestrator mode doesn't
# need them, so defer.

_TIER1_CONFIG = ROOT / "configs" / "tier1-v1.json"


def _color_label(c: chess.Color) -> str:
    return "white" if c == chess.WHITE else "black"


def _outcome_letter(result_winner: str | None, subject_color: chess.Color) -> str:
    """v2-centric W/L/D. W = v2 won, L = v0.9.5 won, D = draw."""
    if result_winner is None:
        return "D"
    subject_label = "white" if subject_color == chess.WHITE else "black"
    return "W" if result_winner == subject_label else "L"


# ---------------------------------------------------------------------------
# Worker mode: play ONE game in this process, print JSON to stdout, exit.
# ---------------------------------------------------------------------------


def _events_to_jsonl(events: list, room_id: str, variant: str) -> str:
    """Render events as JSONL matching the bakeoff viewer's schema.
    Mirrors scripts/bakeoff_publish_to_viewer.py:_events_to_jsonl so the
    output drops directly into apps/web/public/-style viewer dirs."""
    lines: list[str] = []
    has_room_created = False
    for event in events:
        if event.get("type") == "room-created":
            event = {**event, "variant": variant}
            has_room_created = True
        lines.append(json.dumps(event, separators=(",", ":")))
    if not has_room_created:
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


def _peak_rss_mb() -> float:
    """Peak RSS for this process, in MB. ru_maxrss is bytes on macOS,
    kilobytes on Linux — normalize."""
    ru = resource.getrusage(resource.RUSAGE_SELF)
    if sys.platform == "darwin":
        return ru.ru_maxrss / (1024 * 1024)
    return ru.ru_maxrss / 1024


def _play_one_in_process(args: argparse.Namespace) -> int:
    """Worker entry point. Plays exactly one game, writes its event jsonl
    to <out-dir>/games/, prints a single JSON line to stdout, exits.

    Communication contract with the parent:
      - stdout: exactly one JSON object on the last line (the result row)
      - stderr: free-form logs; not parsed
      - exit code: 0 success, 1 internal error
    """
    from fow_chess.engine_v2 import EngineV2Strategy
    from fow_chess.selfplay import play_game
    from fow_chess.tournament.config import load_config
    from fow_chess.tournament.runtime import bot_runtime

    out_dir = Path(args.out_dir)
    games_dir = out_dir / "games"
    games_dir.mkdir(parents=True, exist_ok=True)

    game_idx = args.game_idx
    v2_color = chess.WHITE if game_idx % 2 == 0 else chess.BLACK
    seed = args.base_seed + game_idx

    v2 = EngineV2Strategy(
        seed=seed + 7,
        iterations=args.v2_iters,
        i_sample_size=args.v2_i,
        time_budget_seconds=args.v2_time_budget if args.v2_time_budget > 0 else None,
        p_max_size=args.v2_p_max if args.v2_p_max > 0 else None,
        capture_telemetry=True,
        kluss_k=args.v2_kluss_k if args.v2_kluss_k > 0 else None,
    )
    config = load_config(_TIER1_CONFIG)
    runtime_cm = bot_runtime(config, stockfish_path=args.stockfish)
    factory = runtime_cm.__enter__()
    v095 = factory(seed)

    try:
        white_s = v2 if v2_color == chess.WHITE else v095
        black_s = v095 if v2_color == chess.WHITE else v2
        room_id = f"v2bakeoff-g{game_idx:04d}"

        t0 = time.monotonic()
        result = play_game(
            white_s, black_s,
            max_plies=args.max_plies,
            room_id=room_id,
            seed=seed,
        )
        wall = time.monotonic() - t0

        outcome = _outcome_letter(result.winner, v2_color)
        game_filename = f"game-{game_idx:04d}-{outcome}-tier1-{_color_label(v2_color)}.jsonl"
        game_path = games_dir / game_filename
        game_path.write_text(_events_to_jsonl(result.events, room_id, "dark-chess"))

        # Dump per-ply telemetry alongside the game events. One row per
        # observe_*/pick_move call captured by EngineV2Strategy. Makes
        # post-mortem on |P| trajectory + per-ply wall possible without
        # re-running the game.
        perply_filename = f"game-{game_idx:04d}-perply.jsonl"
        perply_path = games_dir / perply_filename
        with perply_path.open("w") as pf:
            for row in v2.telemetry:
                pf.write(json.dumps(row, separators=(",", ":")) + "\n")

        # |P| explosion early-warning: surface the peak |P| seen this
        # game. Easier than greping the perply jsonl after the fact.
        p_peak = max((row.get("p_post", 0) for row in v2.telemetry), default=0)
        p_pick_max = max(
            (row.get("p_pre", 0) for row in v2.telemetry if row.get("kind") == "pick_move"),
            default=0,
        )

        record = {
            "game_idx": game_idx,
            "game_id": room_id,
            "v2_color": _color_label(v2_color),
            "outcome": outcome,
            "winner": result.winner,
            "end_reason": result.end_reason,
            "plies": result.plies,
            "truncated": result.truncated,
            "wall_seconds": round(wall, 2),
            "peak_rss_mb": round(_peak_rss_mb(), 1),
            "p_peak": p_peak,
            "p_peak_at_pick": p_pick_max,
            "seed_v2": seed + 7,
            "seed_v095": seed,
            "game_path": f"games/{game_filename}",
            "perply_path": f"games/{perply_filename}",
        }
        # Single-line JSON on the LAST stdout line is the parent's contract.
        sys.stdout.write(json.dumps(record) + "\n")
        sys.stdout.flush()
        return 0
    finally:
        try:
            v2.close()
        finally:
            runtime_cm.__exit__(None, None, None)


# ---------------------------------------------------------------------------
# Orchestrator mode: spawn one subprocess per game in this shard's range.
# ---------------------------------------------------------------------------


def _load_completed_game_ids(out_dir: Path) -> set[str]:
    """Resume support: scan ALL shard-*.jsonl files in ``out_dir`` and
    return the set of game_ids whose lines parse cleanly. Partial /
    errored entries are also counted as "done" — we won't auto-retry
    them; the operator decides.

    Global (across all shards), not per-shard: a ladder rung can
    re-assign game indices to different shards (rung 1 → 4 shards × 1
    game each; rung 2 → 4 shards × 2 games each shifts shard
    membership). Per-shard resume would re-run games already completed
    by a different shard. Global resume skips correctly across rungs."""
    done: set[str] = set()
    for shard_log in sorted(out_dir.glob("shard-*.jsonl")):
        with shard_log.open() as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                gid = row.get("game_id")
                if gid:
                    done.add(gid)
    return done


def _spawn_game(
    *, game_idx: int, base_args: argparse.Namespace, timeout_s: float
) -> dict:
    """Spawn one subprocess to play one game. Returns the parsed JSON
    record on success, or an error dict on crash/timeout."""
    game_id = f"v2bakeoff-g{game_idx:04d}"
    cmd = [
        sys.executable,
        str(Path(__file__).resolve()),
        "--play-one",
        "--game-idx", str(game_idx),
        "--out-dir", str(base_args.out_dir),
        "--max-plies", str(base_args.max_plies),
        "--v2-iters", str(base_args.v2_iters),
        "--v2-i", str(base_args.v2_i),
        "--v2-time-budget", str(base_args.v2_time_budget),
        "--v2-p-max", str(base_args.v2_p_max),
        "--base-seed", str(base_args.base_seed),
        "--stockfish", base_args.stockfish,
    ]
    env = os.environ.copy()
    env["PYTHONPATH"] = f"{SRC}:{env.get('PYTHONPATH', '')}"

    t0 = time.monotonic()
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_s,
            env=env,
        )
    except subprocess.TimeoutExpired as e:
        return {
            "game_idx": game_idx,
            "game_id": game_id,
            "error": f"timeout after {timeout_s}s",
            "wall_seconds": round(time.monotonic() - t0, 2),
            "stdout_tail": (e.stdout or b"")[-2000:].decode("utf-8", "replace") if e.stdout else "",
            "stderr_tail": (e.stderr or b"")[-2000:].decode("utf-8", "replace") if e.stderr else "",
        }

    if proc.returncode != 0:
        return {
            "game_idx": game_idx,
            "game_id": game_id,
            "error": f"exit {proc.returncode}",
            "wall_seconds": round(time.monotonic() - t0, 2),
            "stdout_tail": proc.stdout[-2000:],
            "stderr_tail": proc.stderr[-2000:],
        }

    # Parse the LAST non-empty stdout line as the result record.
    last_line = ""
    for line in proc.stdout.splitlines():
        line = line.strip()
        if line:
            last_line = line
    try:
        record = json.loads(last_line)
    except json.JSONDecodeError:
        return {
            "game_idx": game_idx,
            "game_id": game_id,
            "error": "bad worker stdout (could not parse final JSON line)",
            "wall_seconds": round(time.monotonic() - t0, 2),
            "stdout_tail": proc.stdout[-2000:],
            "stderr_tail": proc.stderr[-2000:],
        }
    return record


def _write_spec(out_dir: Path, args: argparse.Namespace) -> None:
    """Per-shard spec.json — same content across shards of one bakeoff.
    Last writer wins, which is fine since it's deterministic from args."""
    spec_path = out_dir / "spec.json"
    spec = {
        "kind": "v2-vs-v095",
        "max_plies": args.max_plies,
        "v2_iters": args.v2_iters,
        "v2_i": args.v2_i,
        "v2_time_budget": args.v2_time_budget,
        "v2_p_max": args.v2_p_max,
        "base_seed": args.base_seed,
        "stockfish": args.stockfish,
        "per_game_timeout": args.per_game_timeout,
    }
    spec_path.write_text(json.dumps(spec, indent=2))


def _write_manifest(out_dir: Path, args: argparse.Namespace) -> None:
    """Rebuild manifest.json from all shard logs. Idempotent — call at
    end of each shard; the last finisher wins and includes everyone's
    games. Compatible with apps/web bakeoff viewer.

    Cross-shard dedup by game_idx: if the same game ran in multiple
    shards (e.g., from a pre-fix ladder rung re-assignment), the LAST
    entry across the sorted-shard-log scan wins. Higher-shard-id
    overrides lower for a given game_idx — a deterministic tie-break."""
    by_idx: dict[int, dict] = {}
    for shard_log in sorted(out_dir.glob("shard-*.jsonl")):
        with shard_log.open() as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if "error" in row:
                    continue
                by_idx[row["game_idx"]] = row

    games_for_manifest: list[dict] = []
    record = {"wins": 0, "losses": 0, "draws": 0}
    for idx in sorted(by_idx):
        row = by_idx[idx]
        outcome = row.get("outcome", "D")
        if outcome == "W":
            record["wins"] += 1
        elif outcome == "L":
            record["losses"] += 1
        else:
            record["draws"] += 1
        games_for_manifest.append({
            "index": row["game_idx"],
            "tier1_color": row["v2_color"],
            "outcome": outcome,
            "plies": row.get("plies", 0),
            "end_reason": row.get("end_reason", "unknown"),
            "truncated": row.get("truncated", False),
            "tier1_seed": row.get("seed_v2"),
            "random_seed": row.get("seed_v095"),
            "path": row["game_path"],
        })

    manifest = {
        "tier1_version": "engine-v2 (rust-port 551cbaf)",
        "tier1_commit": "current-src-fow-chess",
        "opponent": "v0.9.5-equivalent",
        "evaluator": "stockfish",
        "depth": -1,
        "max_particles": args.v2_p_max,
        "target_n": args.v2_i,
        "risk_aversion": 0.0,
        "verbose_belief": False,
        "threat_lambda": 0.0,
        "max_plies": args.max_plies,
        "base_seed": args.base_seed,
        "games_total": len(games_for_manifest),
        "games_saved": len(games_for_manifest),
        "save_only": "all",
        "tier1_record": record,
        "games": games_for_manifest,
        "v2_iters": args.v2_iters,
        "v2_i_sample": args.v2_i,
        "v2_time_budget": args.v2_time_budget,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))


def _run_orchestrator(args: argparse.Namespace) -> int:
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    _write_spec(out_dir, args)

    shard_log = out_dir / f"shard-{args.shard_id:02d}.jsonl"
    completed = _load_completed_game_ids(out_dir)

    start = args.start_index
    target = start + args.games
    print(
        f"v2 bakeoff shard {args.shard_id:02d}: games [{start}, {target}) "
        f"v2-iters={args.v2_iters} |I|={args.v2_i} p_max={args.v2_p_max} "
        f"per-game-timeout={args.per_game_timeout}s out={out_dir}",
        flush=True,
    )
    if completed:
        print(f"  resume: {len(completed)} game(s) already in shard log; skipping", flush=True)

    skipped = 0
    completed_now = 0
    errors_now = 0
    t_start = time.monotonic()
    with shard_log.open("a") as log_fh:
        for game_idx in range(start, target):
            game_id = f"v2bakeoff-g{game_idx:04d}"
            if game_id in completed:
                skipped += 1
                continue
            t_game = time.monotonic()
            row = _spawn_game(
                game_idx=game_idx, base_args=args, timeout_s=args.per_game_timeout
            )
            log_fh.write(json.dumps(row) + "\n")
            log_fh.flush()
            if "error" in row:
                errors_now += 1
                print(
                    f"  g{game_idx:04d} ERROR {row['error']} "
                    f"({time.monotonic() - t_game:.1f}s)",
                    flush=True,
                )
            else:
                completed_now += 1
                print(
                    f"  g{game_idx:04d} {row['outcome']} "
                    f"{row['end_reason']:18s} plies={row['plies']:3d} "
                    f"wall={row['wall_seconds']:6.1f}s "
                    f"rss={row['peak_rss_mb']:6.0f}MB "
                    f"|P|peak={row.get('p_peak', 0):>7d}",
                    flush=True,
                )

    total_wall = time.monotonic() - t_start
    print(
        f"\nshard {args.shard_id:02d} done: "
        f"{completed_now} completed, {errors_now} errors, "
        f"{skipped} pre-existing in {total_wall:.0f}s",
        flush=True,
    )
    _write_manifest(out_dir, args)
    print(f"manifest: {out_dir / 'manifest.json'}", flush=True)
    return 0 if errors_now == 0 else 3


# ---------------------------------------------------------------------------
# CLI entry
# ---------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--play-one", action="store_true",
                    help="worker mode: play exactly one game, print JSON, exit")
    ap.add_argument("--game-idx", type=int,
                    help="(worker) which game index to play")
    ap.add_argument("--out-dir", required=True,
                    help="bakeoff output directory (shared by all shards of one bakeoff)")
    ap.add_argument("--games", type=int, default=1,
                    help="(orchestrator) number of games for this shard")
    ap.add_argument("--start-index", type=int, default=0,
                    help="(orchestrator) global game-index for this shard's first game")
    ap.add_argument("--shard-id", type=int, default=0,
                    help="(orchestrator) shard identifier (used in shard log filename)")
    ap.add_argument("--max-plies", type=int, default=160)
    ap.add_argument("--v2-iters", type=int, default=500)
    ap.add_argument("--v2-i", type=int, default=32,
                    help="|I| sample size from P per v2 move")
    ap.add_argument("--v2-time-budget", type=float, default=5.0,
                    help="per-move wall budget for v2 (seconds); 0 = unlimited")
    ap.add_argument("--v2-p-max", type=int, default=1_000_000,
                    help="cap on PEnumerator |P| (0 = truly uncapped — OOM risk)")
    ap.add_argument("--v2-kluss-k", type=int, default=0,
                    help="KLUSS k-restriction for GT-CFR subgame (0 = off; 2 = Obscuro's choice)")
    ap.add_argument("--base-seed", type=int, default=12345)
    ap.add_argument("--stockfish", default="stockfish")
    ap.add_argument("--per-game-timeout", type=float, default=1800.0,
                    help="(orchestrator) seconds before killing a hung game")
    args = ap.parse_args()

    if args.play_one:
        if args.game_idx is None:
            print("ERROR: --game-idx required with --play-one", file=sys.stderr)
            return 2
        return _play_one_in_process(args)

    if shutil.which(args.stockfish) is None:
        print(f"ERROR: stockfish binary not found ({args.stockfish!r})", file=sys.stderr)
        return 2
    return _run_orchestrator(args)


if __name__ == "__main__":
    raise SystemExit(main())
